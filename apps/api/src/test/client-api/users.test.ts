// =====================================================================
// 🧪 Client API — /v1/users (profils + follow)
// =====================================================================
// 📖 - /v1/users/me : profil courant (auth JWT)
//    - /v1/users/:username : profil public
//    - /v1/users/:id/follow : toggle follow
// =====================================================================

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestContext } from '../helpers/test-app';
import { clientHeaders } from '../helpers/auth';

describe('Client API — GET /v1/users/me', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestApp();
  });

  it('renvoie le profil avec les compteurs following/followers', async () => {
    ctx.seed.user({ id: 'u-me', email: 'me@qoe.fi', name: 'Me', username: 'me' });
    ctx.supabaseGetUser.mockResolvedValue({
      data: { user: { id: 'u-me', email: 'me@qoe.fi' } },
      error: null,
    });
    ctx.seed.follow('u-me', 'u-a'); // me suit a
    ctx.seed.follow('u-b', 'u-me'); // b me suit

    const res = await ctx.app.request('/v1/users/me', { headers: clientHeaders() });
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      data: { username: string; stats: { followingCount: number; followersCount: number } };
    };
    expect(body.data.username).toBe('me');
    expect(body.data.stats.followingCount).toBe(1);
    expect(body.data.stats.followersCount).toBe(1);
  });

  it('renvoie 401 sans JWT', async () => {
    const res = await ctx.app.request('/v1/users/me');
    expect(res.status).toBe(401);
  });
});

describe('Client API — GET /v1/users/:username', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestApp();
  });

  it('renvoie un profil public par username ou subdomain', async () => {
    ctx.seed.user({
      id: 'u-public',
      email: 'public@qoe.fi',
      username: 'pubuser',
      subdomain: 'pubdomain',
      name: 'Public User',
      isCertified: true,
    });
    ctx.seed.thought({ authorId: 'u-public', content: 'Post' });

    const byUsername = await ctx.app.request('/v1/users/pubuser');
    const bySubdomain = await ctx.app.request('/v1/users/pubdomain');

    expect(byUsername.status).toBe(200);
    expect(bySubdomain.status).toBe(200);

    const body = (await byUsername.json()) as {
      data: { name: string; isCertified: boolean; _count: { posts: number } };
    };
    expect(body.data).toMatchObject({ name: 'Public User', isCertified: true });
    expect(body.data._count.posts).toBe(1);
  });

  it("renvoie 404 si l'utilisateur n'existe pas", async () => {
    const res = await ctx.app.request('/v1/users/nobody');
    expect(res.status).toBe(404);
  });
});

describe('Client API — POST /v1/users/:id/follow', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestApp();
    ctx.seed.user({ id: 'u-me', email: 'me@qoe.fi', name: 'Me' });
    ctx.supabaseGetUser.mockResolvedValue({
      data: { user: { id: 'u-me', email: 'me@qoe.fi' } },
      error: null,
    });
    ctx.seed.user({ id: 'u-target', email: 'target@qoe.fi', name: 'Target' });
  });

  it('toggle le follow et renvoie le compteur', async () => {
    const first = await ctx.app.request('/v1/users/u-target/follow', {
      method: 'POST',
      headers: clientHeaders(),
    });
    const firstBody = (await first.json()) as {
      data: { following: boolean; followersCount: number };
    };
    expect(firstBody.data.following).toBe(true);
    expect(firstBody.data.followersCount).toBe(1);

    const second = await ctx.app.request('/v1/users/u-target/follow', {
      method: 'POST',
      headers: clientHeaders(),
    });
    const secondBody = (await second.json()) as {
      data: { following: boolean; followersCount: number };
    };
    expect(secondBody.data.following).toBe(false);
    expect(secondBody.data.followersCount).toBe(0);
  });

  it('interdit de se suivre soi-même (400)', async () => {
    const res = await ctx.app.request('/v1/users/u-me/follow', {
      method: 'POST',
      headers: clientHeaders(),
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: 'You cannot follow yourself' });
  });
});
