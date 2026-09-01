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
import { COOKIE_NAME, DATABASE_URL, JWT_SECRET, mintJwt } from './lib/env';
import { expectRedirect } from './lib/redirect';

const STUDIO = process.env.PLAYWRIGHT_STUDIO_URL ?? 'http://localhost:15404';
const RUN_FULL_STACK = process.env.RUN_FULL_STACK === '1';
// User.id est UUID (schéma goose) : UUID déterministe = JWT sub valide.
const CREATOR_ID = '00000000-0000-4000-8000-000000000001';

test.describe('Studio créateur', () => {
  test('le périmètre créateur est verrouillé : toute route redirige vers /login', async ({
    request,
  }) => {
    for (const path of ['/', '/articles', '/media', '/settings']) {
      const status = await expectRedirect(request, `${STUDIO}${path}`);
      expect(status, `${path} doit rediriger`).toBeGreaterThanOrEqual(300);
      expect(status, `${path} doit rediriger (307)`).toBeLessThan(400);
      const res = await request.get(`${STUDIO}${path}`, { maxRedirects: 0 });
      const location = res.headers()['location'] ?? '';
      expect(location, `Location de ${path} = ${location}`).toContain('/login');
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
      `INSERT INTO "Publication" (id, type, name, slug, "createdAt", "updatedAt")
       VALUES ('pub_e2e_studio', 'PERSONAL', 'Studio E2E', 'studio-e2e', now(), now())
       ON CONFLICT (id) DO NOTHING`
    );
    await db.ensureUser(CREATOR_ID, 'studio.e2e@qoe.fi', 'creator', {
      publicationId: 'pub_e2e_studio',
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
