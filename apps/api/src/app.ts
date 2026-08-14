// =====================================================================
// 🔌 API Server — apps/api (Hono) — App factory
// =====================================================================
// 📖 Separation of concerns:
//    - app.ts  : construit l'app Hono (routes, middleware) de façon
//                testable via l'injection de dépendances (DI).
//    - index.ts: bootstrappe le serveur (serve) avec les vraies dépendances.
//
// 🎯 Les tests importent `createApp` avec des dépendances mockées
//    (Prisma, Supabase, BullMQ) — aucune connexion réseau nécessaire.
// =====================================================================

import { Hono, type Context, type Next } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { createHash } from 'node:crypto';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

import { verifyWebhook as defaultVerifyWebhook } from '@qoe/billing';
import type Stripe from 'stripe';
import { prisma as defaultPrisma } from '@qoe/db/client';
import type { Prisma, User } from '@qoe/db/client';
import { sliceContentAtPaywall } from '@qoe/utils';
import { fetchUmamiWebsiteStats, fetchUmamiTopPages } from '@qoe/analytics/server';
import type { Queue, ConnectionOptions } from 'bullmq';
import { Queue as BullQueue } from 'bullmq';
import IORedis from 'ioredis';
import { logger } from '@qoe/observability';
import { createFlagsContext } from '@qoe/flags/server';
import type { FlagKey } from '@qoe/flags/server';
import { searchApp } from './search';

export type AppDeps = {
  stripeQueue?: Queue;
  supabaseAdmin?: SupabaseClient;
  prisma?: typeof defaultPrisma;
  verifyWebhook?: (rawBody: string, signature: string) => Promise<Stripe.Event>;
};

function defaultStripeQueue(): Queue {
  const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });
  return new BullQueue('stripe-webhooks', {
    connection: connection as unknown as ConnectionOptions,
  });
}

export type AppVariables = {
  creator: User;
  creatorPublication: {
    id: string;
    umamiWebsiteId: string | null;
  } | null;
  user: User;
  flags: FlagsContext;
};

export type FlagsContext = {
  isOn: (key: FlagKey) => boolean;
};

