// =====================================================================
// 🏗️ E2E — Parcours public des tenants (apps/tenants, port 3001)
// =====================================================================
// Résolution de publication par sous-domaine (GET /v1/publications/by-domain
// via l'API Go) + rendu home et article. Parcours CI-safe : les sous-domaines
// 'admin' et 'media-clair' sont posés par le seed (cmd/seed) ; le spec les
// re-assure via pg pour la robustesse au drift.
// =====================================================================

import { test, expect } from '@playwright/test';
import { TestDb } from './lib/db';
import { DATABASE_URL, GO_API_URL } from './lib/env';

test.describe('Parcours public tenants', () => {
  let db: TestDb;

  test.beforeAll(async ({ request }) => {
    expect(DATABASE_URL, 'DATABASE_URL requis (base seedée)').toBeTruthy();
    expect(GO_API_URL, 'QOE_API_URL requis (API Go)').toBeTruthy();
    db = new TestDb(DATABASE_URL);
    await db.connect();
    // Le seed pose ces sous-domaines ; on les re-assure pour la robustesse.
    await db.ensureSubdomain('admin', 'pub_12345678123412341234123456789012');
    await db.ensureSubdomain('media-clair', 'pub_media_00000000000000000001');
    // Warm-up : en dev, Next compile les routes à la première requête — un
    // premier appel non suivi évite un 404 « route non encore compilée ».
    for (const path of [
      '/tenant/admin',
      '/tenant/media-clair',
      '/tenant/media-clair/article/enquete-locale-pouvoir',
    ]) {
      await request.get(path, { timeout: 60_000 }).catch(() => {});
    }
  });

  test.afterAll(async () => {
    await db?.close();
  });

  test('la home d’un tenant (sous-domaine admin) se résout et rend sa publication', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/tenant/admin', { waitUntil: 'networkidle' });
    await expect(page.getByText('Super Admin').first()).toBeVisible({ timeout: 30_000 });
    expect(pageErrors).toEqual([]);
  });

  test('un tenant média certifié (media-clair) rend son nom et son article', async ({ page }) => {
    await page.goto('/tenant/media-clair', { waitUntil: 'networkidle' });
    await expect(page.getByText('Le Média Clair').first()).toBeVisible({ timeout: 30_000 });

    await page.goto('/tenant/media-clair/article/enquete-locale-pouvoir', {
      waitUntil: 'networkidle',
    });
    await expect(
      page.getByText('Enquête : qui détient vraiment le pouvoir local ?').first()
    ).toBeVisible({ timeout: 30_000 });
  });

  test('un sous-domaine inconnu rend une 404 propre', async ({ page }) => {
    const response = await page.goto('/tenant/sous-domaine-inexistant', {
      waitUntil: 'networkidle',
    });
    expect(response?.status()).toBe(404);
  });
});
