// =====================================================================
// 🔥 e2e/lib/reader.ts — pré-chauffage du lecteur (drawer d'article)
// =====================================================================
// Pourquoi : en `next dev`, le PREMIER appel de l'action serveur
// `fetchArticleThread` compile tout son graphe. Mesuré à plus de 10 s avec
// quatre workers actifs — au-delà de la borne produit (`ARTICLE_THREAD_TIMEOUT_MS`
// = 10 s dans `ArticleOverlayProvider`), qui affiche alors légitimement
// « Article indisponible ». Un cas qui mesure ensuite l'ouverture du lecteur
// échouait donc au hasard de la charge, pas à cause d'une régression.
//
// Le pré-chauffage ne teste rien et n'assertionne rien sur le contenu : il
// force la compilation, puis le cas réel joue le parcours sur un serveur chaud.
// En `next start` (mode prod des jobs e2e-routes/e2e-apps) il ne coûte qu'une
// ouverture de drawer.
// =====================================================================

import { expect, type Page } from '@playwright/test';

/**
 * Ouvre puis referme le lecteur une fois, en attendant la SORTIE de l'état de
 * chargement (contenu rendu ou état d'erreur — les deux prouvent que l'action
 * serveur a répondu et que son graphe est compilé).
 */
export async function warmUpReader(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const card = page.locator('article[data-overlay-anchor]').first();
  await expect(card, 'le feed doit exposer au moins une carte').toBeVisible({ timeout: 30_000 });
  await card.locator('[data-article-cover]').click();

  await expect(
    page
      .locator('#article-content')
      .or(page.getByRole('heading', { name: 'Article indisponible' }))
      .first()
  ).toBeVisible({ timeout: 60_000 });

  await page.keyboard.press('Escape');
}