export function createApp(deps: AppDeps = {}): Hono<{ Variables: AppVariables }> {
  const stripeQueue = deps.stripeQueue ?? defaultStripeQueue();
  const supabaseAdmin =
    deps.supabaseAdmin ??
    createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        'placeholder'
    );
  const db = deps.prisma ?? defaultPrisma;
  const verifyWebhook = deps.verifyWebhook ?? defaultVerifyWebhook;

  const app = new Hono<{ Variables: AppVariables }>();

  // ─── Middleware globaux ──────────────────────────────────────
  app.use('*', honoLogger());
  app.use(
    '*',
    cors({
      origin: (origin) => {
        if (!origin) return '*';
        if (
          origin.endsWith('.localhost') ||
          origin.endsWith('.qoe.test') ||
          origin.endsWith('.lvh.me') ||
          origin === 'http://localhost' ||
          origin === 'http://qoe.test' ||
          origin === 'http://lvh.me' ||
          origin.startsWith('http://localhost:')
        ) {
          return origin;
        }
        // Production origins
        const allowedProdDomains = [
          'https://qoe.fi',
          'https://dashboard.qoe.fi',
          'https://admin.qoe.fi',
          'https://start.qoe.fi',
        ];
        if (allowedProdDomains.includes(origin) || /\.qoe\.fi$/.test(origin)) {
          return origin;
        }
        return '';
      },
      credentials: true,
    })
  );

  // ─── Feature flags (GrowthBook) ──────────────────────────────
  // 📖 Contexte flags par requête. Toutes les routes peuvent évaluer via
  //    c.get('flags').isOn('mon-flag'). Pour cibler par utilisateur, une
  //    route peut recréer un contexte : createFlagsContext({ userId, plan }).
  app.use('*', async (c, next) => {
    const flags = await createFlagsContext({
      tenant: c.req.header('x-tenant') || undefined,
      url: c.req.url,
      path: new URL(c.req.url).pathname,
    });
    c.set('flags', flags);
    await next();
  });

  // ─── Health check ────────────────────────────────────────────
  app.get('/health', (c) =>
    c.json({
      status: 'ok',
      service: 'qoe-api',
      timestamp: new Date().toISOString(),
    })
  );

  // ─── Webhooks ───────────────────────────────────────────────
  app.post('/webhooks/stripe', async (c) => {
    const signature = c.req.header('stripe-signature');
    if (!signature) {
      return c.text('Missing signature', 400);
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

      return c.text('Webhook queued successfully', 200);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      logger.error('Webhook Stripe invalide', { message }, { capture: true });
      return c.text(`Webhook Error: ${message}`, 400);
    }
  });

  app.post('/webhooks/supabase', (c) => c.text('ok', 200));

  // ─── API Auth Middleware (API Key qoe_live_...) ─────────────
  const apiAuth = async <P extends string>(
    c: Context<{ Variables: AppVariables }, P>,
    next: Next
  ) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized: Missing or invalid token format' }, 401);
    }

    const token = authHeader.substring(7).trim();
    if (!token.startsWith('qoe_live_')) {
      return c.json({ error: 'Unauthorized: Invalid API key prefix' }, 401);
    }

    const hashedToken = createHash('sha256').update(token).digest('hex');

    try {
      const apiKeyRecord = await db.apiKey.findUnique({
        where: { keyHash: hashedToken },
        include: {
          user: true,
        },
      });

      if (!apiKeyRecord) {
        return c.json({ error: 'Unauthorized: Invalid API key' }, 401);
      }

      const user = apiKeyRecord.user;

      db.apiKey
        .update({
          where: { id: apiKeyRecord.id },
          data: { lastUsedAt: new Date() },
        })
        .catch((err: unknown) => logger.error('Échec mise à jour lastUsedAt', { err }));

      c.set('creator', user);
      const publication = await db.publication.findFirst({
        where: { type: 'PERSONAL', user: { id: user.id } },
        select: { id: true, umamiWebsiteId: true },
      });
      c.set('creatorPublication', publication ?? null);
      await next();
    } catch (error) {
      logger.error('Erreur auth API key', { err: error }, { capture: true });
      return c.json({ error: 'Internal Server Error' }, 500);
    }
  };

  // ─── Mobile User Auth Middleware (Supabase JWT Bearer) ──────
  const userAuth = async <P extends string>(
    c: Context<{ Variables: AppVariables }, P>,
    next: Next
  ) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized: Missing Authorization header' }, 401);
    }

    const token = authHeader.substring(7).trim();
    const {
      data: { user: authUser },
      error,
    } = await supabaseAdmin.auth.getUser(token);

    if (error || !authUser) {
      return c.json({ error: 'Unauthorized: Invalid or expired JWT token' }, 401);
    }

    const dbUser = await db.user.findFirst({
      where: {
        OR: [{ id: authUser.id }, { email: authUser.email || '' }],
      },
    });

    if (!dbUser) {
      return c.json({ error: 'Unauthorized: User not found in DB' }, 401);
    }

    c.set('user', dbUser);
    await next();
  };

  // ─── Endpoints Creator API (v1) ──────────────────────────────

  app.get('/v1/articles', apiAuth, async (c) => {
    const creator = c.get('creator');

    const limit = Math.min(parseInt(c.req.query('limit') || '10', 10), 100);
    const page = Math.max(parseInt(c.req.query('page') || '1', 10), 1);
    const offset = (page - 1) * limit;
    const categorySlug = c.req.query('category');

    try {
      const whereClause: Prisma.ArticleWhereInput = {
        authorId: creator.id,
        published: true,
      };

      if (categorySlug) {
        whereClause.category = {
          slug: categorySlug,
        };
      }

      const [articles, totalCount] = await Promise.all([
        db.article.findMany({
          where: whereClause,
          take: limit,
          skip: offset,
          orderBy: {
            createdAt: 'desc',
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
        db.article.count({
          where: whereClause,
        }),
      ]);

      const formattedArticles = articles.map((article) => {
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
      logger.error('Erreur articles API créateur', { err: error }, { capture: true });
      return c.json({ error: 'Internal Server Error' }, 500);
    }
  });

  app.get('/v1/articles/:slug', apiAuth, async (c) => {
    const creator = c.get('creator');
    const slug = c.req.param('slug');

    try {
      const article = await db.article.findFirst({
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
        return c.json({ error: 'Article not found' }, 404);
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
      logger.error('Erreur article API créateur (slug)', { err: error }, { capture: true });
      return c.json({ error: 'Internal Server Error' }, 500);
    }
  });

  app.get('/v1/categories', apiAuth, async (c) => {
    const publication = c.get('creatorPublication');

    if (!publication) {
      return c.json({ error: 'Publication not found' }, 404);
    }

    try {
      const categories = await db.category.findMany({
        where: {
          publicationId: publication.id,
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

      const formattedCategories = categories.map((cat) => ({
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
      logger.error('Erreur catégories API créateur', { err: error }, { capture: true });
      return c.json({ error: 'Internal Server Error' }, 500);
    }
  });

  app.get('/v1/analytics/stats', apiAuth, async (c) => {
    const publication = c.get('creatorPublication');
    const websiteId = publication?.umamiWebsiteId || process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || '';
    const startAt = Number(c.req.query('startAt')) || Date.now() - 30 * 24 * 60 * 60 * 1000;
    const endAt = Number(c.req.query('endAt')) || Date.now();

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
  app.get('/v1/feed', async (c) => {
    const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 50);
    const cursor = c.req.query('cursor');

    try {
      const whereClause: Prisma.ThoughtWhereInput = {};
      if (cursor) {
        whereClause.createdAt = { lt: new Date(cursor) };
      }

      const posts = await db.thought.findMany({
        where: whereClause,
        take: limit + 1,
        orderBy: { createdAt: 'desc' },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              username: true,
              logoUrl: true,
              isCertified: true,
            },
          },
        },
      });

      // Pagination par curseur : on récupère limit+1 items pour savoir s'il y a
      // une page suivante, puis on renvoie les `limit` premiers. Le curseur est
      // le createdAt du DERNIER item RETOURNÉ (pas du pop) : sinon l'item
      // (limit+1)ème serait exclu par `createdAt < cursor` et perdu entre pages.
      const hasMore = posts.length > limit;
      const items = hasMore ? posts.slice(0, limit) : posts;
      const lastItem = items[items.length - 1];
      const nextCursor: string | null =
        hasMore && lastItem?.createdAt ? new Date(lastItem.createdAt).toISOString() : null;

      return c.json({
        data: {
          items,
          nextCursor,
        },
      });
    } catch (error) {
      logger.error('Erreur feed mobile', { err: error }, { capture: true });
      return c.json({ error: 'Internal Server Error' }, 500);
    }
  });

  // Create Thought Micro-post Endpoint
  app.post('/v1/thoughts', userAuth, async (c) => {
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({}));

    if (!body.content || typeof body.content !== 'string' || !body.content.trim()) {
      return c.json({ error: 'Content is required' }, 400);
    }

    try {
      const newThought = await db.thought.create({
        data: {
          authorId: user.id,
          content: body.content.trim(),
          imageUrl: body.imageUrl || null,
          triggerWarning: body.triggerWarning || null,
          visibility: body.visibility || 'public',
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              username: true,
              logoUrl: true,
              isCertified: true,
            },
          },
        },
      });

      return c.json({ data: newThought }, 201);
    } catch (error) {
      logger.error('Erreur création thought', { err: error }, { capture: true });
      return c.json({ error: 'Internal Server Error' }, 500);
    }
  });

  // Toggle Like Endpoint
  app.post('/v1/thoughts/:id/like', userAuth, async (c) => {
    const user = c.get('user');
    const thoughtId = c.req.param('id');

    try {
      const existingLike = await db.like.findFirst({
        where: {
          userId: user.id,
          postId: thoughtId,
        },
      });

      let liked = false;
      if (existingLike) {
        await db.like.delete({ where: { id: existingLike.id } });
      } else {
        await db.like.create({
          data: {
            userId: user.id,
            postId: thoughtId,
          },
        });
        liked = true;
      }

      const likesCount = await db.like.count({ where: { postId: thoughtId } });

      return c.json({ data: { liked, likesCount } });
    } catch (error) {
      logger.error('Erreur toggle like', { err: error }, { capture: true });
      return c.json({ error: 'Internal Server Error' }, 500);
    }
  });

  // Toggle Repost Endpoint
  app.post('/v1/thoughts/:id/repost', userAuth, async (c) => {
    const user = c.get('user');
    const thoughtId = c.req.param('id');

    try {
      const existingRepost = await db.thought.findFirst({
        where: {
          authorId: user.id,
          repostId: thoughtId,
        },
      });

      let reposted = false;
      if (existingRepost) {
        await db.thought.delete({ where: { id: existingRepost.id } });
      } else {
        await db.thought.create({
          data: {
            authorId: user.id,
            repostId: thoughtId,
            content: '',
          },
        });
        reposted = true;
      }

      const repostsCount = await db.thought.count({ where: { repostId: thoughtId } });

      return c.json({ data: { reposted, repostsCount } });
    } catch (error) {
      logger.error('Erreur toggle repost', { err: error }, { capture: true });
      return c.json({ error: 'Internal Server Error' }, 500);
    }
  });

  // Toggle Bookmark Endpoint
  app.post('/v1/thoughts/:id/bookmark', userAuth, async (c) => {
    const user = c.get('user');
    const targetId = c.req.param('id');

    try {
      const existingBookmark = await db.bookmark.findFirst({
        where: {
          readerId: user.id,
          articleId: targetId,
        },
      });

      let bookmarked = false;
      if (existingBookmark) {
        await db.bookmark.delete({ where: { id: existingBookmark.id } });
      } else {
        await db.bookmark.create({
          data: {
            readerId: user.id,
            articleId: targetId,
          },
        });
        bookmarked = true;
      }

      return c.json({ data: { bookmarked } });
    } catch (error) {
      logger.error('Erreur toggle bookmark', { err: error }, { capture: true });
      return c.json({ error: 'Internal Server Error' }, 500);
    }
  });

  // Current User Profile Endpoint
  app.get('/v1/users/me', userAuth, async (c) => {
    const user = c.get('user');

    try {
      const userPublication = await db.publication.findFirst({
        where: { type: 'PERSONAL', user: { id: user.id } },
        select: { id: true },
      });
      const [followingCount, followersCount] = await Promise.all([
        db.follows.count({ where: { readerId: user.id } }),
        db.follows.count({ where: { publicationId: userPublication?.id ?? '__none__' } }),
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
      logger.error('Erreur profil utilisateur (me)', { err: error }, { capture: true });
      return c.json({ error: 'Internal Server Error' }, 500);
    }
  });

  // Public User Profile Endpoint
  app.get('/v1/users/:username', async (c) => {
    const username = c.req.param('username');

    try {
      const author = await db.publication.findFirst({
        where: {
          OR: [{ slug: username }, { subdomain: username }],
        },
        select: {
          id: true,
          name: true,
          slug: true,
          subdomain: true,
          customDomain: true,
          heroText: true,
          logoUrl: true,
          headerImageUrl: true,
          isCertified: true,
          createdAt: true,
          type: true,
          _count: {
            select: {
              followers: true,
              articles: { where: { published: true } },
            },
          },
        },
      });

      if (!author) {
        return c.json({ error: 'User not found' }, 404);
      }

      return c.json({ data: author });
    } catch (error) {
      logger.error('Erreur profil auteur', { err: error }, { capture: true });
      return c.json({ error: 'Internal Server Error' }, 500);
    }
  });

  // Toggle Follow Endpoint
  app.post('/v1/users/:id/follow', userAuth, async (c) => {
    const user = c.get('user');
    const targetUserId = c.req.param('id');

    if (user.id === targetUserId) {
      return c.json({ error: 'You cannot follow yourself' }, 400);
    }

    try {
      // La cible est une Publication (personnelle OU média)
      const existingFollow = await db.follows.findFirst({
        where: {
          readerId: user.id,
          publicationId: targetUserId,
        },
      });

      let following = false;
      if (existingFollow) {
        await db.follows.delete({ where: { id: existingFollow.id } });
      } else {
        await db.follows.create({
          data: {
            readerId: user.id,
            publicationId: targetUserId,
          },
        });
        following = true;
      }

      const followersCount = await db.follows.count({
        where: { publicationId: targetUserId },
      });

      return c.json({ data: { following, followersCount } });
    } catch (error) {
      logger.error('Erreur toggle follow', { err: error }, { capture: true });
      return c.json({ error: 'Internal Server Error' }, 500);
    }
  });

  app.route('/search', searchApp);

  return app;
}

export const app = createApp();
