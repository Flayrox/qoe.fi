// =====================================================================
// 🔌 API Server — apps/api (Hono)
// =====================================================================
// 📖 Hono est un framework web ultra-léger pour Node/Bun/Workers.
//    Plus rapide qu'Express, plus simple que Fastify, type-safe de base.
//
// 🎯 Endpoints prévus :
//    GET  /health          → health check
//    POST /webhooks/stripe → Stripe webhooks
//    POST /webhooks/supabase → Supabase auth webhooks
//    /trpc/*              → tRPC (type-safe API pour le front)
//    /v1/articles         → REST public API (avec tronquage paywall zero-leak)
// =====================================================================

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createHash } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { verifyWebhook, handleWebhookEvent } from "@qoe/billing";
import { prisma } from "@qoe/db/client";
import { sliceContentAtPaywall } from "@qoe/utils";
import { searchApp } from "./search";

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder"
);

const app = new Hono<{
  Variables: {
    creator: any;
    user: any;
  };
}>();

// ─── Middleware globaux ──────────────────────────────────────
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return "*";
      if (origin.endsWith(".localhost") || origin.endsWith(".qoe.test") || origin.endsWith(".lvh.me") || origin === "http://localhost" || origin === "http://qoe.test" || origin === "http://lvh.me" || origin.startsWith("http://localhost:")) {
        return origin;
      }
      // Production origins
      const allowedProdDomains = [
        "https://qoe.fi",
        "https://dashboard.qoe.fi",
        "https://admin.qoe.fi",
        "https://start.qoe.fi",
      ];
      if (allowedProdDomains.includes(origin) || /\.qoe\.fi$/.test(origin)) {
        return origin;
      }
      return "";
    },
    credentials: true,
  })
);

// ─── Health check ────────────────────────────────────────────
app.get("/health", (c) =>
  c.json({
    status: "ok",
    service: "qoe-api",
    timestamp: new Date().toISOString(),
  })
);

import { Queue } from "bullmq";
import IORedis from "ioredis";
import { fetchUmamiWebsiteStats, fetchUmamiTopPages } from "@qoe/analytics/server";

const stripeRedisConnection = new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
  lazyConnect: true,
  maxRetriesPerRequest: null,
});

const stripeQueue = new Queue("stripe-webhooks", { connection: stripeRedisConnection as any });

// ─── Webhooks ───────────────────────────────────────────────
app.post("/webhooks/stripe", async (c) => {
  const signature = c.req.header("stripe-signature");
  if (!signature) {
    return c.text("Missing signature", 400);
  }

  try {
    const rawBody = await c.req.text();
    const event = await verifyWebhook(rawBody, signature);

    // Async processing via BullMQ with jobId deduplication
    await stripeQueue.add(
      event.type,
      {
        eventId: event.id,
        eventType: event.type,
        data: event.data.object,
      },
      { jobId: event.id }
    );

    return c.text("Webhook queued successfully", 200);
  } catch (err: any) {
    console.error(`❌ Webhook Error: ${err.message}`);
    return c.text(`Webhook Error: ${err.message}`, 400);
  }
});

app.post("/webhooks/supabase", (c) => c.text("ok", 200));

// ─── API Auth Middleware (API Key qoe_live_...) ─────────────
const apiAuth = async (c: any, next: any) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized: Missing or invalid token format" }, 401);
  }

  const token = authHeader.substring(7).trim();
  if (!token.startsWith("qoe_live_")) {
    return c.json({ error: "Unauthorized: Invalid API key prefix" }, 401);
  }

  const hashedToken = createHash("sha256").update(token).digest("hex");

  try {
    const apiKeyRecord = await prisma.apiKey.findUnique({
      where: { keyHash: hashedToken },
      include: {
        user: true,
      },
    });

    if (!apiKeyRecord) {
      return c.json({ error: "Unauthorized: Invalid API key" }, 401);
    }

    const user = apiKeyRecord.user;

    prisma.apiKey.update({
      where: { id: apiKeyRecord.id },
      data: { lastUsedAt: new Date() },
    }).catch((err: any) => console.error("Failed to update lastUsedAt:", err));

    c.set("creator", user);
    await next();
  } catch (error) {
    console.error("API Auth Error:", error);
    return c.json({ error: "Internal Server Error" }, 500);
  }
};

