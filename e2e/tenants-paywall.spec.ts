// =====================================================================
// 🔒 E2E — Parcours Paywall & Déverrouillage à l'acte (Tenant)
// =====================================================================
// HERMÉTIQUE : ce spec ne dépend PLUS du seed. Il crée lui-même une
// publication tenant + un article premium au contenu maîtrisé (sentinelle
// post-paywall) via pg, puis vérifie :
//   1. l'étanchéité zéro-fuite (Server-side PaywallCut) : HTML SSR,
//      métadonnées OpenGraph/Twitter et JSON-LD sans le passage réservé ;
//   2. l'ergonomie premium de la carte paywall (verre dépoli, typographie
//      soignée, absence de police monospace, tarification claire).
// =====================================================================

import { test, expect } from '@playwright/test';
import { TestDb } from './lib/db';
import { DATABASE_URL } from './lib/env';

// ─── Fixtures déterministes (créées et nettoyées par le spec) ──────────
const PAYWALL = {
  id: 'pub_e2e_paywall',
  subdomain: 'paywall-e2e',
  name: 'La Revue E2E',
  authorId: '00000000-0000-4000-8000-00000000e2e3',
  authorEmail: 'e2e-paywall@qoe.test',
  authorUsername: 'e2e_paywall_author',
} as const;

const SECRET = 'SECRET-E2E-PAYWALL-RESERVE';
const ARTICLE = {
  id: 'art_e2e_paywall_1',
  slug: 'essai-e2e-premium',
  title: 'Essai E2E : l’économie de l’attention',
  content:
    '<h2>Prologue</h2><p>Premier paragraphe offert à tous les visiteurs.</p>' +
    '<p>Deuxième paragraphe : le teaser public continue ici.</p>' +
    '<!--members-only-->' +
    `<p>${SECRET} — la suite de l'essai est réservée aux abonnés premium.</p>`,
} as const;

test.describe('Parcours Paywall Tenant — Déverrouillage & Zero-Leak', () => {
  // ⚠️ Serial : le spec crée un tenant partagé et le NETTOIE en afterAll.
  // En parallèle, chaque worker rejouerait beforeAll/afterAll et un worker
  // rapide supprimerait le fixture pendant qu'un autre s'en sert (404 aléatoire).
  test.describe.configure({ mode: 'serial' });

  let db: TestDb;

  test.beforeAll(async ({ request }) => {
    expect(DATABASE_URL, 'DATABASE_URL requis (base de dev/CI)').toBeTruthy();
    db = new TestDb(DATABASE_URL);
    await db.connect();

    await db.ensurePublication({
      id: PAYWALL.id,
      subdomain: PAYWALL.subdomain,
      name: PAYWALL.name,
      type: 'MEDIA',
      authorId: PAYWALL.authorId,
      authorEmail: PAYWALL.authorEmail,
      authorUsername: PAYWALL.authorUsername,
    });
    await db.ensureArticle({
      id: ARTICLE.id,
      publicationId: PAYWALL.id,
      authorId: PAYWALL.authorId,
      title: ARTICLE.title,
      slug: ARTICLE.slug,
      content: ARTICLE.content,
      published: true,
      isPremium: true,
      visibility: 'PAID_SUBSCRIBERS',
      readingTime: 5,
    });

    // Warm-up : en dev, Next compile les routes à la première requête — un
    // premier appel non suivi évite un 404 « route non encore compilée ».
    await request
      .get(`/tenant/${PAYWALL.subdomain}/article/${ARTICLE.slug}`, { timeout: 60_000 })
      .catch(() => {});
  });

  test.afterAll(async () => {
    if (!db) return;
    // Nettoyage : ce spec ne doit pas polluer la base partagée.
    await db.deleteArticle(ARTICLE.id).catch(() => {});
    await db.deletePublication(PAYWALL.id).catch(() => {});
    await db.close();
  });

  test('affiche le teaser public mais coupe hermétiquement le contenu premium côté serveur', async ({
    page,
  }) => {
    await page.goto(`/tenant/${PAYWALL.subdomain}/article/${ARTICLE.slug}`, {
      waitUntil: 'networkidle',
    });

    // Le titre et l'extrait offert doivent être visibles
    await expect(page.getByText(ARTICLE.title).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Premier paragraphe offert').first()).toBeVisible();

    // 1. HTML complet (SSR + hydratation) : aucune trace du passage réservé.
    const bodyContent = await page.content();
    expect(bodyContent).not.toContain(SECRET);
    expect(bodyContent).not.toContain('<!--members-only-->');

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

  test('présente la carte paywall triptyque conforme aux exigences design Apple', async ({
    page,
  }) => {
    await page.goto(`/tenant/${PAYWALL.subdomain}/article/${ARTICLE.slug}`, {
      waitUntil: 'networkidle',
    });

    // Présence du composant paywall (verre dépoli sur les thèmes non-brutalist)
    const paywallCard = page
      .locator('.backdrop-blur-xl')
      .filter({ hasText: 'Accéder à la suite' })
      .first();
    await expect(paywallCard).toBeVisible({ timeout: 30_000 });

    // Triptyque de monétisation : déverrouillage à l'acte ET abonnement.
    await expect(paywallCard.getByText('Débloquer cet article', { exact: false })).toBeVisible();
    await expect(paywallCard.getByText('Membre Premium', { exact: false })).toBeVisible();
    await expect(paywallCard.getByText('2,00 €').first()).toBeVisible();
    await expect(paywallCard.getByText('5,00 €', { exact: false }).first()).toBeVisible();

    // Vérification du bouton d'action ou de connexion
    const actionBtn = page
      .getByRole('button', { name: /débloquer|continuer|s'abonner/i })
      .or(page.getByRole('link', { name: /débloquer|continuer|s'abonner|connexion/i }))
      .first();
    await expect(actionBtn).toBeVisible();

    // Vérification de non-régression stylistique : aucune classe font-mono dans la carte
    const cardHtml = await paywallCard.innerHTML();
    expect(cardHtml).not.toContain('font-mono');
  });
});
