// =====================================================================
// 🏗️ E2E — Parcours public des tenants (apps/tenants)
// =====================================================================
// HERMÉTIQUE : ce spec ne dépend PLUS du seed. Il crée lui-même sa
// publication MEDIA (et sa publication personnelle) + ses articles via pg,
// puis vérifie la résolution par sous-domaine (GET /v1/publications/by-domain
// via l'API Go), le rendu home/article et l'étanchéité du paywall.
//
// Le tenant média porte un article premium dont le passage réservé est une
// sentinelle : elle ne doit apparaître NI dans le HTML, NI dans les
// métadonnées OpenGraph/JSON-LD servies à un visiteur anonyme.
// =====================================================================

import { test, expect } from '@playwright/test';
import { TestDb } from './lib/db';
import { DATABASE_URL, GO_API_URL } from './lib/env';

// ─── Fixtures déterministes (créées et nettoyées par le spec) ──────────
const MEDIA = {
  id: 'pub_e2e_media',
  subdomain: 'media-e2e',
  name: 'Le Média E2E',
  authorId: '00000000-0000-4000-8000-00000000e2e1',
  authorEmail: 'e2e-media@qoe.test',
  authorUsername: 'e2e_media_editor',
} as const;

const SECRET = 'SECRET-E2E-RESERVE-ABONNES';
const MEDIA_ARTICLE = {
  id: 'art_e2e_media_1',
  slug: 'enquete-e2e-media',
  title: 'Enquête E2E : qui détient vraiment le pouvoir local ?',
  content:
    '<h2>Contexte</h2><p>Premier paragraphe offert à tous les visiteurs du Média E2E.</p>' +
    '<p>Deuxième paragraphe : le teaser public continue.</p>' +
    '<!--members-only-->' +
    `<p>${SECRET} — la suite de l'enquête est réservée aux abonnés.</p>`,
} as const;

const PERSONAL = {
  id: 'pub_e2e_personal',
  subdomain: 'ecrivain-e2e',
  name: 'Le Carnet E2E',
  authorId: '00000000-0000-4000-8000-00000000e2e2',
  authorEmail: 'e2e-carnet@qoe.test',
  authorUsername: 'e2e_carnet_author',
} as const;

const PERSONAL_ARTICLE = {
  id: 'art_e2e_personal_1',
  slug: 'carnet-e2e-ouverture',
  title: 'Carnet E2E : ouverture de l’atelier',
} as const;

