// =====================================================================
// ⚖️ E2E — Information légale côté publication (apps/tenants)
// =====================================================================
// Depuis le refactor `3bf9d8f1` (« ne plus héberger de page légale dans les
// tenants »), une publication n'a plus de route /legal : les documents sont
// ceux de la plateforme et les liens pointent vers ses URLs absolues.
//
// Ce spec verrouille ce contrat, qui remplace les trois cas d'origine
// (index, document, opposition) devenus impossibles — ils testaient des
// pages qui n'existent plus :
//   • aucune copie locale des pages légales (404, pas de page fantôme) ;
//   • les mentions légales d'un article mènent à la plateforme (URL absolue),
//     jamais à une copie hébergée par la publication ;
//   • aucune bannière de consentement bloquante : la mesure d'audience est
//     anonyme et sans cookie, donc dispensée de consentement préalable.
// =====================================================================

import { test, expect } from '@playwright/test';
import { TestDb } from './lib/db';
import { DATABASE_URL } from './lib/env';
import { tenantArticlePath } from './lib/tenant-paths';

const DOMAIN = 'legal-e2e';
const PUBLISHER = {
  id: 'pub_e2e_legal',
  subdomain: DOMAIN,
  name: 'Le Dossier E2E',
  authorId: '00000000-0000-4000-8000-00000000e2c1',
  authorEmail: 'e2e-legal@qoe.test',
  authorUsername: 'e2e_legal_author',
} as const;

const ARTICLE = {
  id: 'art_e2e_legal_1',
  slug: 'dossier-e2e-legal',
  title: 'Dossier E2E : la transparence comme contrat',
  content: '<p>Un article public, servi à un visiteur anonyme.</p>',
} as const;

test.describe('Information légale (publication)', () => {
  let db: TestDb;

  test.beforeAll(async ({ request }) => {
    expect(DATABASE_URL, 'DATABASE_URL requis (base seedée)').toBeTruthy();
    db = new TestDb(DATABASE_URL);
    await db.connect();
    await db.ensurePublisher({
      id: PUBLISHER.id,
      subdomain: PUBLISHER.subdomain,
      name: PUBLISHER.name,
      type: 'MEDIA',
      authorId: PUBLISHER.authorId,
      authorEmail: PUBLISHER.authorEmail,
      authorUsername: PUBLISHER.authorUsername,
    });
    await db.ensureArticle({
      id: ARTICLE.id,
      publisherId: PUBLISHER.id,
      authorId: PUBLISHER.authorId,
      title: ARTICLE.title,
      slug: ARTICLE.slug,
      content: ARTICLE.content,
      published: true,
    });

    // Warm-up : en dev, Next compile la route à la première requête.
    await request.get(tenantArticlePath(DOMAIN, ARTICLE.slug), { timeout: 60_000 }).catch(() => {});
  });

  test.afterAll(async () => {
    if (!db) return;
    await db.deleteArticle(ARTICLE.id).catch(() => {});
    await db.deletePublisher(PUBLISHER.id).catch(() => {});
    await db.close();
  });

  test('la publication n’héberge plus de copie locale des pages légales', async ({ request }) => {
    // Le contrat n'est pas « la page est jolie », c'est « elle n'existe pas » :
    // une copie locale divergerait des documents de la plateforme.
    for (const path of [
      `/tenant/${DOMAIN}/legal`,
      `/tenant/${DOMAIN}/legal/conditions-generales-utilisation`,
    ]) {
      const res = await request.get(path, { maxRedirects: 0, timeout: 120_000 });
      expect(res.status(), `${path} ne doit plus être servi par la publication`).toBe(404);
    }
  });

  test('les mentions légales d’un article renvoient vers la plateforme', async ({ page }) => {
    await page.goto(tenantArticlePath(DOMAIN, ARTICLE.slug), { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });

    const hrefs = await page
      .locator('a[href*="/legal/"]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('href') || ''));

    expect(hrefs.length, 'aucun lien légal dans le pied d’article').toBeGreaterThan(0);
    for (const href of hrefs) {
      // URL absolue : la source de vérité est la plateforme, pas la publication.
      expect(href, `lien légal non absolu : ${href}`).toMatch(/^https?:\/\//);
      // Jamais une copie servie par l'app tenants.
      expect(href, `lien légal local : ${href}`).not.toContain(`/tenant/${DOMAIN}`);
      expect(href, `lien légal local : ${href}`).not.toMatch(/^\/legal\//);
    }
  });

  test('aucune bannière de consentement bloquante sur une page de publication', async ({
    page,
    context,
  }) => {
    await context.clearCookies();
    await page.goto(tenantArticlePath(DOMAIN, ARTICLE.slug), { waitUntil: 'networkidle' });

    // La mesure d'audience est anonyme et sans cookie : on informe, on ne
    // barre pas. Aucun dialogue de consentement ne doit s'ouvrir tout seul.
    await expect(page.getByRole('dialog', { name: 'Préférences de cookies' })).toBeHidden();

    // Rien n'est suspendu à un clic : le contenu de l'article est lisible.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Un article public, servi à un visiteur anonyme.')).toBeVisible();
  });
});
