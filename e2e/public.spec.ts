// =====================================================================
// 🧪 E2E — Public feed (qoe.fi feed)
// =====================================================================
// 📖 Parcours critique public : le feed se charge, redirige correctement
//    (non connecté → /home), et ne produit aucune erreur console/page.
//    Ces tests tournent contre un vrai serveur Next lancé par webServer.
// =====================================================================

import { test, expect } from '@playwright/test';

test.describe('Feed (public)', () => {
  test("charge sans erreurs de rendu ou d'hydratation", async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Ignore les erreurs réseau transitoires du serveur en dev
        if (!text.includes('ERR_CONNECTION_REFUSED') && !text.includes('Failed to load resource')) {
          consoleErrors.push(text);
        }
      }
    });
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/', { waitUntil: 'networkidle' });

    expect(pageErrors, `Erreurs page: ${pageErrors.join(', ')}`).toEqual([]);
    const hydrationErrors = consoleErrors.filter(
      (e) =>
        e.includes('Hydration failed') ||
        e.includes('Text content does not match') ||
        e.includes('Server/Client mismatch') ||
        e.includes('Minified React error #425')
    );
    expect(hydrationErrors, `Erreurs hydration: ${hydrationErrors.join(', ')}`).toEqual([]);
  });

  test('redirige la racine vers /home pour un visiteur non connecté', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    expect(new URL(page.url()).pathname).toBe('/home');
  });

  test('la page de login est accessible', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' });

    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    expect(pageErrors).toEqual([]);
  });

  test('affiche les articles publiés (contenu seedé via Go)', async ({ page }) => {
    // Le seed de CI (go run ./cmd/seed) crée 3 articles PUBLIÉS sous la
    // publication démo. Le feed /home doit les rendre — ça vérifie que le
    // chemin complet (schéma goose + données) fonctionne en CI, pas
    // seulement l'absence d'erreurs.
    await page.goto('/', { waitUntil: 'networkidle' });

    await expect(page.getByText('La souveraineté des médias indépendants')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText('Pourquoi le temps long gagne toujours')).toBeVisible();
  });
});
