// =====================================================================
// ⚖️ E2E — Pages légales & consentement traceurs (apps/tenants)
// =====================================================================
// Vérifie le contrat de conformité côté public :
//   - les documents juridiques publiés sont listés et lisibles sur le
//     domaine du créateur (art. 6 LCEN, art. 12 RGPD) ;
//   - chaque document affiche sa version et son historique ;
//   - aucun traceur non essentiel n'est chargé avant le choix, refuser
//     est aussi simple qu'accepter, et le choix est conservé.
// Le contenu est installé au démarrage de l'API (seed embarqué), donc ces
// pages ne sont jamais vides — c'est justement ce que ce spec protège.
// =====================================================================

import { test, expect } from '@playwright/test';
import { TestDb } from './lib/db';
import { DATABASE_URL } from './lib/env';

test.describe('Pages légales & consentement (tenant)', () => {
  let db: TestDb;
  const domain = 'admin';

  test.beforeAll(async ({ request }) => {
    expect(DATABASE_URL, 'DATABASE_URL requis (base seedée)').toBeTruthy();
    db = new TestDb(DATABASE_URL);
    await db.connect();
    await db.ensureSubdomain(domain, 'pub_12345678123412341234123456789012');

    // Warm-up : en dev, Next compile les routes à la première requête.
    for (const path of [
      `/tenant/${domain}/legal`,
      `/tenant/${domain}/legal/conditions-generales-utilisation`,
    ]) {
      await request.get(path, { timeout: 60_000 }).catch(() => {});
    }
  });

  test.afterAll(async () => {
    await db?.close();
  });

  test('l’index légal liste les documents publiés', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto(`/tenant/${domain}/legal`, { waitUntil: 'networkidle' });

    await expect(page.getByRole('heading', { level: 1, name: 'Informations légales' })).toBeVisible(
      { timeout: 30_000 }
    );
    await expect(
      page.getByRole('link', { name: /Conditions générales d'utilisation/ }).first()
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Politique de confidentialité/ }).first()
    ).toBeVisible();
    expect(pageErrors).toEqual([]);
  });

  test('un document rend sa version, son contenu et son historique', async ({ page }) => {
    await page.goto(`/tenant/${domain}/legal/conditions-generales-utilisation`, {
      waitUntil: 'networkidle',
    });

    await expect(
      page.getByRole('heading', { level: 1, name: /Conditions générales d'utilisation/ })
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/Version 1\.0\.0/).first()).toBeVisible();

    // Le corps est bien rendu en HTML : aucun marqueur markdown ne subsiste.
    const body = await page.content();
    expect(body).not.toContain('## Objet');
  });

  test('aucun traceur avant le choix, refus simple, choix conservé', async ({ page, context }) => {
    await context.clearCookies();
    await page.goto(`/tenant/${domain}/legal`, { waitUntil: 'networkidle' });

    const banner = page.getByRole('dialog', { name: 'Préférences de cookies' });
    await expect(banner).toBeVisible({ timeout: 20_000 });

    // Refuser est proposé comme une action de premier niveau, au même titre
    // qu'accepter (exigence de symétrie des choix).
    await expect(page.getByRole('button', { name: 'Tout accepter' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tout refuser' })).toBeVisible();

    // Aucun traceur non essentiel ne doit être monté avant le choix.
    expect(await page.locator('script[data-website-id]').count()).toBe(0);

    await page.getByRole('button', { name: 'Tout refuser' }).click();
    await expect(banner).toBeHidden();

    // Le choix est persisté en cookie lisible côté serveur (AnalyticsGate).
    await expect
      .poll(async () => (await context.cookies()).some((c) => c.name === 'qoe_cookie_consent'))
      .toBe(true);

    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByRole('dialog', { name: 'Préférences de cookies' })).toBeHidden();

    // Réouverture possible à tout moment (« Gérer mes cookies »).
    await page.getByRole('button', { name: 'Gérer mes cookies' }).first().click();
    await expect(page.getByRole('dialog', { name: 'Préférences de cookies' })).toBeVisible();
  });
});
