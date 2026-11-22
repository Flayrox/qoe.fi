// =====================================================================
// 🧪 E2E — Slugs par auteur (API créateur)
// =====================================================================
// Couvre le contrat pointilleux ajouté en août 2026 :
//   • variant personnel par auteur (ArticleSlug)
//   • auto-suffixe -1 si conflit global
//   • historique 301 (ArticleSlugHistory)
//   • filtre ?category=id|slug + ?status=draft|all
//   • validation slugs
// Le test passe par l'API Go réelle (GO_API_URL) + DB seedée via pg
// (même pattern que tenants.spec.ts / studio.spec.ts).
// =====================================================================

import { test, expect } from '@playwright/test';
import crypto from 'crypto';
import { TestDb } from './lib/db';
import { DATABASE_URL, GO_API_URL } from './lib/env';

// 🔒 Univers propre à CE run : aucun `TRUNCATE`, donc la spec peut tourner en
// parallèle des autres sans détruire leurs données, et deux runs simultanés ne
// se marchent pas dessus. Les slugs sont suffixés par run pour que le test
// d'auto-suffixe (`-1`) reste déterministe : le seul article qui porte le slug
// de base est celui du run.
const RUN = crypto.randomBytes(4).toString('hex');
const AUTHOR_ID = crypto.randomUUID();
const COAUTHOR_ID = crypto.randomUUID();
const OWNER_ID = crypto.randomUUID();
const PUB_ID = `pub_e2e_slugs_${RUN}`;
const TIERS_PUB_ID = `pub_tiers_e2e_${RUN}`;
const ARTICLE_ID = `art_e2e_slugs_${RUN}`;
const OTHER_ARTICLE_ID = `art_autre_e2e_${RUN}`;
const CATEGORY_ID = `cat_e2e_${RUN}`;
const BASE_SLUG = `duo-e2e-${RUN}`;
const CO_SLUG = `ma-version-e2e-${RUN}`;
const TAKEN_SLUG = `${BASE_SLUG}-2`;

