// =====================================================================
// 🗺️ routes.spec.ts — matrice de routes : CHAQUE page est rendue
// =====================================================================
// Les specs existantes vérifient des parcours choisis ; aucune ne garantit
// qu'une page du produit est au moins rendue une fois. C'est exactement le
// trou qui a laissé passer /pricing cassée à l'hydratation pendant des
// semaines (la page répondait 200).
//
// Ici :
//   • chaque page core découverte sur le disque est visitée (rendu réel ou
//     redirection d'auth, jamais 5xx, jamais l'error boundary, jamais
//     d'erreur d'hydratation) ;
//   • chaque page admin est visitée anonymement (contrat de redirection) ;
//   • une garde échoue si une page existe sans être ni visitée ni exemptée.
// =====================================================================

import { test, expect, type Page } from '@playwright/test';
import { discoverPages, uncoveredPages } from './lib/route-inventory';
import { CRASH_TEXT, watchErrors } from './lib/hydration';

interface RouteCase {
  path: string;
  /** 404 attendue (route qui n'existe plus / donnée absente). */
  allowNotFound?: boolean;
}

/**
 * Pages publiques ou redirigées vers /login pour un visiteur anonyme.
 * Les pages d'auth (settings, library, messages…) finissent sur /login :
 * c'est un rendu valide, ce qu'on interdit c'est un 5xx ou un crash.
 */
const CORE_CASES: RouteCase[] = [
  { path: '/' },
  { path: '/home' },
  { path: '/pricing' },
  { path: '/search' },
  { path: '/login' },
  { path: '/exit' },
  { path: '/support' },
  { path: '/onboarding' },
  { path: '/settings' },
  { path: '/settings/notifications' },
  { path: '/billing' },
  { path: '/library' },
  { path: '/library/ebooks' },
  { path: '/library/ebooks/notes' },
  { path: '/history' },
  { path: '/highlights' },
  { path: '/messages' },
  { path: '/notifications' },
  { path: '/appeals' },
  // Route dynamique générique /[username]/[tab] : c'est ainsi que sont servis
  // les articles autonomes. Les slugs viennent du seed CI ; sur une base locale
  // sans ce contenu, la page doit toujours rendre proprement sa 404 (jamais 5xx).
  { path: '/article/souverainete-medias-independants', allowNotFound: true },
  { path: '/article/essai-premium-souverainete', allowNotFound: true },
  { path: '/ce-chemin-nexiste-pas', allowNotFound: true },
];

/**
 * Pages qu'un test ne peut pas atteindre sans données dédiées. Chaque
 * exemption doit dire POURQUOI et où la couverture est assurée ailleurs.
 */
const CORE_EXEMPT: Record<string, string> = {
  '/[username]': 'profil public : rendu couvert par /ephe (404 propre si absent du seed)',
  '/[username]/a/[slug]': 'variante article scopée auteur : couverte par les contrats Go + tenants',
  '/[username]/thought/[id]': 'exige un id de pensée seedé (couvert par core-journeys thread)',
  '/thought/[...slug]': 'exige un slug de pensée seedé (couvert par core-journeys)',
  '/l/[code]': 'permalien court : rendu couvert par /l/code-inconnu (404 propre)',
  '/settings/[section]':
    'sections dynamiques de réglages : /settings + /settings/notifications visités',
  '/library/ebooks/[id]': 'exige un EPUB importé (couvert par les tests d’import ebook)',
  '/oauth/authorize': 'exige un client OAuth + PKCE valides (couvert par oauth-consent.spec.ts)',
  '/subscribe-with-qoefi': 'parcours d’abonnement à paramètres signés (couvert par billing.spec)',
};

/** Une page doit répondre < 500, ne pas afficher l'error boundary et ne
 *  signaler aucune erreur d'hydratation. */
async function visit(
  page: Page,
  url: string,
  { allowNotFound = false }: { allowNotFound?: boolean } = {}
): Promise<void> {
  const hydrationErrors = watchErrors(page);

  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  expect(response, `aucune réponse pour ${url}`).not.toBeNull();
  const status = response?.status() ?? 0;

  expect(status, `${url} a répondu ${status}`).toBeLessThan(500);
  if (!allowNotFound) expect(status, `${url} a répondu ${status}`).toBeLessThan(400);

  await expect(page.locator('body'), `${url} affiche l'error boundary`).not.toContainText(
    CRASH_TEXT
  );

  // L'erreur d'hydratation est émise après le chargement des chunks.
  await page.waitForTimeout(1500);
  const errors = hydrationErrors();
  expect(errors, `Hydratation en échec sur ${url} :\n${errors.join('\n\n')}`).toEqual([]);
}

