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
//    /v1/articles         → REST public API (futur)
// =====================================================================

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createHash } from "node:crypto";

import { verifyWebhook, handleWebhookEvent } from "@qoe/billing";
import { prisma } from "@qoe/db/client";

const app = new Hono<{
  Variables: {
    creator: any;
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

// ─── Webhooks ───────────────────────────────────────────────
app.post("/webhooks/stripe", async (c) => {
  const signature = c.req.header("stripe-signature");
  if (!signature) {
    return c.text("Missing signature", 400);
  }

  try {
    const rawBody = await c.req.text();
    const event = await verifyWebhook(rawBody, signature);
    await handleWebhookEvent(event);
    return c.text("Webhook processed successfully", 200);
  } catch (err: any) {
    console.error(`❌ Webhook Error: ${err.message}`);
    return c.text(`Webhook Error: ${err.message}`, 400);
  }
});

app.post("/webhooks/supabase", (c) => c.text("ok", 200));

// ─── API Auth Middleware ────────────────────────────────────
const apiAuth = async (c: any, next: any) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized: Missing or invalid token format" }, 401);
  }

  const token = authHeader.substring(7).trim();
  if (!token.startsWith("qoe_live_")) {
    return c.json({ error: "Unauthorized: Invalid API key prefix" }, 401);
  }

  // Hash the token using SHA-256 to compare with keyHash in DB
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
    if (user.apiAccessStatus !== "approved") {
      return c.json({ error: "Forbidden: API access has not been approved or is suspended" }, 403);
    }

    // Update lastUsedAt asynchronously
    prisma.apiKey.update({
      where: { id: apiKeyRecord.id },
      data: { lastUsedAt: new Date() },
    }).catch((err: any) => console.error("Failed to update lastUsedAt:", err));

    // Store user in context
    c.set("creator", user);
    await next();
  } catch (error) {
    console.error("API Auth Error:", error);
    return c.json({ error: "Internal Server Error" }, 500);
  }
};

// ─── Endpoints Creator API (v1) ──────────────────────────────

// Get articles list
app.get("/v1/articles", apiAuth, async (c) => {
  const creator = c.get("creator");
  
  // Parse query parameters
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

    // Format output
    const formattedArticles = articles.map(article => ({
      id: article.id,
      title: article.title,
      slug: article.slug,
      contentHtml: article.content, // HTML stored in DB
      readingTime: article.readingTime,
      isPremium: article.isPremium,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
      category: article.category,
    }));

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

// Get single article by slug
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

    return c.json({
      data: {
        id: article.id,
        title: article.title,
        slug: article.slug,
        contentHtml: article.content,
        readingTime: article.readingTime,
        isPremium: article.isPremium,
        createdAt: article.createdAt,
        updatedAt: article.updatedAt,
        category: article.category,
      },
    });
  } catch (error) {
    console.error("Error fetching single public article:", error);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

// Get creator categories
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

// Keep legacy routes for compatibility
app.get("/v1/users/:username", (c) =>
  c.json({ user: null, message: "Use Creator API routes" })
);

// ─── Démarrage ───────────────────────────────────────────────
const port = 3002;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`🔌 API server running on http://localhost:${info.port}`);
});
