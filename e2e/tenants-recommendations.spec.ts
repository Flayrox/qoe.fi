// =====================================================================
// 🤝 E2E — Parcours Cross-Recommandations Creator Network (Tenant)
// =====================================================================
// HERMÉTIQUE : ce spec ne dépend PLUS du seed. Il crée lui-même deux
// tenants (recommandeur + partenaire), les relie par une Recommendation,
// puis vérifie le moteur de viralité à la Substack / Ghost :
//   1. Section "Recommandé par l'auteur" en bas de page
//   2. Affichage de la modale de recommandation après abonnement newsletter
//   3. Souscription multi-publications en 1 clic
// =====================================================================

import { test, expect } from '@playwright/test';
import { TestDb } from './lib/db';
import { DATABASE_URL } from './lib/env';

// ─── Fixtures déterministes (créées et nettoyées par le spec) ──────────
const MAIN = {
  id: 'pub_e2e_reco_main',
  subdomain: 'reco-main-e2e',
  name: 'Le Signal E2E',
  authorId: '00000000-0000-4000-8000-00000000e2e4',
  authorEmail: 'e2e-reco-main@qoe.test',
  authorUsername: 'e2e_reco_main_author',
} as const;

const PARTNER = {
  id: 'pub_e2e_reco_partner',
  subdomain: 'reco-partner-e2e',
  name: 'Géopolitique E2E',
  authorId: '00000000-0000-4000-8000-00000000e2e5',
  authorEmail: 'e2e-reco-partner@qoe.test',
  authorUsername: 'e2e_reco_partner_author',
} as const;

const RECO_ID = 'rec_e2e_reco_001';
const RECO_DESCRIPTION = 'Une publication d’analyse géopolitique incontournable.';

test.describe('Parcours Cross-Recommandations Creator Network', () => {
  // ⚠️ Serial : le spec crée des tenants partagés et les NETTOIE en afterAll.
  // En parallèle, chaque worker rejouerait beforeAll/afterAll et un worker
  // rapide supprimerait les fixtures pendant qu'un autre s'en sert.
  test.describe.configure({ mode: 'serial' });

  let db: TestDb;

  test.beforeAll(async ({ request }) => {
    expect(DATABASE_URL, 'DATABASE_URL requis (base de dev/CI)').toBeTruthy();
    db = new TestDb(DATABASE_URL);
    await db.connect();

    // Tenant recommandeur + tenant partenaire, reliés par une Recommendation.
    await db.ensurePublication({
      id: MAIN.id,
      subdomain: MAIN.subdomain,
      name: MAIN.name,
      type: 'MEDIA',
      authorId: MAIN.authorId,
      authorEmail: MAIN.authorEmail,
      authorUsername: MAIN.authorUsername,
    });
    await db.ensurePublication({
      id: PARTNER.id,
      subdomain: PARTNER.subdomain,
      name: PARTNER.name,
      type: 'MEDIA',
      authorId: PARTNER.authorId,
      authorEmail: PARTNER.authorEmail,
      authorUsername: PARTNER.authorUsername,
    });
    await db.query(
      `INSERT INTO "Recommendation" ("id", "recommenderId", "recommendedId", "description", "createdAt")
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT ("id") DO UPDATE SET "recommenderId" = $2, "recommendedId" = $3, "description" = $4`,
      [RECO_ID, MAIN.id, PARTNER.id, RECO_DESCRIPTION]
    );

    // Warm-up : en dev, Next compile les routes à la première requête — un
    // premier appel non suivi évite un 404 « route non encore compilée ».
    await request.get(`/tenant/${MAIN.subdomain}`, { timeout: 60_000 }).catch(() => {});
  });

  test.afterAll(async () => {
    if (!db) return;
    // Nettoyage : ce spec ne doit pas polluer la base partagée.
    await db.query(`DELETE FROM "Recommendation" WHERE "id" = $1`, [RECO_ID]).catch(() => {});
    for (const id of [PARTNER.id, MAIN.id]) {
      await db.deletePublication(id).catch(() => {});
    }
    await db.close();
  });

  test('affiche la section des publications recommandées sur la page d’accueil du tenant', async ({
    page,
  }) => {
    await page.goto(`/tenant/${MAIN.subdomain}`, { waitUntil: 'networkidle' });

    // La section des recommandations doit être visible. Le libellé exact est
    // « Les lectures recommandées par {auteur} » (ou « Publications
    // recommandées » sans auteur) : on matche l'adjectif, pas l'apostrophe.
    const recSection = page.getByRole('heading', { name: /recommandées?/i }).first();
    await expect(recSection).toBeVisible({ timeout: 30_000 });

    // La description de la publication partenaire doit être présente
    await expect(page.getByText(RECO_DESCRIPTION).first()).toBeVisible();
  });

  test('déclenche la modale de recommandation après soumission réussie de la newsletter', async ({
    page,
  }) => {
    await page.goto(`/tenant/${MAIN.subdomain}`, { waitUntil: 'networkidle' });

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
