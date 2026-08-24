// =====================================================================
// 📖 E2E — Parcours lecture complet (feed public, données seedées)
// =====================================================================
// Ces tests couvrent le chemin de lecture réel d'un visiteur :
//   • ouvrir un article depuis le feed (drawer de lecture)
//   • badge Premium sur une carte d'article payant
//   • lecture en lien profond (page /article/[slug] serveur)
//   • onglet Explorer → contenu d'un média certifié (parcours média)
//
// Prérequis CI : `go run ./cmd/seed` (5 articles dont 1 média et 1 premium,
// publication personnelle + média certifiées). Schéma via goose — aucune
// dépendance Supabase.
// =====================================================================

import { test, expect } from '@playwright/test';

const EDITOR_PICK_TITLE = 'La souveraineté des médias indépendants';
const EDITOR_PICK_SLUG = 'souverainete-medias-independants';
const PREMIUM_TITLE = "L'économie de l'attention, dix ans après";
const MEDIA_TITLE = 'Enquête : qui détient vraiment le pouvoir local ?';

test.describe('Parcours lecture (public)', () => {
  test('ouvre un article depuis le feed dans le drawer, puis le ferme avec Échap', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    // 1. Cliquer la carte de l'article à la une (lien titre)
    await page.locator('a[href*="/article/"]', { hasText: EDITOR_PICK_TITLE }).first().click();

    // 2. Le drawer de lecture s'ouvre : titre h1 + corps de l'article
    const drawerTitle = page.locator('h1', { hasText: EDITOR_PICK_TITLE });
    await expect(drawerTitle).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator('#article-content').getByText('posséder son propre espace de publication')
    ).toBeVisible();

    // 3. Échap referme le drawer
    await page.keyboard.press('Escape');
    await expect(page.locator('#article-content')).not.toBeVisible();
  });

  test("affiche le badge Premium sur la carte de l'article payant", async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    const premiumCard = page.locator('article', { hasText: PREMIUM_TITLE });
    await expect(premiumCard).toBeVisible({ timeout: 15_000 });
    await expect(premiumCard.getByText('Premium', { exact: true })).toBeVisible();
  });

  test('lit un article en lien profond (page serveur /article/[slug])', async ({ page }) => {
    await page.goto(`/article/${EDITOR_PICK_SLUG}`, { waitUntil: 'networkidle' });

    await expect(page.locator('h1', { hasText: EDITOR_PICK_TITLE })).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.locator('#article-content').getByText('une condition de survie éditoriale')
    ).toBeVisible();
    await expect(page.getByText('min de lecture')).toBeVisible();
  });

  test("affiche le contenu d'un média certifié dans l'onglet Explorer", async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    await page.getByRole('button', { name: 'Explorer' }).click();

    // L'article média (publication certifiée) peut apparaître dans plusieurs
    // listes au moment de la transition d'onglet → .first().
    await expect(page.getByRole('heading', { level: 3, name: MEDIA_TITLE }).first()).toBeVisible({
      timeout: 15_000,
    });
    // Le nom du média (Le Média Clair) apparaît comme auteur de la carte
    await expect(page.getByText('Le Média Clair').first()).toBeVisible();
  });
});
