// =====================================================================
// 🧪 Creator API — /v1/articles
// =====================================================================
// 📖 L'API Créateur sert aux créateurs pour DIFFUSER leur contenu ailleurs
//    (intégrations, newsletters, export). Auth = API Key (Bearer qoe_live_...).
//    Elle s'oppose à l'API Client (JWT Supabase) pour l'app mobile.
// =====================================================================

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestContext } from '../helpers/test-app';
import { creatorHeaders } from '../helpers/auth';

const PAYWALL_CONTENT =
  '<p>Free teaser</p><div data-type="paywall-divider"></div><p>Secret premium body</p>';

describe('Creator API — GET /v1/articles', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestApp();
    const creator = ctx.seed.user({
      id: 'u-creator-1',
      email: 'creator@qoe.fi',
      name: 'Creator One',
    });
    ctx.seed.apiKey('qoe_live_test_creator_key_123', creator);
  });

  it('renvoie les articles publiés du créateur avec pagination', async () => {
    ctx.seed.article({
      authorId: 'u-creator-1',
      slug: 'first-post',
      title: 'First Post',
      published: true,
      category: { id: 'cat-1', name: 'Tech', slug: 'tech', description: null },
    });
    ctx.seed.article({
      authorId: 'u-creator-1',
      slug: 'draft-post',
      title: 'Draft',
      published: false,
    });

    const res = await ctx.app.request('/v1/articles', { headers: creatorHeaders() });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      data: Array<{ slug: string; title: string }>;
      pagination: { total: number; page: number; limit: number; pages: number };
    };

    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ slug: 'first-post', title: 'First Post' });
    expect(body.pagination).toEqual({ total: 1, page: 1, limit: 10, pages: 1 });
  });

  it("n'inclut pas le contenu paywalled (tronquage serveur, zéro fuite)", async () => {
    ctx.seed.article({
      authorId: 'u-creator-1',
      slug: 'premium',
      title: 'Premium',
      published: true,
      isPremium: true,
      content: PAYWALL_CONTENT,
      visibility: 'PAID_SUBSCRIBERS',
    });

    const res = await ctx.app.request('/v1/articles', { headers: creatorHeaders() });
    const body = (await res.json()) as {
      data: Array<{ contentHtml: string; isTruncated: boolean; paywallMeta: unknown }>;
    };

    expect(body.data[0].contentHtml).not.toContain('Secret premium body');
    expect(body.data[0].contentHtml).toContain('Free teaser');
    expect(body.data[0].isTruncated).toBe(true);
    expect(body.data[0].paywallMeta).toBeDefined();
  });

  it('filtre par catégorie via le query param ?category=', async () => {
    ctx.seed.article({
      authorId: 'u-creator-1',
      slug: 'tech-post',
      title: 'Tech Post',
      category: { id: 'cat-1', name: 'Tech', slug: 'tech', description: null },
    });
    ctx.seed.article({
      authorId: 'u-creator-1',
      slug: 'food-post',
      title: 'Food Post',
      category: { id: 'cat-2', name: 'Food', slug: 'food', description: null },
    });

    const res = await ctx.app.request('/v1/articles?category=tech', { headers: creatorHeaders() });
    const body = (await res.json()) as { data: Array<{ slug: string }> };

    expect(body.data).toHaveLength(1);
    expect(body.data[0].slug).toBe('tech-post');
  });

  it('respecte la limite max de 100 articles', async () => {
    for (let i = 0; i < 3; i++) {
      ctx.seed.article({ authorId: 'u-creator-1', slug: `post-${i}`, title: `Post ${i}` });
    }

    const res = await ctx.app.request('/v1/articles?limit=999', { headers: creatorHeaders() });
    const body = (await res.json()) as { pagination: { limit: number } };

    expect(body.pagination.limit).toBe(100);
  });

  it("n'expose que les articles du créateur authentifié", async () => {
    ctx.seed.article({ authorId: 'u-creator-1', slug: 'mine', title: 'Mine' });
    ctx.seed.article({ authorId: 'u-other', slug: 'theirs', title: 'Theirs' });

    const res = await ctx.app.request('/v1/articles', { headers: creatorHeaders() });
    const body = (await res.json()) as { data: Array<{ slug: string }> };

    expect(body.data).toHaveLength(1);
    expect(body.data[0].slug).toBe('mine');
  });
});

describe('Creator API — GET /v1/articles/:slug', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestApp();
    const creator = ctx.seed.user({ id: 'u-creator-1', email: 'creator@qoe.fi' });
    ctx.seed.apiKey('qoe_live_test_creator_key_123', creator);
  });

  it('renvoie un article par slug avec tronquage paywall', async () => {
    ctx.seed.article({
      authorId: 'u-creator-1',
      slug: 'premium',
      title: 'Premium',
      isPremium: true,
      content: PAYWALL_CONTENT,
      visibility: 'PAID_SUBSCRIBERS',
    });

    const res = await ctx.app.request('/v1/articles/premium', { headers: creatorHeaders() });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      data: { slug: string; contentHtml: string; isTruncated: boolean };
    };
    expect(body.data.slug).toBe('premium');
    expect(body.data.contentHtml).not.toContain('Secret premium body');
    expect(body.data.isTruncated).toBe(true);
  });

  it("renvoie 404 si l'article n'existe pas", async () => {
    const res = await ctx.app.request('/v1/articles/does-not-exist', { headers: creatorHeaders() });
    expect(res.status).toBe(404);
  });
});

describe('Creator API — GET /v1/categories', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestApp();
    const creator = ctx.seed.user({ id: 'u-creator-1', email: 'creator@qoe.fi' });
    ctx.seed.apiKey('qoe_live_test_creator_key_123', creator);
  });

  it("renvoie les catégories avec le comptage d'articles publiés", async () => {
    const tech = ctx.seed.category({
      publicationId: 'pub-u-creator-1',
      name: 'Tech',
      slug: 'tech',
    });
    ctx.seed.article({ authorId: 'u-creator-1', slug: 'a1', categoryId: tech.id, category: tech });
    ctx.seed.article({
      authorId: 'u-creator-1',
      slug: 'a2',
      categoryId: tech.id,
      category: tech,
      published: false,
    });

    const res = await ctx.app.request('/v1/categories', { headers: creatorHeaders() });
    const body = (await res.json()) as {
      data: Array<{ name: string; slug: string; articlesCount: number }>;
    };

    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ name: 'Tech', slug: 'tech', articlesCount: 1 });
  });
});
