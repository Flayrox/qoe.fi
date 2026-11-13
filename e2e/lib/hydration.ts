// =====================================================================
// 🧬 e2e/lib/hydration.ts — détection des erreurs d'hydratation React
// =====================================================================
// Une divergence entre le HTML rendu par le serveur et le premier rendu
// client ne casse pas forcément la page : React régénère l'arbre côté
// navigateur et l'écran reste correct. Les smoke tests « la page répond
// 200 » ne voient donc rien (vécu le 13/11 sur /pricing : React #418, un
// espace perdu par le SSR après <strong>, invisible en production).
//
// Partagé par hydration.spec.ts et routes.spec.ts.
// =====================================================================

import type { Page } from '@playwright/test';

export const HYDRATION_ERROR = [
  /Hydration failed/i,
  /server rendered (text|HTML) didn't match/i,
  /Text content does not match/i,
  /Expected server HTML to contain/i,
  /A tree hydrated but some attributes/i,
  /Minified React error #(418|419|421|422|423|425)/,
];

/** Message affiché par l'error boundary globale de Next quand une page
 *  plante au rendu — invisible pour un simple `expect(status).toBe(200)`. */
export const CRASH_TEXT = "This page couldn't load";

/**
 * Branche les listeners pageerror + console et renvoie un getter des seules
 * erreurs d'hydratation detectees depuis l'ouverture de la page.
 */
export function watchErrors(page: Page): () => string[] {
  const messages: string[] = [];

  page.on('pageerror', (error) => messages.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') messages.push(message.text());
  });

  return () =>
    messages.filter((message) => HYDRATION_ERROR.some((pattern) => pattern.test(message)));
}
