// =====================================================================
// 🛡️ E2E — Console admin (apps/admin, port 15405)
// =====================================================================
// Deux niveaux :
//   1. AUTH GATE (CI-safe, sans session) : /admin redirige vers /login
//      (URL de login du reader) — le périmètre superadmin est verrouillé.
//   2. PARCOURS COMPLET (local full-stack, RUN_FULL_STACK=1) : un vrai
//      superadmin est créé (JWT HS256 signé + ligne User role superadmin)
//      et le dashboard admin se rend — nécessite Supabase local
//      (getUser server-side), comme les specs de capture existants.
// =====================================================================

import { test, expect } from '@playwright/test';
import { TestDb } from './lib/db';
import { COOKIE_NAME, DATABASE_URL, GO_API_URL, JWT_SECRET, mintJwt } from './lib/env';
import { expectRedirect } from './lib/redirect';

const ADMIN = process.env.PLAYWRIGHT_ADMIN_URL ?? 'http://localhost:15405';
const RUN_FULL_STACK = process.env.RUN_FULL_STACK === '1';
// User.id est UUID (schéma goose) : UUID déterministe = JWT sub valide.
const ADMIN_ID = '00000000-0000-4000-8000-000000000002';

test.describe('Console admin', () => {
  test('le périmètre superadmin est verrouillé : toutes les sections /admin/* redirigent vers /login', async ({
    request,
  }) => {
    // En dev, la première visite de /admin compile la route et sa cible
    test.setTimeout(180_000);

    const adminPaths = [
      '/admin',
      '/admin/users',
      '/admin/publishers',
      '/admin/articles',
      '/admin/moderation',
      '/admin/legal',
      '/admin/finance',
      '/admin/system',
      '/admin/audit',
    ];

    const adminHeaders = { Host: 'admin.lvh.me:15405' };
    for (const path of adminPaths) {
      const status = await expectRedirect(request, `${ADMIN}${path}`, 12, adminHeaders);
      expect(status, `${path} doit rediriger avec 307`).toBe(307);

      const res = await request.get(`${ADMIN}${path}`, { maxRedirects: 0, headers: adminHeaders });
      const location = res.headers()['location'] ?? '';
      expect(location, `Location de ${path} = ${location}`).toContain('/login');

      // Vérifie l'en-tête anti-cache
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

  test('l’API Go admin rejette strictement les requêtes sans authentification avec 401', async ({
    request,
  }) => {
    const adminEndpoints = [
      '/v1/admin/dashboard',
      '/v1/admin/security/overview',
      '/v1/admin/users',
      '/v1/admin/audit-log',
      '/v1/admin/health',
      '/v1/admin/slo',
      '/v1/admin/config',
    ];

    for (const endpoint of adminEndpoints) {
      const res = await request.get(`${GO_API_URL}${endpoint}`);
      expect(res.status(), `GET ${endpoint} sans auth doit être 401`).toBe(401);
    }
  });

  test('l’API Go admin rejette les requêtes avec faux token ou privilèges insuffisants', async ({
    request,
  }) => {
    // Faux token
    const fakeToken =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.fake_signature_xyz';
    const fakeRes = await request.get(`${GO_API_URL}/v1/admin/dashboard`, {
      headers: { Authorization: `Bearer ${fakeToken}` },
    });
    expect(fakeRes.status(), 'Token invalide doit être 401').toBe(401);

    // Utilisateur non superadmin
    if (JWT_SECRET) {
      const normalUserToken = mintJwt('00000000-0000-4000-8000-000000000099', { role: 'user' });
      const nonAdminRes = await request.get(`${GO_API_URL}/v1/admin/dashboard`, {
        headers: { Authorization: `Bearer ${normalUserToken}` },
      });
      expect([401, 403]).toContain(nonAdminRes.status());
    }
  });

  test('un superadmin authentifié accède au dashboard', async ({ browser }) => {
    test.skip(!RUN_FULL_STACK, 'Parcours complet : nécessite RUN_FULL_STACK=1 + Supabase local');

    expect(DATABASE_URL, 'DATABASE_URL requis').toBeTruthy();
    expect(JWT_SECRET, 'SUPABASE_JWT_SECRET requis').toBeTruthy();

    const db = new TestDb(DATABASE_URL);
    await db.connect();
    await db.ensureUser(ADMIN_ID, 'admin.e2e@qoe.fi', 'superadmin');
    await db.close();

    const context = await browser.newContext();
    await context.addCookies([
      {
        name: COOKIE_NAME,
        value: JSON.stringify({
          access_token: mintJwt(ADMIN_ID),
          refresh_token: 'refresh-' + ADMIN_ID,
          user: { id: ADMIN_ID, email: 'admin.e2e@qoe.fi' },
        }),
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
    ]);

    const page = await context.newPage();
    await page.goto(ADMIN + '/admin', { waitUntil: 'networkidle' });
    // La console admin (header/sidebar superadmin) se rend.
    await expect(page.locator('header, aside, nav').first()).toBeVisible({ timeout: 30_000 });
    await context.close();
  });
});
