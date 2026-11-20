// =====================================================================
// 🎯 E2E — Capture du feed « Pour vous » (lecteur anonyme)
// =====================================================================
// Vérifie que le flux se charge réellement au navigateur et que la chaîne
// de capture part bien de bout en bout pour un visiteur NON connecté :
//   • impressions du feed (IntersectionObserver → /api/analytics/feed-impression)
//   • session de lecture (drawer → sendBeacon → /api/analytics/reading-session)
//
// Ces deux endpoints doivent répondre 200 SANS token : le backend Go les
// accepte en auth optionnelle (userID vide, completionRate quand même mis
// à jour, impressions avec userId NULL). show-less reste réservé aux
// connectés (401 côté handler) — non testé ici.
//
// Prérequis : base seedée + qoe-server Go (QOE_API_URL) — comme
// public-reading.spec.ts.
// =====================================================================

import { test, expect } from '@playwright/test';

test.describe('Capture du feed (public)', () => {
  test('le feed charge et les impressions + la lecture anonyme sont captées (200)', async ({
    page,
  }) => {
    // En CI, ce parcours est le premier à toucher le serveur Next (compilation
    // à froid) puis l'API Go (premier hit Redis/DB) : les 4 attentes bornées de
    // ce cas (30 s chacune) dépassaient le budget par défaut de 60 s, d'où un
    // flaky « 1 flaky » au run 43520531800. Le budget, pas les assertions.
    test.setTimeout(120_000);

    const impressionRequests: string[] = [];
    const readingRequests: string[] = [];
    const impressionStatuses: number[] = [];
    const readingStatuses: number[] = [];
    const readingStatusesSent: string[] = [];

    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/api/analytics/feed-impression')) impressionRequests.push(url);
      if (url.includes('/api/analytics/reading-session')) {
        readingRequests.push(url);
        try {
          const body = req.postDataJSON() as { status?: string };
          if (body?.status) readingStatusesSent.push(body.status);
        } catch {
          // sendBeacon : postDataJSON peut échouer sur certains formats
        }
      }
    });
    page.on('response', (res) => {
      const url = res.url();
      if (url.includes('/api/analytics/feed-impression')) impressionStatuses.push(res.status());
      if (url.includes('/api/analytics/reading-session')) readingStatuses.push(res.status());
    });

    await page.goto('/', { waitUntil: 'networkidle' });

    // 1. Le feed « Pour vous » a rendu des cartes (articles ou pensées).
    await expect(page.locator('article').first()).toBeVisible({ timeout: 30_000 });

    // 2. Les impressions (fire-once, batchées) partent vers l'API…
    await expect.poll(() => impressionRequests.length, { timeout: 30_000 }).toBeGreaterThan(0);
    // … et sont acceptées par le backend (200) → capture anonyme OK.
    await expect.poll(() => impressionStatuses.length, { timeout: 30_000 }).toBeGreaterThan(0);
    for (const status of impressionStatuses) {
      expect(status).toBe(200);
    }

    // 3. Lecture : ouvrir le premier article du feed, puis fermer → la
    //    session de lecture (sendBeacon au démontage) doit partir et être 200.
    //
    //    Le href d'une carte est **résolu dynamiquement** par
    //    `getArticleUrl(article, { preferTenant: true })` :
    //      • `/{propriétaire}/a/{slug}` sur le core quand la publication n'a
    //        pas de site dédié ;
    //      • `http://{sous-domaine}.…/article/{slug}` quand elle en a un
    //        (`routes.tenant.article`, forme tenant légitime, 308 vers la
    //        canonique `/{catégorie}/{slug}`).
    //    C'est le sous-domaine de la publication, et non l'hôte de la page,
    //    qui décide de la forme (`resolveAppUrl('tenant', …)` est
    //    inconditionnel dès qu'un sous-domaine existe) : figer `/a/` faisait
    //    échouer ce cas sur toute base seedée avec des médias tenant.
    //    L'assertion reste complète : lien d'article résolu, drawer ouvert sur
    //    CET article, session de lecture envoyée et acceptée en 200.
    const firstCard = page.locator('article[data-overlay-anchor]').first();
    const articleLink = firstCard.locator('a[href*="/a/"], a[href*="/article/"]').first();
    await expect(articleLink).toHaveAttribute('href', /\/(?:a|article)\/[^/?#]+$/);
    // Le clic sur la couverture est le contrat DOM du feed (le href reste la
    // cible « nouvel onglet » du média) : il ouvre le drawer in-app.
    await firstCard.locator('[data-article-cover]').click();
    await expect(page.locator('#article-content')).toBeVisible({ timeout: 20_000 });

    // 🛡️ `useArticleReadingTracker` §4 ignore VOLONTAIREMENT les sessions
    // fantômes (`finalDwell === 0 && finalScroll === 0`, montage/démontage
    // StrictMode) : sans un tick de dwell ou un scroll, aucune session n'est
    // envoyée — c'est la règle produit, pas un aléa. On laisse donc la mesure
    // s'ouvrir une seconde avant de fermer, au lieu de dépendre du temps que
    // mettaient les assertions précédentes.
    await page.waitForTimeout(1_500);

    await page.keyboard.press('Escape');
    await expect.poll(() => readingRequests.length, { timeout: 30_000 }).toBeGreaterThan(0);
    await expect.poll(() => readingStatuses.length, { timeout: 30_000 }).toBeGreaterThan(0);
    for (const status of readingStatuses) {
      expect(status).toBe(200);
    }
    // La session porte un statut valide (BOUNCE/SKIM/READ_PARTIAL/READ_COMPLETE).
    const valid = new Set(['BOUNCE', 'SKIM', 'READ_PARTIAL', 'READ_COMPLETE']);
    expect(readingStatusesSent.length).toBeGreaterThan(0);
    for (const s of readingStatusesSent) {
      expect(valid.has(s)).toBe(true);
    }
  });
});
