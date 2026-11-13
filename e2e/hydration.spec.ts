// =====================================================================
// 🧪 hydration.spec.ts — garde-fou contre les erreurs d'hydratation React
// =====================================================================
// Une divergence entre le HTML rendu par le serveur et le premier rendu
// client ne casse pas forcément la page : React régénère l'arbre côté
// navigateur et l'écran reste correct. Les smoke tests « la page répond
// 200 » ne voient donc rien (vécu le 13/11 sur /pricing : React #418, un
// espace perdu par le SSR après <strong>, resté invisible en production).
//
// On échoue dès qu'un motif d'hydratation apparaît dans la console ou en
// pageerror, que React soit en développement (message complet) ou en
// production (erreur minifiée #418 / #423 / #425).
// =====================================================================

import { test, expect } from '@playwright/test';

// Pages publiques rendues côté serveur : c'est là que le SSR et le client
// doivent produire exactement le même texte.
const ROUTES = ['/home', '/pricing', '/login', '/search'];

const HYDRATION_ERROR = [
  /Hydration failed/i,
  /server rendered (text|HTML) didn't match/i,
  /Text content does not match/i,
  /Expected server HTML to contain/i,
  /A tree hydrated but some attributes/i,
  /Minified React error #(418|419|421|422|423|425)/,
];

test.describe('Hydratation React', () => {
  for (const route of ROUTES) {
    test(`${route} s'hydrate sans divergence serveur/client`, async ({ page }) => {
      const messages: string[] = [];
      page.on('pageerror', (error) => messages.push(String(error)));
      page.on('console', (message) => {
        if (message.type() === 'error') messages.push(message.text());
      });

      const response = await page.goto(route, { waitUntil: 'load' });
      expect(response?.status(), `statut HTTP de ${route}`).toBeLessThan(400);

      // L'hydratation démarre avec les chunks : on laisse le temps à React
      // de signaler une éventuelle divergence avant de conclure.
      await page.waitForTimeout(3000);

      const hydrationErrors = messages.filter((message) =>
        HYDRATION_ERROR.some((pattern) => pattern.test(message))
      );
      expect(
        hydrationErrors,
        `Hydratation en échec sur ${route} :\n${hydrationErrors.join('\n\n')}`
      ).toEqual([]);
    });
  }
});