test.describe('Parcours public tenants — hermétique', () => {
  // ⚠️ Serial : le spec crée un tenant partagé et le NETTOIE en afterAll.
  // En parallèle, chaque worker rejouerait beforeAll/afterAll et un worker
  // rapide supprimerait le fixture pendant qu'un autre s'en sert (404 aléatoire).
  test.describe.configure({ mode: 'serial' });

  let db: TestDb;

  test.beforeAll(async ({ request }) => {
    expect(DATABASE_URL, 'DATABASE_URL requis (base de dev/CI)').toBeTruthy();
    expect(GO_API_URL, 'QOE_API_URL requis (API Go)').toBeTruthy();
    db = new TestDb(DATABASE_URL);
    await db.connect();

    // Tenant média (+ article premium à sentinelle).
    await db.ensurePublication({
      id: MEDIA.id,
      subdomain: MEDIA.subdomain,
      name: MEDIA.name,
      type: 'MEDIA',
      authorId: MEDIA.authorId,
      authorEmail: MEDIA.authorEmail,
      authorUsername: MEDIA.authorUsername,
    });
    await db.ensureArticle({
      id: MEDIA_ARTICLE.id,
      publicationId: MEDIA.id,
      authorId: MEDIA.authorId,
      title: MEDIA_ARTICLE.title,
      slug: MEDIA_ARTICLE.slug,
      content: MEDIA_ARTICLE.content,
      published: true,
      isPremium: true,
      visibility: 'PAID_SUBSCRIBERS',
      readingTime: 4,
    });

    // Tenant personnel (+ article public).
    await db.ensurePublication({
      id: PERSONAL.id,
      subdomain: PERSONAL.subdomain,
      name: PERSONAL.name,
      type: 'PERSONAL',
      authorId: PERSONAL.authorId,
      authorEmail: PERSONAL.authorEmail,
      authorUsername: PERSONAL.authorUsername,
      isCertified: false,
    });
    await db.ensureArticle({
      id: PERSONAL_ARTICLE.id,
      publicationId: PERSONAL.id,
      authorId: PERSONAL.authorId,
      title: PERSONAL_ARTICLE.title,
      slug: PERSONAL_ARTICLE.slug,
      content: '<p>Un carnet personnel, entièrement public.</p>',
      published: true,
      isPremium: false,
    });

    // Warm-up : en dev, Next compile les routes à la première requête — un
    // premier appel non suivi évite un 404 « route non encore compilée ».
    for (const path of [
      `/tenant/${PERSONAL.subdomain}`,
      `/tenant/${MEDIA.subdomain}`,
      `/tenant/${MEDIA.subdomain}/article/${MEDIA_ARTICLE.slug}`,
    ]) {
      await request.get(path, { timeout: 60_000 }).catch(() => {});
    }
  });

  test.afterAll(async () => {
    if (!db) return;
    // Nettoyage : ce spec ne doit pas polluer la base partagée.
    for (const id of [MEDIA_ARTICLE.id, PERSONAL_ARTICLE.id]) {
      await db.deleteArticle(id).catch(() => {});
    }
    for (const id of [PERSONAL.id, MEDIA.id]) {
      await db.deletePublication(id).catch(() => {});
    }
    await db.close();
  });

  test('la home d’un tenant personnel se résout et rend sa publication', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto(`/tenant/${PERSONAL.subdomain}`, { waitUntil: 'networkidle' });
    await expect(page.getByText(PERSONAL.name).first()).toBeVisible({ timeout: 30_000 });
    expect(pageErrors).toEqual([]);
  });

  test('un tenant média rend son nom et son article', async ({ page }) => {
    await page.goto(`/tenant/${MEDIA.subdomain}`, { waitUntil: 'networkidle' });
    await expect(page.getByText(MEDIA.name).first()).toBeVisible({ timeout: 30_000 });

    await page.goto(`/tenant/${MEDIA.subdomain}/article/${MEDIA_ARTICLE.slug}`, {
      waitUntil: 'networkidle',
    });
    await expect(page.getByText(MEDIA_ARTICLE.title).first()).toBeVisible({ timeout: 30_000 });
  });

  test('🔒 zéro-fuite : le passage réservé n’apparaît ni dans le HTML ni dans les métadonnées', async ({
    page,
  }) => {
    await page.goto(`/tenant/${MEDIA.subdomain}/article/${MEDIA_ARTICLE.slug}`, {
      waitUntil: 'networkidle',
    });
    // Le teaser public reste servi.
    await expect(page.getByText('Premier paragraphe offert').first()).toBeVisible({
      timeout: 30_000,
    });

    // 1. HTML complet (SSR + hydratation) : aucune trace du passage réservé.
    const html = await page.content();
    expect(html).not.toContain(SECRET);

    // 2. Métadonnées SEO/OpenGraph/Twitter servies au crawler.
    const metaDescriptions = await page
      .locator(
        'meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]'
      )
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('content') || ''));
    for (const meta of metaDescriptions) {
      expect(meta).not.toContain(SECRET);
    }

    // 3. Données structurées JSON-LD.
    const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents();
    for (const block of jsonLd) {
      expect(block).not.toContain(SECRET);
    }
  });

  test('un sous-domaine inconnu rend une 404 propre', async ({ page }) => {
    const response = await page.goto('/tenant/sous-domaine-inexistant', {
      waitUntil: 'networkidle',
    });
    expect(response?.status()).toBe(404);
  });
});
