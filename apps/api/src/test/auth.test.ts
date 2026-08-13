// =====================================================================
// 🧪 API Auth — les DEUX surfaces d'authentification
// =====================================================================
// 📖 - Creator API : API Key (Bearer qoe_live_...) → diffusion ailleurs
//    - Client API  : JWT Supabase (Bearer) → app mobile
//    Ces tests vérifient que chaque surface ne peut PAS franchir l'autre.
// =====================================================================

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, type TestContext } from './helpers/test-app';
import { clientHeaders } from './helpers/auth';

describe('Creator API auth (API Key)', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestApp();
  });

  it('rejette les requêtes sans header Authorization', async () => {
    const res = await ctx.app.request('/v1/articles');
    expect(res.status).toBe(401);
  });

  it('rejette un token sans préfixe qoe_live_', async () => {
    const res = await ctx.app.request('/v1/articles', {
      headers: { Authorization: 'Bearer invalid_token_123' },
    });
    expect(res.status).toBe(401);
  });

  it('rejette une API key inconnue', async () => {
    const res = await ctx.app.request('/v1/articles', {
      headers: { Authorization: 'Bearer qoe_live_unknown_key' },
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'Unauthorized: Invalid API key' });
  });

  it("refuse un JWT client sur l'API créateur", async () => {
    const res = await ctx.app.request('/v1/articles', {
      headers: clientHeaders(),
    });
    expect(res.status).toBe(401);
  });
});

describe('Client API auth (Supabase JWT)', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestApp();
  });

  it('rejette un POST /v1/thoughts sans JWT', async () => {
    const res = await ctx.app.request('/v1/thoughts', {
      method: 'POST',
      body: JSON.stringify({ content: 'Hello' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(401);
  });

  it('rejette un JWT invalide/expiré', async () => {
    ctx.supabaseGetUser.mockResolvedValue({
      data: { user: null },
      error: new Error('invalid token'),
    });

    const res = await ctx.app.request('/v1/thoughts', {
      method: 'POST',
      body: JSON.stringify({ content: 'Hello' }),
      headers: { ...clientHeaders('bad-jwt'), 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(401);
  });

  it("rejette un JWT valide dont l'utilisateur n'existe pas en DB", async () => {
    ctx.supabaseGetUser.mockResolvedValue({
      data: { user: { id: 'u-ghost', email: 'ghost@qoe.fi' } },
      error: null,
    });

    const res = await ctx.app.request('/v1/thoughts', {
      method: 'POST',
      body: JSON.stringify({ content: 'Hello' }),
      headers: { ...clientHeaders(), 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: 'Unauthorized: User not found in DB' });
  });
});
