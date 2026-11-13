// =====================================================================
// 🔗 E2E — Équivalence « lien court » ↔ « URL canonique déclarée »
// =====================================================================
// Contrat verrouillé : sur qoe.fi, un lien court `/article/<slug>` ne doit
// JAMAIS répondre 404 et doit rediriger (308) exactement vers l'URL que la
// page article déclare en `<link rel="canonical">`.
//
// Pourquoi ce test existe : la décision de stratégie est « la forme core
// `/<owner>/a/<slug>` est LA canonique » (cf. getCanonicalArticlePath dans
// packages/config). Deux logiques distinctes (redirection des liens courts et
// métadonnées de la page article) pourraient diverger silencieusement et
// publier deux canoniques concurrentes. Ici on compare les deux sorties
// réelles, sur des articles pris en base — donc le test échoue si l'une des
// deux change sans l'autre.
//
// Volontairement en HTTP pur (pas de navigateur) : le contrat est un statut,
// un en-tête `Location` et une balise `<link rel="canonical">` rendue côté
// serveur. Les trois sources de propriétaire (slug de publication,
// sous-domaine, username d'auteur) sont énumérées par les tests unitaires de
// packages/config ; ici on vérifie qu'elles produisent la même URL de bout en
// bout, et pour plusieurs articles.
// =====================================================================

import { test, expect } from '@playwright/test';
import { TestDb } from './lib/db';
import { DATABASE_URL } from './lib/env';

test.describe('URL canonique des articles (liens courts)', () => {
  test("chaque lien court /article/<slug> atterrit sur l'URL canonique déclarée", async ({
    request,
  }) => {
    // Le premier hit compile la route en dev et réchauffe l'API : même budget
    // que les autres parcours qui touchent un serveur à froid.
    test.setTimeout(120_000);

    const db = new TestDb(DATABASE_URL!);
    await db.connect();
    // Sélection déterministe : pas de dépendance au classement du feed.
    const rows = await db.query<{ slug: string }>(
      `SELECT slug FROM "Article" WHERE published = true ORDER BY slug ASC LIMIT 3`
    );
    await db.close();
    expect(rows.length, 'au moins un article publié seedé').toBeGreaterThan(0);

    for (const { slug } of rows) {
      // 1. Le lien court répond une redirection permanente — pas un 404, pas un
      //    200 « à peu près ».
      const short = await request.get(`/article/${encodeURIComponent(slug)}`, {
        maxRedirects: 0,
      });
      expect(short.status(), `GET /article/${slug}`).toBe(308);

      const location = short.headers()['location'];
      expect(location, `en-tête Location absent pour /article/${slug}`).toBeTruthy();
      const target = new URL(location!, 'http://localhost');

      // 2. La cible se rend directement (200, pas de seconde redirection).
      const page = await request.get(`${target.pathname}${target.search}`, {
        maxRedirects: 0,
      });
      expect(page.status(), `GET ${target.pathname}`).toBe(200);

      // 3. La page déclare ce MÊME chemin en canonique.
      const html = await page.text();
      const declared = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
      expect(declared, `<link rel="canonical"> absent sur ${target.pathname}`).toBeTruthy();

      const declaredPath = decodeURIComponent(new URL(declared!, 'http://localhost').pathname);
      expect(
        declaredPath,
        `la canonique déclarée contredit la redirection du lien court pour « ${slug} »`
      ).toBe(decodeURIComponent(target.pathname));
    }
  });
});
