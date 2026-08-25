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

    // 1. Ouvrir le drawer via le bouton « Lire l'article » de la première
    // carte. Les liens titres pointent vers les domaines tenants (les
    // cartes du feed sont multi-publications) : seul ce bouton ouvre la
    // lecture in-page, indépendamment du classement du moteur.
    const firstCard = page.locator('article').first();
    await expect(firstCard).toBeVisible({ timeout: 15_000 });
    await firstCard.getByRole('button', { name: "Lire l'article" }).click();

    // 2. Le drawer de lecture s'ouvre : titre h1 + corps de l'article.
    // #article-content ne contient que le corps — le h1 est son propre bloc.
    const drawerTitle = page.getByRole('heading', { level: 1 });
    await expect(drawerTitle).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('#article-content')).toBeVisible();

    // 3. Échap referme le drawer.
    await page.keyboard.press('Escape');
    await expect(page.locator('#article-content')).not.toBeVisible();
  });

  test("affiche l'indicateur premium sur la carte de l'article payant", async ({ page }) => {
    // L'article premium est lu en base (titre réel) ; s'il n'est pas dans
    // la première page du feed (diversification du moteur), on passe.
    const db = new TestDb(DATABASE_URL!);
    await db.connect();
    const rows = await db.query<{ title: string }>(
      `SELECT title FROM "Article" WHERE published = true AND "isPremium" = true LIMIT 1`
    );
    await db.close();
    const premiumTitle = rows[0]?.title ?? '';
    test.skip(!premiumTitle, 'aucun article premium seedé');

    await page.goto('/', { waitUntil: 'networkidle' });
    const premiumCard = page.locator('article', { hasText: premiumTitle });
    const visible = await premiumCard.isVisible().catch(() => false);
    test.skip(!visible, 'article premium hors classement actuel du feed');
    // L'indicateur premium est l'icône Crown (lucide), pas un texte.
    await expect(premiumCard.locator('svg.lucide-crown')).toBeVisible();
  });

  test('lit un article en lien profond (page serveur /article/[slug])', async ({ page }) => {
    // Cible dynamique : n'importe quel article publié seedé.
    const db = new TestDb(DATABASE_URL!);
    await db.connect();
    const rows = await db.query<{ slug: string; title: string }>(
      `SELECT slug, title FROM "Article" WHERE published = true ORDER BY "createdAt" DESC LIMIT 1`
    );
    await db.close();
    test.skip(rows.length === 0, 'aucun article seedé');
    const { slug, title } = rows[0];

    await page.goto(`/article/${slug}`, { waitUntil: 'networkidle' });

    await expect(page.getByRole('heading', { level: 1 }).filter({ hasText: title })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('#article-content')).toBeVisible();
    await expect(page.getByText('min de lecture')).toBeVisible();
  });

  test("affiche le contenu d'un média certifié dans l'onglet Explorer", async ({ page }) => {
    const db = new TestDb(DATABASE_URL!);
    await db.connect();
    const media = await db.query<{ title: string }>(
      `SELECT a.title FROM "Article" a JOIN "Publication" p ON p.id = a."publicationId"
       WHERE p.type = 'MEDIA' AND a.published = true LIMIT 1`
    );
    await db.close();
    test.skip(media.length === 0, 'aucun média certifié seedé');
    const MEDIA_TITLE = media[0].title;

    await page.goto('/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Explorer' }).click();

    await expect(page.getByRole('heading', { level: 3, name: MEDIA_TITLE }).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
