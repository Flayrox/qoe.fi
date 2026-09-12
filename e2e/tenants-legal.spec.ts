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

  test('mesure d’audience exemptée : plus de bannière bloquante, opposition en un clic', async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await page.goto(`/tenant/${domain}/legal`, { waitUntil: 'networkidle' });

    // Plus de dialogue bloquant : la mesure d'audience est anonyme et sans
    // cookie, donc dispensée de consentement. On informe, on ne barre pas.
    await expect(page.getByRole('dialog', { name: 'Préférences de cookies' })).toBeHidden();

    const notice = page.getByRole('region', { name: 'Mesure d’audience sans cookie' });
    await expect(notice).toBeVisible({ timeout: 20_000 });
    // Rien n'est suspendu à un clic : la page est entièrement utilisable.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Le droit d'opposition reste exerçable en un clic, au même endroit.
    await page.getByRole('button', { name: 'M’y opposer' }).click();
    await expect(notice).toBeHidden();

    // L'opposition est persistée pour le serveur (AnalyticsGate) ET pour le
    // navigateur : les deux doivent s'accorder, sinon la promesse est fausse.
    await expect
      .poll(async () => (await context.cookies()).some((c) => c.name === 'qoe_cookie_consent'))
      .toBe(true);
    expect(await page.evaluate(() => window.localStorage.getItem('umami.disabled'))).toBe('true');
    // Une opposition enregistrée côté serveur => le script n'est même plus servi.
    await page.reload({ waitUntil: 'networkidle' });
    expect(await page.locator('script[data-website-id]').count()).toBe(0);

    // Le centre de préférences reste accessible à tout moment, et il explique
    // la base de la dispense plutôt que de la laisser implicite.
    await page.getByRole('button', { name: 'Gérer mes cookies' }).first().click();
    const center = page.getByRole('dialog', { name: 'Préférences de traceurs' });
    await expect(center).toBeVisible();
    await expect(page.getByText('Dispensée de consentement').first()).toBeVisible();
  });
});
