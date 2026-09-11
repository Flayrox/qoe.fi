// =====================================================================
// 🔒 E2E — Parcours Paywall & Déverrouillage à l'acte (Tenant)
// =====================================================================
// Vérifie le contrat d'étanchéité zéro fuite (Server-side PaywallCut)
// ainsi que l'ergonomie premium inspirée des standards Apple (verre dépoli,
// typographie soignée, absence de police monospace, tarification claire).
// =====================================================================

import { test, expect } from '@playwright/test';
import { TestDb } from './lib/db';
import { DATABASE_URL } from './lib/env';

test.describe('Parcours Paywall Tenant — Déverrouillage & Zero-Leak', () => {
  let db: TestDb;
  const domain = 'admin';
  const premiumSlug = 'essai-premium-souverainete';

  test.beforeAll(async () => {
    expect(DATABASE_URL, 'DATABASE_URL requis').toBeTruthy();
    db = new TestDb(DATABASE_URL);
    await db.connect();

    // S'assurer que le sous-domaine admin pointe vers AdminPubID
    await db.ensureSubdomain(domain, 'pub_12345678123412341234123456789012');
  });

  test.afterAll(async () => {
    await db?.close();
  });

  test('affiche le teaser public mais coupe hermétiquement le contenu premium côté serveur', async ({
    page,
  }) => {
    await page.goto(`/tenant/${domain}/article/${premiumSlug}`, { waitUntil: 'networkidle' });

    // Le titre et l'extrait offert doivent être visibles
    await expect(page.getByText("L'économie de l'attention, dix ans après").first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText('Premier paragraphe offert').first()).toBeVisible();

    // Le passage post-cut ne doit en aucun cas fuiter dans le DOM pour un visiteur non authentifié
    const bodyContent = await page.content();
    expect(bodyContent).not.toContain(
      'Ce passage est réservé aux abonnés premium de cette publication.'
    );
  });

  test('présente la carte paywall triptyque conforme aux exigences design Apple', async ({
    page,
  }) => {
    await page.goto(`/tenant/${domain}/article/${premiumSlug}`, { waitUntil: 'networkidle' });

    // Présence du composant paywall
    const paywallCard = page
      .locator('[data-testid="paywall-cut"]')
      .or(page.locator('.backdrop-blur-xl'))
      .first();
    await expect(paywallCard).toBeVisible({ timeout: 15_000 });

    // Vérification du bouton d'action ou de connexion
    const actionBtn = page
      .getByRole('button', { name: /débloquer|continuer|s'abonner/i })
      .or(page.getByRole('link', { name: /débloquer|continuer|s'abonner|connexion/i }))
      .first();
    await expect(actionBtn).toBeVisible();

    // Vérification de non-régression stylistique : aucune classe font-mono dans la carte
    const cardHtml = await paywallCard.innerHTML();
    expect(cardHtml).not.toContain('font-mono');
  });
});
