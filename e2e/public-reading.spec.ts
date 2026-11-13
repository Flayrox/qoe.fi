// =====================================================================
// 📖 E2E — Parcours lecture complet (feed public, données seedées)
// =====================================================================
// Ces tests couvrent le chemin de lecture réel d'un visiteur :
//   • ouvrir un article depuis le feed (drawer de lecture)
//   • indicateur premium sur une carte d'article payant
//   • lecture en lien profond (page /article/[slug] serveur)
//   • onglet Explorer → contenu d'un média certifié
//
// Le classement du feed dépend du moteur de recommandation (fraîcheur,
// complétion, diversification par publication) : les tests lisent la DB
// pour choisir leurs cibles au lieu de présumer un ordre.
//
// Prérequis CI : `go run ./cmd/seed` + schéma goose. Aucune dépendance
// Supabase.
// =====================================================================

import { test, expect } from '@playwright/test';
import { TestDb } from './lib/db';
import { DATABASE_URL } from './lib/env';

test.describe('Parcours lecture (public)', () => {
  test('ouvre un article depuis le feed dans le drawer, puis le ferme avec Échap', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'networkidle' });

    // 1. Ouvrir le drawer via la couverture de la première carte. Le DOM
    // réel des cartes du feed est `<article data-overlay-anchor>` avec une
    // zone `[data-article-cover]` cliquable : il n'existe pas de bouton
    // « Lire l'article » (l'ancien ArticleRow qui en portait un n'est plus
    // rendu). Cibler la couverture reste indépendant du classement moteur.
    const firstCard = page.locator('article[data-overlay-anchor]').first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });
    const cardTitle = (await firstCard.locator('h2').first().innerText()).trim();
    await firstCard.locator('[data-article-cover]').click();

    // 2. Le drawer de lecture s'ouvre sur CET article : titre h1 + corps.
    // #article-content ne contient que le corps — le h1 est son propre bloc.
    const drawerTitle = page.getByRole('heading', { level: 1 }).filter({ hasText: cardTitle });
    await expect(drawerTitle).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#article-content')).toBeVisible();

    // 3. Échap referme le drawer.
    await page.keyboard.press('Escape');
    await expect(page.locator('#article-content')).not.toBeVisible();
  });

  test("affiche l'indicateur premium sur la carte de l'article payant", async ({ page }) => {
    // Les articles premium sont identifiés en base par leur id, puis
    // retrouvés dans le DOM via `article[data-overlay-anchor]` : aucune
    // supposition sur le rang du classement. Si le feed « Pour vous » n'en
    // expose aucun, l'onglet Explorer les liste.
    const db = new TestDb(DATABASE_URL!);
    await db.connect();
    const rows = await db.query<{ id: string }>(
      `SELECT id FROM "Article" WHERE published = true AND "isPremium" = true`
    );
    await db.close();
    expect(rows.length, 'au moins un article premium seedé').toBeGreaterThan(0);
    const premiumIds = new Set(rows.map((row) => row.id));

    const premiumCardId = async () => {
      const ids = await page
        .locator('article[data-overlay-anchor]')
        .evaluateAll((els) => els.map((el) => el.getAttribute('data-overlay-anchor') || ''));
      return ids.find((id) => premiumIds.has(id)) ?? null;
    };

    await page.goto('/', { waitUntil: 'networkidle' });
    let cardId = await premiumCardId();

    if (!cardId) {
      const explorerTab = page.getByRole('tab', { name: 'Explorer' });
      await explorerTab.click();
      await expect(explorerTab).toHaveAttribute('aria-selected', 'true');
      await expect
        .poll(premiumCardId, {
          timeout: 15_000,
          message: "l'onglet Explorer doit exposer au moins un article premium",
        })
        .not.toBeNull();
      cardId = await premiumCardId();
    }

    // L'indicateur premium est l'icône Crown (lucide), pas un texte.
    await expect(
      page.locator(`article[data-overlay-anchor="${cardId}"] svg.lucide-crown`)
    ).toBeVisible();
  });

  test('lit un article en lien profond (page serveur /article/[slug])', async ({ page }) => {
    // Cible dynamique : n'importe quel article publié seedé.
    const db = new TestDb(DATABASE_URL!);
    await db.connect();
    const rows = await db.query<{ slug: string; title: string }>(
      `SELECT slug, title FROM "Article" WHERE published = true ORDER BY "createdAt" DESC LIMIT 1`
    );
    await db.close();
    expect(rows.length, 'au moins un article publié en base').toBeGreaterThan(0);
    const { slug, title } = rows[0];

    await page.goto(`/article/${slug}`, { waitUntil: 'networkidle' });

    await expect(page.getByRole('heading', { level: 1 }).filter({ hasText: title })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('#article-content')).toBeVisible();
    // Scopé au drawer : le feed en arrière-plan contient lui aussi des
    // mentions « min de lecture » (flaky strict-mode sinon).
    await expect(page.getByTestId('article-drawer').getByText('min de lecture')).toBeVisible();
  });

  test("affiche le contenu d'un média certifié dans l'onglet Explorer", async ({ page }) => {
    const db = new TestDb(DATABASE_URL!);
    await db.connect();
    const media = await db.query<{ title: string }>(
      `SELECT a.title FROM "Article" a JOIN "Publisher" p ON p.id = a."publisherId"
       WHERE p.type = 'MEDIA' AND a.published = true`
    );
    await db.close();
    expect(media.length, 'au moins un média certifié seedé').toBeGreaterThan(0);
    const mediaTitles = new Set(media.map((row) => row.title.trim()));

    await page.goto('/', { waitUntil: 'networkidle' });
    // Les onglets du fil sont des tabs react-aria (role=tab), pas des boutons.
    const explorerTab = page.getByRole('tab', { name: 'Explorer' });
    await explorerTab.click();
    await expect(explorerTab).toHaveAttribute('aria-selected', 'true');

    // Le titre d'une carte d'article est un h2 (plus de h3 dans ce DOM). La
    // carte du média est identifiée parmi les titres réellement rendus, sans
    // présumer de l'ordre de la découverte.
    const renderedMediaTitle = async () => {
      const titles = (await page.locator('article h2').allTextContents()).map((title) =>
        title.trim()
      );
      return titles.find((title) => mediaTitles.has(title)) ?? null;
    };
    await expect
      .poll(renderedMediaTitle, {
        timeout: 15_000,
        message: "l'onglet Explorer doit afficher au moins un article de média certifié",
      })
      .not.toBeNull();

    const mediaTitle = await renderedMediaTitle();
    await expect(page.getByRole('heading', { level: 2, name: mediaTitle! })).toBeVisible();
  });
});
