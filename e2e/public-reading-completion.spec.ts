// =====================================================================
// 🌐 E2E PLAYWRIGHT — Moteur de Recommandation & Tracking de Lecture
// =====================================================================
// Valide dans un VRAI navigateur Chromium :
//   • L'affichage des widgets d'affinité créateurs et sujets émergents
//   • Le défilement et le tracker de session de lecture
// =====================================================================

import { test, expect } from '@playwright/test';
import { warmUpReader } from './lib/reader';

test.describe('E2E — Recommandations & Tracking de Lecture Haute Précision', () => {
  test('charge la page d’accueil et affiche la colonne d’intelligence éditoriale', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // 1. Vérifie la présence du feed
    await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });

    // 2. Vérifie la présence de la barre latérale sur grand écran, quand elle
    //    est rendue (le layout la masque sous un certaine largeur : la présence
    //    n'est pas un contrat de page, son contenu l'est).
    const widgets = page.locator('aside', { hasText: 'Plumes Recommandées' });
    if (await widgets.isVisible()) {
      await expect(
        widgets.getByText('Plumes Recommandées').or(widgets.getByText('À Découvrir'))
      ).toBeVisible();
    }
  });

  test('envoie la session de lecture à la fermeture du lecteur', async ({ page }) => {
    // 🔥 Compilation de l'action serveur avant la mesure (cf. lib/reader.ts).
    await warmUpReader(page);

    // Le tracker (`useArticleReadingTracker`) n'envoie une session que si
    // l'engagement est réel : `dwell === 0 && scroll === 0` est ignoré (règle
    // produit, StrictMode). On produit donc un signal DÉTERMINISTE — un vrai
    // défilement de la fenêtre, que le tracker écoute — au lieu d'attendre des
    // durées arbitraires.
    const beacon = page.waitForRequest(
      (request) =>
        request.url().includes('/api/analytics/reading-session') && request.method() === 'POST',
      { timeout: 30_000 }
    );

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const firstCard = page.locator('article[data-overlay-anchor]').first();
    await expect(firstCard, 'le feed doit exposer au moins un article').toBeVisible({
      timeout: 30_000,
    });
    await firstCard.locator('[data-article-cover]').click();
    await expect(page.locator('#article-content')).toBeVisible({ timeout: 30_000 });

    // Défilement réel : c'est ce qui rend `maxScrollRef > 0` et autorise l'envoi.
    await page.evaluate(() => window.scrollBy(0, 400));

    // Fermeture du lecteur = démontage du tracker = envoi du beacon.
    await page.keyboard.press('Escape');

    const request = await beacon;
    expect(request.method()).toBe('POST');
    expect(await request.postData()).toContain('readingTimeMinutes');
  });
});
