// =====================================================================
// 🎨 E2E — Studio créateur (apps/studio, port 15404)
// =====================================================================
// Deux niveaux :
//   1. AUTH GATE (CI-safe, sans session) : toute route (creator) redirige
//      vers /login — le périmètre authentifié est bien verrouillé.
//   2. PARCOURS COMPLET (local full-stack, RUN_FULL_STACK=1) : un vrai
//      utilisateur créateur est créé (JWT HS256 signé + ligne User role
//      creator) et le dashboard studio se rend — nécessite le stack Supabase
//      de test/dev (Hetzner, relayé), comme les specs de capture existants.
// =====================================================================

import { test, expect } from '@playwright/test';
import { TestDb } from './lib/db';
import { COOKIE_NAME, DATABASE_URL, GO_API_URL, JWT_SECRET, mintJwt } from './lib/env';
import { expectRedirect } from './lib/redirect';
import { assertSupabaseTraffic, openAppRoot } from './lib/supabase-network-guard';

const STUDIO = process.env.PLAYWRIGHT_STUDIO_URL ?? 'http://localhost:15404';
const RUN_FULL_STACK = process.env.RUN_FULL_STACK === '1';
// User.id est UUID (schéma goose) : UUID déterministe = JWT sub valide.
const CREATOR_ID = '00000000-0000-4000-8000-000000000001';

test.describe('Studio créateur', () => {
  test('le périmètre créateur est verrouillé : toutes les routes sensibles redirigent vers /login', async ({
    request,
  }) => {
    // ⚠️ Liste alignée sur les dossiers réels de `apps/studio/src/app/(creator)`.
    // Trois chemins n'existent plus (`/subscribers`, `/newsletter`, `/account`) :
    // ils renvoyaient 404 et faisaient échouer le test alors que le verrou
    // d'authentification fonctionnait sur les routes réelles (`/audience`,
    // `/newsletters`). Un 404 ne fuit rien, mais il ne prouve rien non plus.
    const protectedPaths = [
      '/',
      '/advanced',
      '/analytics',
      '/articles',
      '/articles/new',
      '/audience',
      '/books',
      '/community',
      '/developer',
      '/import',
      '/media',
      '/monetization',
      '/newsletters',
      '/notifications',
      '/settings',
      '/translate',
    ];

    const studioHeaders = { Host: 'studio.lvh.me:15404' };
    for (const path of protectedPaths) {
      const status = await expectRedirect(request, `${STUDIO}${path}`, 12, studioHeaders);
      expect(status, `${path} doit rediriger avec un code 3xx`).toBeGreaterThanOrEqual(300);
      expect(status, `${path} doit rediriger (307/302)`).toBeLessThan(400);

      const res = await request.get(`${STUDIO}${path}`, {
        maxRedirects: 0,
        headers: studioHeaders,
      });
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
      '/v1/analytics/stats',
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
    test.skip(
      !RUN_FULL_STACK,
      'Parcours complet : nécessite RUN_FULL_STACK=1 + stack Supabase de test/dev (Hetzner, pnpm dev:vps)'
    );

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
        // Le cookie doit appartenir à l'hôte réellement visité : en stack
        // complète c'est `studio.qoe.test`, pas `localhost`.
        domain: new URL(STUDIO).hostname,
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

// =====================================================================
// 🔒 Réseau — aucune page studio ne joint le Supabase de l'infra partagée
// =====================================================================
// Le studio est protégé : sa racine redirige vers le login du core, dont le
// formulaire instancie le client Supabase navigateur. On observe donc la page
// réelle (redirection comprise) et on refuse tout appel vers
// `116.203.158.47` ou tout Supabase hors boucle locale — même si le `.env` du
// poste pointe le VPS, seule la règle de `@qoe/supabase/url` protège.
test.describe('Studio — réseau Supabase', () => {
  test("aucune requête vers le Supabase de l'infra partagée", async ({ page }) => {
    // Toute la surface studio redirige vers le login du core : dans le job
    // `e2e-apps` le core n'est pas lancé, donc la navigation s'arrête sur la
    // redirection. On garde la preuve qui compte ici — les requêtes émises —
    // et on exige explicitement que la redirection d'auth ait eu lieu.
    const watch = await openAppRoot(page, 'studio');
    expect(
      watch.urls.some((url) => url.includes('/login')),
      `le studio doit rediriger vers le login (URLs vues : ${watch.urls.join(', ')})`
    ).toBe(true);
    assertSupabaseTraffic('studio', watch);
  });
});
