// =====================================================================
// 🎨 E2E — Studio créateur (apps/studio, port 15404)
// =====================================================================
// Deux niveaux :
//   1. AUTH GATE (CI-safe, sans session) : toute route (creator) redirige
//      vers /login — le périmètre authentifié est bien verrouillé.
//   2. PARCOURS COMPLET (local full-stack, RUN_FULL_STACK=1) : un vrai
//      utilisateur créateur est créé (JWT HS256 signé + ligne User role
//      creator) et le dashboard studio se rend — nécessite Supabase local
//      (getUser server-side), comme les specs de capture existants.
// =====================================================================

import { test, expect } from '@playwright/test';
import { TestDb } from './lib/db';
import { COOKIE_NAME, DATABASE_URL, GO_API_URL, JWT_SECRET, mintJwt } from './lib/env';
import { expectRedirect } from './lib/redirect';

const STUDIO = process.env.PLAYWRIGHT_STUDIO_URL ?? 'http://localhost:15404';
const RUN_FULL_STACK = process.env.RUN_FULL_STACK === '1';
// User.id est UUID (schéma goose) : UUID déterministe = JWT sub valide.
const CREATOR_ID = '00000000-0000-4000-8000-000000000001';

test.describe('Studio créateur', () => {
  test('le périmètre créateur est verrouillé : toutes les routes sensibles redirigent vers /login', async ({
    request,
  }) => {
    const protectedPaths = [
      '/',
      '/articles',
      '/articles/new',
      '/media',
      '/settings',
      '/analytics',
      '/subscribers',
      '/newsletter',
      '/import',
      '/account',
    ];

    for (const path of protectedPaths) {
      const status = await expectRedirect(request, `${STUDIO}${path}`);
      expect(status, `${path} doit rediriger avec un code 3xx`).toBeGreaterThanOrEqual(300);
      expect(status, `${path} doit rediriger (307/302)`).toBeLessThan(400);

      const res = await request.get(`${STUDIO}${path}`, { maxRedirects: 0 });
      const location = res.headers()['location'] ?? '';
      expect(location, `Location de ${path} = ${location}`).toContain('/login');

      // Vérifie l'en-tête anti-cache pour protéger les données privées créateur
      const cacheControl = res.headers()['cache-control'] ?? '';
      const isAntiCache =
        cacheControl.includes('private') ||
        cacheControl.includes('no-store') ||
        cacheControl.includes('no-cache');
      expect(
        isAntiCache,
        `Cache-Control sur ${path} doit interdire la mise en cache publique (${cacheControl})`
      ).toBe(true);
    }
  });

  test('l’API Go créateur rejette les requêtes non authentifiées avec 401', async ({ request }) => {
    const creatorEndpoints = [
      '/v1/creator/articles',
      '/v1/creator/recommendations',
      '/v1/creator/subscribers',
      '/v1/creator/analytics',
    ];

    for (const endpoint of creatorEndpoints) {
      const res = await request.get(`${GO_API_URL}${endpoint}`);
      expect(res.status(), `GET ${endpoint} sans auth doit renvoyer 401`).toBe(401);
      const json = await res.json().catch(() => null);
      expect(json, `GET ${endpoint} doit renvoyer un JSON d'erreur`).toBeTruthy();
      expect(json?.code || json?.error || json?.message).toBeTruthy();
    }
  });

  test('l’API Go créateur rejette les tokens falsifiés ou expirés', async ({ request }) => {
    // 1. Token avec une fausse signature
    const fakeToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.fake_signature_xyz';
    const fakeRes = await request.get(`${GO_API_URL}/v1/creator/articles`, {
      headers: { Authorization: `Bearer ${fakeToken}` },
    });
    expect(fakeRes.status(), 'Token invalide doit renvoyer 401').toBe(401);

    // 2. Token signé mais expiré il y a 24h
    if (JWT_SECRET) {
      const expiredToken = mintJwt(CREATOR_ID, { exp: Math.floor(Date.now() / 1000) - 86400 });
      const expiredRes = await request.get(`${GO_API_URL}/v1/creator/articles`, {
        headers: { Authorization: `Bearer ${expiredToken}` },
      });
      expect(expiredRes.status(), 'Token expiré doit renvoyer 401').toBe(401);
    }
  });

  test('un créateur authentifié accède à son dashboard', async ({ browser }) => {
    test.skip(!RUN_FULL_STACK, 'Parcours complet : nécessite RUN_FULL_STACK=1 + Supabase local');

    expect(DATABASE_URL, 'DATABASE_URL requis').toBeTruthy();
    expect(JWT_SECRET, 'SUPABASE_JWT_SECRET requis').toBeTruthy();

    const db = new TestDb(DATABASE_URL);
    await db.connect();
    // Le créateur doit posséder une publication (layout : GET /v1/users/me).
    await db.query(
      `INSERT INTO "Publisher" (id, type, name, slug, "createdAt", "updatedAt")
       VALUES ('pub_e2e_studio', 'PERSONAL', 'Studio E2E', 'studio-e2e', now(), now())
       ON CONFLICT (id) DO NOTHING`
    );
    await db.ensureUser(CREATOR_ID, 'studio.e2e@qoe.fi', 'creator', {
      publisherId: 'pub_e2e_studio',
    });
    await db.close();

    const context = await browser.newContext();
    await context.addCookies([
      {
        name: COOKIE_NAME,
        value: JSON.stringify({
          access_token: mintJwt(CREATOR_ID),
          refresh_token: 'refresh-' + CREATOR_ID,
          user: { id: CREATOR_ID, email: 'studio.e2e@qoe.fi' },
        }),
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
    ]);

    const page = await context.newPage();
    await page.goto(STUDIO + '/', { waitUntil: 'networkidle' });
    // La barre latérale du studio se rend.
    await expect(page.locator('aside, nav').first()).toBeVisible({ timeout: 30_000 });
    await context.close();
  });
});
