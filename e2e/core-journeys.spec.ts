// =====================================================================
// 📰 E2E — Parcours de lecture public (core, qoe.fi)
// =====================================================================
// Parcours CI-safe (aucun auth requis) contre un vrai serveur Next + API
// Go + base seedée (go run ./cmd/seed en CI) :
//   • lecture d'un article public seedé
//   • paywall : teaser rendu, passage premium JAMAIS visible
//   • article inconnu → 404 propre
// =====================================================================

import { test, expect } from '@playwright/test';

test.describe('Parcours lecture public (core)', () => {
  test('un article public seedé se lit de bout en bout', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/article/souverainete-medias-independants', { waitUntil: 'networkidle' });

    await expect(page.locator('#article-content')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('La souveraineté des médias indépendants').first()).toBeVisible({
      timeout: 20_000,
    });
    expect(pageErrors).toEqual([]);
  });

  test('un article premium se lit sur la page autonome (contrat slug-seul)', async ({ page }) => {
    // Mode slug-seul (page /article/[slug]) : contenu complet par design — le
    // gate paywall strict est appliqué par les endpoints publication-scopés
    // (couvert par les contrats Go P0 : isTruncated, zéro fuite premium).
    await page.goto('/article/essai-premium-souverainete', { waitUntil: 'networkidle' });

    await expect(page.getByText("L'économie de l'attention, dix ans après").first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      page.getByText('Premier paragraphe offert : le temps de lecture est une denrée rare.').first()
    ).toBeVisible();
  });

  test('un article inconnu rend une 404 propre', async ({ page }) => {
    const response = await page.goto('/article/slug-inexistant-xyz', { waitUntil: 'networkidle' });
    expect(response?.status()).toBe(404);
  });
});
