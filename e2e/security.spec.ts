// =====================================================================
// 🛡️ E2E — Campagne de sécurité au niveau navigateur/HTTP
// =====================================================================
// Vérifie contre l'API Go réelle (QOE_API_URL) et les apps Next :
//   • frontière d'authentification (401 + JSON structuré, token invalide)
//   • isolation tenant : article demandé sous la mauvaise publication → 404
//   • santé et CORS de l'API
//   • pas d'en-têtes serveur révélateurs sur les apps web
// CI-safe : aucune session requise.
// =====================================================================

import { test, expect, request as pwRequest } from '@playwright/test';
import { TestDb } from './lib/db';
import { DATABASE_URL, GO_API_URL } from './lib/env';

test.describe('Sécurité (browser/HTTP)', () => {
  test('l’API Go répond en santé et accepte le preflight CORS', async () => {
    const api = await pwRequest.newContext({ baseURL: GO_API_URL });
    const health = await api.get('/healthz');
    expect(health.status()).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok' });

    const preflight = await api.fetch('/v1/me', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:3010',
        'Access-Control-Request-Method': 'GET',
      },
    });
    expect(preflight.status()).toBe(204);
    const acm = preflight.headers()['access-control-allow-methods'] ?? '';
    const ach = preflight.headers()['access-control-allow-headers'] ?? '';
    expect(acm).toContain('GET');
    expect(ach).toContain('Authorization');
    await api.dispose();
  });

  test('les routes protégées exigent un Bearer valide (401 + JSON)', async () => {
    const api = await pwRequest.newContext({ baseURL: GO_API_URL });

    const noAuth = await api.get('/v1/me');
    expect(noAuth.status()).toBe(401);
    const body = (await noAuth.json()) as { error?: string };
    expect(typeof body.error).toBe('string');

    const badToken = await api.get('/v1/me', {
      headers: { Authorization: 'Bearer not-a-real-jwt' },
    });
    expect(badToken.status()).toBe(401);
    await api.dispose();
  });

  test('isolation tenant : un article n’est pas lisible sous une autre publication', async () => {
    expect(DATABASE_URL, 'DATABASE_URL requis (base seedée)').toBeTruthy();
    const db = new TestDb(DATABASE_URL);
    await db.connect();

    // Article seedé de la publication admin (pub_123…), demandé sous une
    // publication tierce : 404, aucune fuite de contenu.
    const rows = await db.query<{ publicationId: string }>(
      `SELECT "publicationId" FROM "Article" WHERE slug = 'souverainete-medias-independants' LIMIT 1`
    );
    expect(rows[0]?.publicationId).toBeTruthy();
    await db.close();

    const api = await pwRequest.newContext({ baseURL: GO_API_URL });
    const res = await api.get(
      `/v1/articles/souverainete-medias-independants?publicationId=pub_tiers_inexistant`
    );
    expect(res.status()).toBe(404);
    await api.dispose();
  });

  test('les apps web ne révèlent pas d’en-têtes serveur sensibles', async () => {
    const ctx = await pwRequest.newContext();
    const res = await ctx.get('http://localhost:3010/');
    expect(res.status()).toBe(200);
    const headers = res.headers();
    expect(headers['x-powered-by'] ?? '').not.toContain('Express');
    expect(headers['server'] ?? '').not.toContain('nginx');
    await ctx.dispose();
  });
});
