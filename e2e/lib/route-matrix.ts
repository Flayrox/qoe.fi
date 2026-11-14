// =====================================================================
// 🗺️ e2e/lib/route-matrix.ts — matrice de routes pour une app secondaire
// =====================================================================
// Même contrat que la matrice core (e2e/routes.spec.ts), mais sans supposer
// qu'une page est publique : on découvre les pages sur le disque et on exige
// qu'AUCUNE ne soit muette.
//
// Contrat vérifié par page :
//   • jamais 5xx (une page qui plante est une régression, pas un détail) ;
//   • jamais le texte de l'error boundary ;
//   • une redirection doit porter un `Location` (sinon l'auth renvoie un 307
//     dans le vide) ;
//   • l'inventaire ne doit pas se vider (découverte cassée = matrice qui ne
//     teste plus rien).
//
// Le statut réel de chaque page est écrit dans le log (`app path → status`) :
// un job vert doit dire ce qui a été rendu, pas seulement compter.
// =====================================================================

import { test, expect } from '@playwright/test';
import { discoverPages, type AppName } from './route-inventory';
import { CRASH_TEXT } from './hydration';

/** Minimum attendu par app : si la découverte casse, la matrice devient vide. */
const MIN_PAGES: Record<AppName, number> = {
  core: 20,
  admin: 30,
  studio: 20,
  tenants: 12,
  hi: 3,
};

/** Segments dynamiques → valeur fictive : la page doit rendre ou rediriger. */
export function concretePath(pattern: string): string {
  return pattern.replace(/\[\.\.\.[^\]]+\]/g, 'inconnu').replace(/\[[^\]]+\]/g, 'inconnu') || '/';
}

export function registerRouteMatrix(app: AppName): void {
  const pages = discoverPages(app);

  test.describe(`Matrice de routes — ${app}`, () => {
    test(`l'inventaire ${app} n'est pas vide (découverte cassée)`, () => {
      expect(
        pages.length,
        `Aucune page découverte pour ${app} : la matrice ne testerait rien.`
      ).toBeGreaterThanOrEqual(MIN_PAGES[app]);
    });

    for (const pattern of pages) {
      test(`rend ${pattern}`, async ({ request }) => {
        // Premier hit = compilation de la route en dev : budget large et borné.
        test.setTimeout(120_000);
        const path = concretePath(pattern);

        const response = await request.get(path, { maxRedirects: 0 });
        const status = response.status();
        console.log(`[${app}] ${path} → ${status}`);

        // Une page ne doit jamais planter, quel que soit l'accès.
        expect(status, `${app}${path} a répondu ${status}`).toBeLessThan(500);

        if (status >= 300 && status < 400) {
          // Redirection d'auth : elle doit dire où aller.
          const location = response.headers()['location'];
          expect(location, `${app}${path} redirige sans en-tête Location`).toBeTruthy();
          return;
        }

        const body = await response.text();
        expect(body, `${app}${path} affiche l'error boundary`).not.toContain(CRASH_TEXT);
        expect(body.trim().length, `${app}${path} renvoie un corps vide`).toBeGreaterThan(0);
      });
    }
  });
}
