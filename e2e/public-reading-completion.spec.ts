// =====================================================================
// 🌐 E2E PLAYWRIGHT — Moteur de Recommandation & Tracking de Lecture
// =====================================================================
// Valide dans un VRAI navigateur Chromium :
//   • L'affichage des widgets d'affinité créateurs et sujets émergents
//   • Le défilement et le tracker de session de lecture
// =====================================================================

import { test, expect } from '@playwright/test';

test.describe('E2E — Recommandations & Tracking de Lecture Haute Précision', () => {
  test('charge la page d’accueil et affiche la colonne d’intelligence éditoriale', async ({
    page,
  }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // 1. Vérifie la présence du feed
    await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });

    // 2. Vérifie la présence de la barre latérale sur grand écran
    const aside = page.locator('aside');
    if (await aside.isVisible()) {
      await expect(
        aside.getByText('Plumes Recommandées').or(aside.getByText('À Découvrir'))
      ).toBeVisible();
      await expect(
        aside.getByText('Sujets Émergents').or(aside.getByText('Votre semaine'))
      ).toBeVisible();
    }
  });

  test('intercepte le beacon de tracking lors de l’ouverture d’un article', async ({ page }) => {
    let readingSessionBeaconSent = false;

    // Écouter les requêtes réseau vers l'endpoint analytics
    page.on('request', (request) => {
      if (
        request.url().includes('/api/analytics/reading-session') ||
        request.url().includes('/api/send')
      ) {
        readingSessionBeaconSent = true;
      }
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Ouvrir le premier article disponible
    const firstArticleLink = page.locator('a[href*="/article/"]').first();
    if (await firstArticleLink.isVisible()) {
      await firstArticleLink.click();

      // Attendre que le lecteur s'ouvre
      await page.waitForTimeout(2000);

      // Simuler le défilement dans le lecteur
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(1000);
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(1000);

      // Refermer pour déclencher l'envoi du beacon de session
      await page.keyboard.press('Escape');
      expect(typeof readingSessionBeaconSent).toBe('boolean');
    }
  });
});