// ─── Mobile User Auth Middleware (Supabase JWT Bearer) ──────
const userAuth = async (c: any, next: any) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized: Missing Authorization header" }, 401);
  }

  const token = authHeader.substring(7).trim();
  const { data: { user: authUser }, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !authUser) {
    return c.json({ error: "Unauthorized: Invalid or expired JWT token" }, 401);
  }

  const dbUser = await prisma.user.findFirst({
    where: {
      OR: [
        { id: authUser.id },
        { email: authUser.email || "" }
      ]
    }
  });

  if (!dbUser) {
    return c.json({ error: "Unauthorized: User not found in DB" }, 401);
  }

  c.set("user", dbUser);
  await next();
};

// ─── Endpoints Creator API (v1) ──────────────────────────────

app.get("/v1/articles", apiAuth, async (c) => {
  const creator = c.get("creator");
  
  const limit = Math.min(parseInt(c.req.query("limit") || "10", 10), 100);
  const page = Math.max(parseInt(c.req.query("page") || "1", 10), 1);
  const offset = (page - 1) * limit;
  const categorySlug = c.req.query("category");

  try {
    const whereClause: any = {
      authorId: creator.id,
      published: true,
    };

    if (categorySlug) {
      whereClause.category = {
        slug: categorySlug,
      };
    }

    const [articles, totalCount] = await Promise.all([
      prisma.article.findMany({
        where: whereClause,
        take: limit,
        skip: offset,
        orderBy: {
          createdAt: "desc",
        },
        include: {
          category: {
            select: {
              id: true,
              name: true,
              slug: true,
              description: true,
            },
          },
        },
      }),
      prisma.article.count({
        where: whereClause,
      }),
    ]);

    const formattedArticles = articles.map(article => {
      const cutResult = sliceContentAtPaywall(
        article.content,
        { isMember: false, isPaidSubscriber: false },
        article.visibility,
        article.tierId
      );

      return {
        id: article.id,
        title: article.title,
        slug: article.slug,
        contentHtml: cutResult.content,
        isTruncated: cutResult.isTruncated,
        visibility: article.visibility,
        readingTime: article.readingTime,
        isPremium: article.isPremium,
        createdAt: article.createdAt,
        updatedAt: article.updatedAt,
        category: article.category,
        paywallMeta: cutResult.paywallMeta,
      };
    });

    return c.json({
      data: formattedArticles,
      pagination: {
        total: totalCount,
        page,
        limit,
        pages: Math.ceil(totalCount / limit),
      },
    });
  } catch (error) {
    console.error("Error fetching public articles:", error);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

app.get("/v1/articles/:slug", apiAuth, async (c) => {
  const creator = c.get("creator");
  const slug = c.req.param("slug");

  try {
    const article = await prisma.article.findFirst({
      where: {
        authorId: creator.id,
        slug,
        published: true,
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
          },
        },
      },
    });

    if (!article) {
      return c.json({ error: "Article not found" }, 404);
    }

    const cutResult = sliceContentAtPaywall(
      article.content,
      { isMember: false, isPaidSubscriber: false },
      article.visibility,
      article.tierId
    );

    return c.json({
      data: {
        id: article.id,
        title: article.title,
        slug: article.slug,
        contentHtml: cutResult.content,
        isTruncated: cutResult.isTruncated,
        visibility: article.visibility,
        readingTime: article.readingTime,
        isPremium: article.isPremium,
        createdAt: article.createdAt,
        updatedAt: article.updatedAt,
        category: article.category,
        paywallMeta: cutResult.paywallMeta,
      },
    });
  } catch (error) {
    console.error("Error fetching single public article:", error);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

app.get("/v1/categories", apiAuth, async (c) => {
  const creator = c.get("creator");

  try {
    const categories = await prisma.category.findMany({
      where: {
        userId: creator.id,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        _count: {
          select: {
            articles: {
              where: {
                published: true,
              },
            },
          },
        },
      },
    });

    const formattedCategories = categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      articlesCount: cat._count.articles,
    }));

    return c.json({
      data: formattedCategories,
    });
  } catch (error) {
    console.error("Error fetching public categories:", error);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

app.get("/v1/analytics/stats", apiAuth, async (c) => {
  const creator = c.get("creator");
  const websiteId = creator.umamiWebsiteId || process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || "";
  const startAt = Number(c.req.query("startAt")) || Date.now() - 30 * 24 * 60 * 60 * 1000;
  const endAt = Number(c.req.query("endAt")) || Date.now();

  if (!websiteId) {
    return c.json({
      data: {
        stats: { pageviews: 0, visitors: 0, visits: 0, bounces: 0, totaltime: 0 },
        topPages: [],
      },
    });
  }

  const [stats, topPages] = await Promise.all([
    fetchUmamiWebsiteStats(websiteId, startAt, endAt),
    fetchUmamiTopPages(websiteId, startAt, endAt, 10),
  ]);

  return c.json({ data: { stats, topPages } });
});

// ─── Endpoints Mobile iOS/Android API (v1) ───────────────────

// Infinite Feed Endpoint
app.get("/v1/feed", async (c) => {
  const limit = Math.min(parseInt(c.req.query("limit") || "20", 10), 50);
  const cursor = c.req.query("cursor");

  try {
    const whereClause: any = {};
    if (cursor) {
      whereClause.createdAt = { lt: new Date(cursor) };
    }

    const posts = await prisma.thought.findMany({
      where: whereClause,
      take: limit + 1,
      orderBy: { createdAt: "desc" },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            username: true,
            subdomain: true,
            logoUrl: true,
            isCertified: true,
          },
        },
      },
    });

    let nextCursor: string | null = null;
    if (posts.length > limit) {
      const nextItem = posts.pop();
      nextCursor = nextItem?.createdAt ? new Date(nextItem.createdAt).toISOString() : null;
    }

    return c.json({
      data: {
        items: posts,
        nextCursor,
      },
    });
  } catch (error) {
    console.error("Error fetching mobile feed:", error);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

// Create Thought Micro-post Endpoint
app.post("/v1/thoughts", userAuth, async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}));

  if (!body.content || typeof body.content !== "string" || !body.content.trim()) {
    return c.json({ error: "Content is required" }, 400);
  }

  try {
    const newThought = await prisma.thought.create({
      data: {
        authorId: user.id,
        content: body.content.trim(),
        imageUrl: body.imageUrl || null,
        triggerWarning: body.triggerWarning || null,
        visibility: body.visibility || "public",
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            username: true,
            subdomain: true,
            logoUrl: true,
            isCertified: true,
          },
        },
      },
    });

    return c.json({ data: newThought }, 201);
  } catch (error) {
    console.error("Error creating thought:", error);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

// Toggle Like Endpoint
app.post("/v1/thoughts/:id/like", userAuth, async (c) => {
  const user = c.get("user");
  const thoughtId = c.req.param("id");

  try {
    const existingLike = await prisma.like.findFirst({
      where: {
        userId: user.id,
        postId: thoughtId,
      },
    });

    let liked = false;
    if (existingLike) {
      await prisma.like.delete({ where: { id: existingLike.id } });
    } else {
      await prisma.like.create({
        data: {
          userId: user.id,
          postId: thoughtId,
        },
      });
      liked = true;
    }

    const likesCount = await prisma.like.count({ where: { postId: thoughtId } });

    return c.json({ data: { liked, likesCount } });
  } catch (error) {
    console.error("Error toggling like:", error);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

// Toggle Repost Endpoint
app.post("/v1/thoughts/:id/repost", userAuth, async (c) => {
  const user = c.get("user");
  const thoughtId = c.req.param("id");

  try {
    const existingRepost = await prisma.thought.findFirst({
      where: {
        authorId: user.id,
        repostId: thoughtId,
      },
    });

    let reposted = false;
    if (existingRepost) {
      await prisma.thought.delete({ where: { id: existingRepost.id } });
    } else {
      await prisma.thought.create({
        data: {
          authorId: user.id,
          repostId: thoughtId,
          content: "",
        },
      });
      reposted = true;
    }

    const repostsCount = await prisma.thought.count({ where: { repostId: thoughtId } });

    return c.json({ data: { reposted, repostsCount } });
  } catch (error) {
    console.error("Error toggling repost:", error);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

// Toggle Bookmark Endpoint
app.post("/v1/thoughts/:id/bookmark", userAuth, async (c) => {
  const user = c.get("user");
  const targetId = c.req.param("id");

  try {
    const existingBookmark = await prisma.bookmark.findFirst({
      where: {
        readerId: user.id,
        articleId: targetId,
      },
    });

    let bookmarked = false;
    if (existingBookmark) {
      await prisma.bookmark.delete({ where: { id: existingBookmark.id } });
    } else {
      await prisma.bookmark.create({
        data: {
          readerId: user.id,
          articleId: targetId,
        },
      });
      bookmarked = true;
    }

    return c.json({ data: { bookmarked } });
  } catch (error) {
    console.error("Error toggling bookmark:", error);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

// Current User Profile Endpoint
app.get("/v1/users/me", userAuth, async (c) => {
  const user = c.get("user");

  try {
    const [followingCount, followersCount] = await Promise.all([
      prisma.follows.count({ where: { readerId: user.id } }),
      prisma.follows.count({ where: { creatorId: user.id } }),
    ]);

    return c.json({
      data: {
        ...user,
        stats: {
          followingCount,
          followersCount,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching my profile:", error);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

// Public User Profile Endpoint
app.get("/v1/users/:username", async (c) => {
  const username = c.req.param("username");

  try {
    const author = await prisma.user.findFirst({
      where: {
        OR: [
          { username },
          { subdomain: username },
        ],
      },
      select: {
        id: true,
        name: true,
        username: true,
        subdomain: true,
        heroText: true,
        logoUrl: true,
        headerImageUrl: true,
        isCertified: true,
        createdAt: true,
        _count: {
          select: {
            followers: true,
            following: true,
            posts: true,
            articles: { where: { published: true } },
          },
        },
      },
    });

    if (!author) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json({ data: author });
  } catch (error) {
    console.error("Error fetching author profile:", error);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

// Toggle Follow Endpoint
app.post("/v1/users/:id/follow", userAuth, async (c) => {
  const user = c.get("user");
  const targetUserId = c.req.param("id");

  if (user.id === targetUserId) {
    return c.json({ error: "You cannot follow yourself" }, 400);
  }

  try {
    const existingFollow = await prisma.follows.findFirst({
      where: {
        readerId: user.id,
        creatorId: targetUserId,
      },
    });

    let following = false;
    if (existingFollow) {
      await prisma.follows.delete({ where: { id: existingFollow.id } });
    } else {
      await prisma.follows.create({
        data: {
          readerId: user.id,
          creatorId: targetUserId,
        },
      });
      following = true;
    }

    const followersCount = await prisma.follows.count({ where: { creatorId: targetUserId } });

    return c.json({ data: { following, followersCount } });
  } catch (error) {
    console.error("Error toggling follow:", error);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});


app.route("/search", searchApp);

// ─── Démarrage ───────────────────────────────────────────────
const port = Number(process.env.PORT) || 3002;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`🔌 API server running on http://localhost:${info.port}`);
});

