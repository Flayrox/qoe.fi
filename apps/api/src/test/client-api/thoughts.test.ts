// =====================================================================
// 🧪 Client API — /v1/thoughts (création + interactions)
// =====================================================================
// 📖 Auth = JWT Supabase. Toggle like/repost/bookmark avec comptage.
//    Vérifie les états de toggle (ajout puis retrait).
// =====================================================================

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestContext } from '../helpers/test-app';
import { clientHeaders } from '../helpers/auth';

function authCtx(ctx: TestContext) {
  const user = ctx.seed.user({ id: 'u-client-1', email: 'client@qoe.fi', name: 'Client One' });
  ctx.supabaseGetUser.mockResolvedValue({
    data: { user: { id: 'u-client-1', email: 'client@qoe.fi' } },
    error: null,
  });
  return user;
}

const json = (body: unknown) => ({
  method: 'POST',
  body: JSON.stringify(body),
  headers: { 'Content-Type': 'application/json' },
});

describe('Client API — POST /v1/thoughts', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestApp();
  });

  it("crée un thought avec l'utilisateur JWT", async () => {
    authCtx(ctx);

    const res = await ctx.app.request('/v1/thoughts', {
      ...json({ content: '  Mon nouveau thought  ', imageUrl: null }),
      headers: { 'Content-Type': 'application/json', ...clientHeaders() },
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { content: string; authorId: string } };
    expect(body.data.content).toBe('Mon nouveau thought'); // trim appliqué
    expect(body.data.authorId).toBe('u-client-1');
  });

  it('rejette un contenu vide ou non-string', async () => {
    authCtx(ctx);

    const res = await ctx.app.request('/v1/thoughts', {
      ...json({ content: '   ' }),
      headers: { 'Content-Type': 'application/json', ...clientHeaders() },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'Content is required' });
  });

  it('définit la visibilité par défaut à public', async () => {
    authCtx(ctx);

    const res = await ctx.app.request('/v1/thoughts', {
      ...json({ content: 'Hello' }),
      headers: { 'Content-Type': 'application/json', ...clientHeaders() },
    });
    const body = (await res.json()) as { data: { visibility: string } };
    expect(body.data.visibility).toBe('public');
  });
});

describe('Client API — like / repost / bookmark (toggle)', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestApp();
    authCtx(ctx);
    ctx.seed.thought({ id: 'th-1', authorId: 'u-other', content: 'Post to interact with' });
  });

  it('toggle le like (ajoute puis retire)', async () => {
    const first = await ctx.app.request('/v1/thoughts/th-1/like', {
      method: 'POST',
      headers: clientHeaders(),
    });
    const firstBody = (await first.json()) as { data: { liked: boolean; likesCount: number } };
    expect(firstBody.data.liked).toBe(true);
    expect(firstBody.data.likesCount).toBe(1);

    const second = await ctx.app.request('/v1/thoughts/th-1/like', {
      method: 'POST',
      headers: clientHeaders(),
    });
    const secondBody = (await second.json()) as { data: { liked: boolean; likesCount: number } };
    expect(secondBody.data.liked).toBe(false);
    expect(secondBody.data.likesCount).toBe(0);
  });

  it('toggle le repost', async () => {
    const first = await ctx.app.request('/v1/thoughts/th-1/repost', {
      method: 'POST',
      headers: clientHeaders(),
    });
    const firstBody = (await first.json()) as { data: { reposted: boolean; repostsCount: number } };
    expect(firstBody.data.reposted).toBe(true);
    expect(firstBody.data.repostsCount).toBe(1);

    const second = await ctx.app.request('/v1/thoughts/th-1/repost', {
      method: 'POST',
      headers: clientHeaders(),
    });
    const secondBody = (await second.json()) as {
      data: { reposted: boolean; repostsCount: number };
    };
    expect(secondBody.data.reposted).toBe(false);
    expect(secondBody.data.repostsCount).toBe(0);
  });

  it('toggle le bookmark', async () => {
    const first = await ctx.app.request('/v1/thoughts/th-1/bookmark', {
      method: 'POST',
      headers: clientHeaders(),
    });
    const firstBody = (await first.json()) as { data: { bookmarked: boolean } };
    expect(firstBody.data.bookmarked).toBe(true);

    const second = await ctx.app.request('/v1/thoughts/th-1/bookmark', {
      method: 'POST',
      headers: clientHeaders(),
    });
    const secondBody = (await second.json()) as { data: { bookmarked: boolean } };
    expect(secondBody.data.bookmarked).toBe(false);
  });

  it('compte les likes globaux (2 utilisateurs)', async () => {
    ctx.seed.like('u-client-1', 'th-1'); // l'utilisateur courant a déjà liké
    ctx.seed.like('u-client-2', 'th-1');

    const res = await ctx.app.request('/v1/thoughts/th-1/like', {
      method: 'POST',
      headers: clientHeaders(),
    });
    const body = (await res.json()) as { data: { liked: boolean; likesCount: number } };
    // le toggle retire le like de l'utilisateur courant => reste celui de u-client-2
    expect(body.data.liked).toBe(false);
    expect(body.data.likesCount).toBe(1);
  });
});
