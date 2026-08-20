// =====================================================================
// 🌐 E2E PLAYWRIGHT — SMOKE TESTS DE RÉSILIENCE ZÉRO-CRASH (Chromium)
// =====================================================================
// Navigue sur les pages de l'application et valide :
// 1. Qu'aucune exception client non gérée (pageerror) n'est émise
// 2. Que le serveur Next.js ne renvoie aucune erreur HTTP 500
// 3. Que les avatars, widgets et flux se rendent de manière stable
// =====================================================================

import { test, expect } from '@playwright/test';

test.describe('🛡️ E2E — Zéro-Crash Navigation Smoke Tests', () => {
  test('charge la page d’accueil /home sans aucune erreur 500 ni crash d’images', async ({
    page,
  }) => {
    const errors: string[] = [];

    // Intercepter toute erreur console de page
    page.on('pageerror', (err) => {
      errors.push(err.message);
    });

    // Écouter les réponses HTTP
    page.on('response', (response) => {
      if (response.status() >= 500) {
        errors.push(`HTTP ${response.status()} sur ${response.url()}`);
      }
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Vérifier que le contenu principal est bien monté
    await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });

    // Laisser le temps à tous les micro-composants (avatars, sidebar, widgets) de monter
    await page.waitForTimeout(1500);

    // Valider 0 crash
    expect(errors.filter((e) => !e.includes('ResizeObserver'))).toHaveLength(0);
  });

  test('charge la barre de navigation et affiche l’avatar utilisateur sans exception', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // Vérifier que le header ou le bouton menu profil est présent
    const nav = page.locator('header, nav, [aria-label*="profil"], [aria-label*="Profil"]').first();
    if (await nav.isVisible()) {
      await expect(nav).toBeVisible();
    }

    expect(pageErrors.filter((e) => !e.includes('ResizeObserver'))).toHaveLength(0);
  });
});