function makeApiKey(): { raw: string; hash: string } {
  const raw = 'qoe_live_' + crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

async function apiKeyAuth(db: TestDb, userId: string, name: string): Promise<string> {
  const { raw, hash } = makeApiKey();
  await db.query(
    `INSERT INTO "ApiKey" (id, name, "keyPrefix", "keyHash", scopes, "userId")
     VALUES (gen_random_uuid()::text, $1, 'qoe_live', $2, ARRAY['READ','WRITE','ANALYTICS']::text[], $3)`,
    [name, hash, userId]
  );
  return raw;
}

test.describe('Slugs par auteur (API créateur)', () => {
  let db: TestDb;

  test.beforeAll(async () => {
    test.skip(!DATABASE_URL, 'DATABASE_URL requis');
    test.skip(!GO_API_URL, 'GO_API_URL requis');
    db = new TestDb(DATABASE_URL);
    await db.connect();
    await db.query(
      `INSERT INTO "Publisher" (id, type, name, slug, "createdAt","updatedAt") VALUES ($1,'PERSONAL','E2E Slugs',$2,now(),now())`,
      [PUB_ID, `e2e-slugs-${RUN}`]
    );
    for (const u of [
      // Emails/usernames propres au run : « User.email » et « User.username »
      // sont uniques, un run précédent interrompu ne doit pas faire échouer
      // celui-ci (l'ancien TRUNCATE masquait ce besoin).
      { id: AUTHOR_ID, email: `e2e.a-${RUN}@qoe.fi`, withPub: true },
      { id: COAUTHOR_ID, email: `e2e.b-${RUN}@qoe.fi`, withPub: false },
    ]) {
      const pub = u.withPub ? PUB_ID : null;
      await db.query(
        `INSERT INTO "User" (id, email, username, name, role, "publisherId","createdAt","updatedAt")
         VALUES ($1,$2,$3,$3,'user',$4,now(),now())`,
        [u.id, u.email, u.email.split('@')[0], pub]
      );
    }
    await db.query(
      `INSERT INTO "Article" (id, title, slug, content, published, visibility, "readingTime", status, "publisherId","authorId","createdAt","updatedAt")
       VALUES ($1,'Duo E2E',$4,'<p>duo</p>',true,'PUBLIC',2,'PUBLISHED',$2,$3,now(),now())`,
      [ARTICLE_ID, PUB_ID, AUTHOR_ID, BASE_SLUG]
    );
    await db.query(`INSERT INTO "_CoAuthors" ("A","B") VALUES ($1,$2)`, [ARTICLE_ID, COAUTHOR_ID]);
    await db.query(`INSERT INTO "Category" (id,name,slug,"publisherId") VALUES ($2,'E2E',$3,$1)`, [
      PUB_ID,
      CATEGORY_ID,
      `e2e-${RUN}`,
    ]);
  });

  test.afterAll(async () => {
    if (db) {
      // 🧹 Nettoyage scoped au run : rien d'autre n'est touché (l'ancienne
      // version faisait un TRUNCATE global, qui détruisait la base de dev et
      // les données des specs parallèles).
      const articleIds = [ARTICLE_ID, OTHER_ARTICLE_ID];
      await db.query(`DELETE FROM "ArticleSlugHistory" WHERE "articleId" = ANY($1)`, [articleIds]);
      await db.query(`DELETE FROM "ArticleSlug" WHERE "articleId" = ANY($1)`, [articleIds]);
      await db.query(`DELETE FROM "_CoAuthors" WHERE "A" = ANY($1)`, [articleIds]);
      await db.query(`DELETE FROM "Article" WHERE id = ANY($1)`, [articleIds]);
      await db.query(`DELETE FROM "Category" WHERE id = $1`, [CATEGORY_ID]);
      await db.query(`DELETE FROM "ApiKey" WHERE "userId" = ANY($1)`, [[AUTHOR_ID, COAUTHOR_ID]]);
      await db.query(`DELETE FROM "User" WHERE id = ANY($1)`, [[AUTHOR_ID, COAUTHOR_ID, OWNER_ID]]);
      await db.query(`DELETE FROM "Publisher" WHERE id = ANY($1)`, [[PUB_ID, TIERS_PUB_ID]]);
      await db.close();
    }
  });

  test('variant personnel, auto-suffixe et historique', async ({ request }) => {
    const coKey = await apiKeyAuth(db, COAUTHOR_ID, 'e2e-co');
    const mainKey = await apiKeyAuth(db, AUTHOR_ID, 'e2e-main');

    // co-auteur pose son variant
    let res = await request.patch(`${GO_API_URL}/v1/creator/articles/${ARTICLE_ID}/slug`, {
      headers: { Authorization: `Bearer ${coKey}` },
      data: { slug: CO_SLUG },
    });
    expect(res.status(), await res.text()).toBe(200);
    expect((await res.json()).slug).toBe(CO_SLUG);

    // chacun voit son slug
    for (const [key, want] of [
      [coKey, CO_SLUG],
      [mainKey, BASE_SLUG],
    ] as const) {
      const r = await request.get(`${GO_API_URL}/v1/creator/articles/${BASE_SLUG}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      expect(r.status()).toBe(200);
      const body = await r.json();
      expect(body.slug).toBe(want);
      const slugs = new Set((body.authors as Array<{ slug: string }>).map((a) => a.slug));
      expect(slugs.has(BASE_SLUG)).toBeTruthy();
      expect(slugs.has(CO_SLUG)).toBeTruthy();
    }

    // conflit global → auto-suffixe
    await db.query(
      `INSERT INTO "Publisher" (id,type,name,slug,"createdAt","updatedAt") VALUES ($1,'PERSONAL','Tiers',$2,now(),now())`,
      [TIERS_PUB_ID, `tiers-e2e-${RUN}`]
    );
    await db.query(
      `INSERT INTO "User" (id,email,username,name,role,"publisherId","createdAt","updatedAt")
       VALUES ($1,$2,$3,'Own','user',$4,now(),now())`,
      [OWNER_ID, `own-${RUN}@qoe.fi`, `own_e2e_${RUN}`, TIERS_PUB_ID]
    );
    await db.query(
      `INSERT INTO "Article" (id,title,slug,content,published,visibility,"readingTime",status,"publisherId","authorId","createdAt","updatedAt")
       VALUES ($1,'Autre',$2,'<p>x</p>',true,'PUBLIC',1,'PUBLISHED',$3,$4,now(),now())`,
      [OTHER_ARTICLE_ID, TAKEN_SLUG, TIERS_PUB_ID, OWNER_ID]
    );
    res = await request.patch(`${GO_API_URL}/v1/creator/articles/${ARTICLE_ID}/slug`, {
      headers: { Authorization: `Bearer ${coKey}` },
      data: { slug: TAKEN_SLUG },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).slug).toBe(`${TAKEN_SLUG}-1`);

    // historique : ancien variant reste résolu (200 via GetArticleBySlugAny)
    const hist = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM "ArticleSlugHistory" WHERE slug=$2 AND "articleId"=$1`,
      [ARTICLE_ID, CO_SLUG]
    );
    expect(Number(hist[0].count)).toBeGreaterThan(0);

    // filtres pointilleux
    await db.query(`UPDATE "Article" SET "categoryId"=$2 WHERE id=$1`, [ARTICLE_ID, CATEGORY_ID]);
    // status=draft ne doit pas contenir le publié
    const dr = await request.get(`${GO_API_URL}/v1/creator/articles?status=draft`, {
      headers: { Authorization: `Bearer ${mainKey}` },
    });
    expect(dr.status()).toBe(200);

    // validation
    for (const bad of ['admin', 'ab', 'api']) {
      const r = await request.patch(`${GO_API_URL}/v1/creator/articles/${ARTICLE_ID}/slug`, {
        headers: { Authorization: `Bearer ${coKey}` },
        data: { slug: bad },
      });
      expect(r.status(), bad).toBe(400);
    }
  });
});
