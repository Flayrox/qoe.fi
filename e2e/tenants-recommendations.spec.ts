// =====================================================================
// 🤝 E2E — Parcours Cross-Recommandations Creator Network (Tenant)
// =====================================================================
// Vérifie le moteur de viralité à la Substack / Ghost :
//   1. Section "Recommandé par l'auteur" en bas de page
//   2. Affichage de la modale de recommandation après abonnement newsletter
//   3. Souscription multi-publications en 1 clic
// =====================================================================

import { test, expect } from '@playwright/test';
import { TestDb } from './lib/db';
import { DATABASE_URL } from './lib/env';

test.describe('Parcours Cross-Recommandations Creator Network', () => {
  let db: TestDb;
  const mainDomain = 'admin';
  const mainPubId = 'pub_12345678123412341234123456789012';
  const partnerPubId = 'pubw_7811b770418258358fa8';

  test.beforeAll(async () => {
    expect(DATABASE_URL, 'DATABASE_URL requis').toBeTruthy();
    db = new TestDb(DATABASE_URL);
    await db.connect();

    await db.ensureSubdomain(mainDomain, mainPubId);

    // Créer une recommandation de mainPubId vers partnerPubId
    await db.query(
      `INSERT INTO "Recommendation" ("id", "recommenderId", "recommendedId", "description", "createdAt")
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT ("recommenderId", "recommendedId") DO UPDATE SET "description" = $4`,
      [
        'rec_test_001',
        mainPubId,
        partnerPubId,
        'Une publication d’analyse géopolitique incontournable.',
      ]
    );
  });

  test.afterAll(async () => {
    // Nettoyer la recommandation de test
    await db.query(`DELETE FROM "Recommendation" WHERE "id" = $1`, ['rec_test_001']);
    await db?.close();
  });

  test('affiche la section des publications recommandées sur la page d’accueil du tenant', async ({
    page,
  }) => {
    await page.goto(`/tenant/${mainDomain}`, { waitUntil: 'networkidle' });

    // La section des recommandations doit être visible. Le libellé exact est
    // « Les lectures recommandées par {auteur} » (ou « Publications
    // recommandées » sans auteur) : on matche l'adjectif, pas l'apostrophe.
    const recSection = page.getByRole('heading', { name: /recommandées?/i }).first();
    await expect(recSection).toBeVisible({ timeout: 20_000 });

    // La description de la publication partenaire doit être présente
    await expect(
      page.getByText('Une publication d’analyse géopolitique incontournable.').first()
    ).toBeVisible();
  });

  test('déclenche la modale de recommandation après soumission réussie de la newsletter', async ({
    page,
  }) => {
    await page.goto(`/tenant/${mainDomain}`, { waitUntil: 'networkidle' });

    // Saisir un email valide dans le formulaire de newsletter
    const emailInput = page.getByPlaceholder(/votre adresse email/i).first();
    await expect(emailInput).toBeVisible({ timeout: 15_000 });
    const uniqueEmail = `subscriber-${Date.now()}@qoe.test`;
    await emailInput.fill(uniqueEmail);

    // 🎯 On scope au <form> qui porte le champ email : la section de
    // recommandations expose elle aussi des boutons « S'abonner », un
    // `.first()` global cliquerait le mauvais bouton.
    const subscribeForm = page.locator('form').filter({ has: emailInput });
    await subscribeForm.getByRole('button', { name: /s'abonner/i }).click();

    // Confirmation d'abonnement
    await expect(page.getByText(/vous êtes sur la liste/i).first()).toBeVisible({
      timeout: 15_000,
    });

    // 🤝 La boucle virale s'enclenche : la modale de recommandation s'ouvre
    // automatiquement avec la publication partenaire pré-cochée.
    const modalHeading = page.getByRole('heading', { name: /vous recommande également/i });
    await expect(modalHeading).toBeVisible({ timeout: 15_000 });

    // Abonnement groupé en 1 clic (la partenaire est pré-sélectionnée)
    await page.getByRole('button', { name: /s'abonner à 1 publication/i }).click();
    await expect(page.getByRole('button', { name: /abonné/i })).toBeVisible({
      timeout: 15_000,
    });

    // La modale se referme proprement après le succès
    await expect(modalHeading).toBeHidden({ timeout: 15_000 });
  });
});
