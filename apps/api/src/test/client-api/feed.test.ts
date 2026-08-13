// =====================================================================
// 🧪 Client API — /v1/feed (infinite scroll)
// =====================================================================
// 📖 L'API Client est publique (pas d'auth) et sert le feed infini
//    pour l'app mobile. Pagination par curseur createdAt.
// =====================================================================

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestContext } from '../helpers/test-app';

describe('Client API — GET /v1/feed', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestApp();
  });

  it('renvoie les thoughts du plus récent au plus ancien', async () => {
    ctx.seed.user({ id: 'u-1', email: 'a@qoe.fi', name: 'Author A', username: 'authora' });
    ctx.seed.thought({
      authorId: 'u-1',
      content: 'Old thought',
      createdAt: new Date('2024-01-01T00:00:00Z'),
    });
    ctx.seed.thought({
      authorId: 'u-1',
      content: 'New thought',
      createdAt: new Date('2024-01-02T00:00:00Z'),
    });

    const res = await ctx.app.request('/v1/feed');
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      data: { items: Array<{ content: string }>; nextCursor: string | null };
    };
    expect(body.data.items).toHaveLength(2);
    expect(body.data.items[0].content).toBe('New thought');
    expect(body.data.items[1].content).toBe('Old thought');
    expect(body.data.nextCursor).toBeNull();
  });

  it('pagine avec un curseur (fetch des items plus anciens)', async () => {
    const base = new Date('2024-01-01T00:00:00Z').getTime();
    for (let i = 0; i < 5; i++) {
      ctx.seed.thought({
        authorId: 'u-1',
        content: `Thought ${i}`,
        createdAt: new Date(base + i * 60_000),
      });
    }

    const first = await ctx.app.request('/v1/feed?limit=3');
    const firstBody = (await first.json()) as {
      data: { items: Array<{ content: string }>; nextCursor: string | null };
    };

    expect(firstBody.data.items).toHaveLength(3);
    expect(firstBody.data.nextCursor).not.toBeNull();

    const second = await ctx.app.request(`/v1/feed?limit=3&cursor=${firstBody.data.nextCursor}`);
    const secondBody = (await second.json()) as {
      data: { items: Array<{ content: string }>; nextCursor: string | null };
    };

    expect(secondBody.data.items).toHaveLength(2);
    expect(secondBody.data.nextCursor).toBeNull();
    // Pas de doublon entre les pages
    const allContents = [...firstBody.data.items, ...secondBody.data.items].map((i) => i.content);
    expect(new Set(allContents).size).toBe(5);
  });

  it('limite le paramètre limit à 50', async () => {
    const res = await ctx.app.request('/v1/feed?limit=999');
    const body = (await res.json()) as { data: { items: unknown[] } };
    // take = 51 (limit+1) => items max 51 même si demandé plus
    expect(body.data.items.length).toBeLessThanOrEqual(51);
  });

  it("inclut l'auteur avec ses infos publiques", async () => {
    ctx.seed.user({
      id: 'u-1',
      email: 'a@qoe.fi',
      name: 'Author A',
      username: 'authora',
      isCertified: true,
    });
    ctx.seed.thought({ authorId: 'u-1', content: 'With author' });

    const res = await ctx.app.request('/v1/feed');
    const body = (await res.json()) as {
      data: { items: Array<{ author: { name: string; username: string; isCertified: boolean } }> };
    };

    expect(body.data.items[0].author).toMatchObject({
      name: 'Author A',
      username: 'authora',
      isCertified: true,
    });
  });
});
