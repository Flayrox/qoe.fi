// =====================================================================
// 🌐 E2E PLAYWRIGHT — SMOKE TESTS DE RÉSILIENCE ZÉRO-CRASH (Chromium)
// =====================================================================
// Navigue sur les pages de l'application et valide :
// 1. Qu'aucune exception client non gérée (pageerror) n'est émise
// 2. Que le serveur Next.js ne renvoie aucune erreur HTTP 500
// 3. Que les avatars, widgets et flux se rendent de manière stable
// =====================================================================

import { test, expect } from '@playwright/test';
import { settleHydration } from './lib/settle';
import { supabaseReachable } from './lib/auth';

test.describe('🛡️ E2E — Zéro-Crash Navigation Smoke Tests', () => {
  // 🚦 `/home` et `/` (feed personnalisé) exigent une session réelle : sans
  // GoTrue local, la page rendue est celle du login. On saute explicitement
  // plutôt que de valider une page qui n'est pas celle du test.
  test.beforeAll(async () => {
    test.skip(
      !(await supabaseReachable()),
      'Supabase local requis (supabase start) : /home résout la session via GoTrue.'
    );
  });

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

    // Attendre le montage de tous les micro-composants (avatars, sidebar,
    // widgets) par un état observable (réseau au repos + frames React), au
    // lieu d'une durée fixe.
    await settleHydration(page);

    // Valider 0 crash
    expect(errors.filter((e) => !e.includes('ResizeObserver'))).toHaveLength(0);
  });

  test('charge la barre de navigation et affiche l’avatar utilisateur sans exception', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/', { waitUntil: 'domcontentloaded' });

    // La barre de navigation est un contrat de l'écran connecté : on l'exige,
    // au lieu de la conditionner à sa propre visibilité (assertion qui ne
    // pouvait pas échouer).
    const nav = page.locator('header, nav, [aria-label*="profil"], [aria-label*="Profil"]').first();
    await expect(nav).toBeVisible({ timeout: 15_000 });

    expect(pageErrors.filter((e) => !e.includes('ResizeObserver'))).toHaveLength(0);
  });
});
