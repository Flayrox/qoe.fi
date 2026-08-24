// =====================================================================
// 🛡️ E2E — Console admin (apps/admin, port 3030)
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
import { COOKIE_NAME, DATABASE_URL, JWT_SECRET, mintJwt } from './lib/env';

const ADMIN = process.env.PLAYWRIGHT_ADMIN_URL ?? 'http://localhost:3030';
const RUN_FULL_STACK = process.env.RUN_FULL_STACK === '1';
// User.id est UUID (schéma goose) : UUID déterministe = JWT sub valide.
const ADMIN_ID = '00000000-0000-4000-8000-000000000002';

test.describe('Console admin', () => {
  test('le périmètre superadmin est verrouillé : /admin redirige vers /login', async ({
    request,
  }) => {
    // Warm-up : force la compilation dev avant l'assertion.
    await request.get(`${ADMIN}/admin`).catch(() => {});
    const res = await request.get(`${ADMIN}/admin`, { maxRedirects: 0 });
    expect(res.status(), 'doit rediriger (307)').toBe(307);
    const location = res.headers()['location'] ?? '';
    expect(location, `Location = ${location}`).toContain('/login');
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
