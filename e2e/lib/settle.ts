// =====================================================================
// ⏳ e2e/lib/settle.ts — attente déterministe de l'hydratation
// =====================================================================
// Remplace les `waitForTimeout(...)` qui faisaient passer un cas au vert
// « parce qu'on avait attendu assez longtemps » : on attend un ÉTAT (réseau au
// repos + frames de commit React) au lieu d'une durée arbitraire, qui variait
// avec la charge de la machine et le nombre de workers.
// =====================================================================

import type { Page } from '@playwright/test';

/**
 * Attend la fin de l'hydratation de la page courante.
 *
 * 1. `networkidle` : les chunks d'hydratation sont arrivés et les actions
 *    serveur de l'écran sont résolues. Le websocket HMR de `next dev` ne
 *    compte pas dans ce calcul, mais l'attente est bornée : un écran bavard
 *    ne doit pas transformer un cas en timeout de 30 s.
 * 2. Deux frames consécutives : le commit React de l'hydratation puis ses
 *    effets. C'est la fenêtre où React émet #418/#423/#425.
 */
export async function settleHydration(page: Page, timeoutMs = 15_000): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => {});
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );
}
