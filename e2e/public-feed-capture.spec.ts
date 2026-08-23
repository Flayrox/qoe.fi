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
    const impressionRequests: string[] = [];
    const readingRequests: string[] = [];
    const impressionStatuses: number[] = [];
    const readingStatuses: number[] = [];

    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('/api/analytics/feed-impression')) impressionRequests.push(url);
      if (url.includes('/api/analytics/reading-session')) readingRequests.push(url);
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
    const articleLink = page.locator('a[href*="/article/"]').first();
    await articleLink.click();
    await expect(page.locator('#article-content')).toBeVisible({ timeout: 20_000 });

    await page.keyboard.press('Escape');
    await expect.poll(() => readingRequests.length, { timeout: 30_000 }).toBeGreaterThan(0);
    await expect.poll(() => readingStatuses.length, { timeout: 30_000 }).toBeGreaterThan(0);
    for (const status of readingStatuses) {
      expect(status).toBe(200);
    }
  });
});