test.describe('Matrice de routes — core', () => {
  for (const route of CORE_CASES) {
    test(`rend ${route.path}`, async ({ page }) => {
      await visit(page, route.path, { allowNotFound: route.allowNotFound });
    });
  }

  test('inventaire : aucune page core sans test', () => {
    const missing = uncoveredPages(
      'core',
      CORE_CASES.map((route) => route.path),
      Object.keys(CORE_EXEMPT)
    );
    expect(
      missing,
      `Pages core découvertes mais jamais rendues par un test.\n` +
        `Ajoute un cas dans CORE_CASES ou une exemption motivée dans CORE_EXEMPT :\n` +
        missing.map((page) => `  - ${page}`).join('\n')
    ).toEqual([]);
  });
});

// La console est servie sur admin.lvh.me (lvh.me résout vers 127.0.0.1, en CI
// comme en local) et n'a PAS de page /login : son layout (admin)/admin redirige
// un visiteur anonyme vers le login du site lecteur, sur le port 3010. Le
// contrat à prouver est donc « toute page admin → login core », jamais un 5xx.
//
// L'URL est surchargeable, mais en CI son absence doit échouer bruyamment :
// une matrice sautée en silence, c'est 39 pages non testées qui passent pour
// vertes.
const ADMIN_URL = process.env.PLAYWRIGHT_ADMIN_URL ?? 'http://admin.lvh.me:15405';
const LOGIN_PATH = '/login';

test.describe('Matrice de routes — admin (visiteur anonyme)', () => {
  test("PLAYWRIGHT_ADMIN_URL est défini quand la CI l'exige", () => {
    if (process.env.CI && !process.env.PLAYWRIGHT_ADMIN_URL) {
      throw new Error(
        'PLAYWRIGHT_ADMIN_URL absent en CI : la matrice admin serait sautée sans que ' +
          'personne ne le voie. Déclare-le dans le job E2E (http://admin.lvh.me:15405).'
      );
    }
  });

  const pages = discoverPages('admin');

  test("l'inventaire admin n'est pas vide (découverte cassée)", () => {
    expect(pages.length).toBeGreaterThanOrEqual(30);
  });

  // Le layout compile une fois pour toutes ; sans ce préchauffage le premier
  // appel paie la compilation Turbopack (~12 s local, plus en CI froide).
  test.beforeAll(async ({ playwright }) => {
    const api = await playwright.request.newContext();
    await api.get(`${ADMIN_URL}/admin`, { maxRedirects: 0, timeout: 120_000 });
    await api.dispose();
  });

  // ⚠️ On n'ouvre PAS 39 navigateurs : le layout redirige avant tout rendu,
  // donc le contrat vérifiable est la réponse HTTP (307 + Location). Naviguer
  // chargeait 39 fois la page de login du site lecteur — correct, mais 20 min
  // de CI pour prouver un en-tête.
  for (const pattern of pages) {
    test(`redirige ${pattern} vers le login`, async ({ request }) => {
      // Les segments dynamiques reçoivent une valeur fictive : ils doivent
      // rediriger comme les autres, jamais répondre 5xx.
      const pathname = pattern
        .replace(/\[\.\.\.[^\]]+\]/g, 'inconnu')
        .replace(/\[[^\]]+\]/g, 'inconnu');

      const response = await request.get(`${ADMIN_URL}${pathname}`, { maxRedirects: 0 });
      const status = response.status();
      const location = response.headers()['location'] ?? '';

      // Le contrat d'accès d'abord : jamais 200 (écran métier servi à un
      // anonyme), jamais 404, jamais 5xx — une redirection, toujours.
      expect([307, 308], `${pattern} a répondu ${status} au lieu d'une redirection`).toContain(
        status
      );

      if (pattern === '/') {
        // La racine de la console renvoie d'abord vers /admin (même hôte).
        expect(location, `la racine devrait renvoyer vers /admin, Location=${location}`).toMatch(
          /\/admin$/
        );
      } else {
        expect(
          location,
          `${pattern} devrait renvoyer vers ${LOGIN_PATH}, Location=${location}`
        ).toContain(`${LOGIN_PATH}?redirect=`);
      }
    });
  }

  // Une seule navigation réelle : prouve que la redirection aboutit sur une page
  // qui se rend et s'hydrate (le reste de la matrice n'a pas de HTML à hydrater).
  test('la redirection aboutit sur le login du site lecteur', async ({ page }) => {
    test.setTimeout(90_000);
    const hydrationErrors = watchErrors(page);

    const response = await page.goto(`${ADMIN_URL}/admin`, {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    expect(response, 'aucune réponse pour /admin').not.toBeNull();
    expect(response?.status()).toBeLessThan(400);

    await expect(page.locator('body'), '/admin affiche l’error boundary').not.toContainText(
      CRASH_TEXT
    );
    expect(new URL(page.url()).pathname, `on est sur ${page.url()}`).toBe(LOGIN_PATH);

    await page.waitForTimeout(1500);
    const errors = hydrationErrors();
    expect(errors, `Hydratation en échec après redirection :\n${errors.join('\n\n')}`).toEqual([]);
  });
});
