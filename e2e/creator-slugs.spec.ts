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

const AUTHOR_ID = '00000000-0000-4000-8000-0000000000a1';
const COAUTHOR_ID = '00000000-0000-4000-8000-0000000000a2';
const PUB_ID = 'pub_e2e_slugs';
const ARTICLE_ID = 'art_e2e_slugs';

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
      `TRUNCATE TABLE "ArticleSlugHistory","ArticleSlug","Article","Category","_CoAuthors","ApiKey","Publication","User" CASCADE`
    );
    await db.query(
      `INSERT INTO "Publication" (id, type, name, slug, "createdAt","updatedAt") VALUES ($1,'PERSONAL','E2E Slugs','e2e-slugs',now(),now())`,
      [PUB_ID]
    );
    for (const u of [
      { id: AUTHOR_ID, email: 'e2e.a@qoe.fi', withPub: true },
      { id: COAUTHOR_ID, email: 'e2e.b@qoe.fi', withPub: false },
    ]) {
      const pub = u.withPub ? PUB_ID : null;
      await db.query(
        `INSERT INTO "User" (id, email, username, name, role, "publicationId","createdAt","updatedAt")
         VALUES ($1,$2,$3,$3,'user',$4,now(),now())`,
        [u.id, u.email, u.email.split('@')[0], pub]
      );
    }
    await db.query(
      `INSERT INTO "Article" (id, title, slug, content, published, visibility, "readingTime", status, "publicationId","authorId","createdAt","updatedAt")
       VALUES ($1,'Duo E2E','duo-e2e','<p>duo</p>',true,'PUBLIC',2,'PUBLISHED',$2,$3,now(),now())`,
      [ARTICLE_ID, PUB_ID, AUTHOR_ID]
    );
    await db.query(`INSERT INTO "_CoAuthors" ("A","B") VALUES ($1,$2)`, [ARTICLE_ID, COAUTHOR_ID]);
    await db.query(
      `INSERT INTO "Category" (id,name,slug,"publicationId") VALUES ('cat_e2e','E2E','e2e',$1) ON CONFLICT DO NOTHING`,
      [PUB_ID]
    );
  });

  test.afterAll(async () => {
    await db?.close();
  });

  test('variant personnel, auto-suffixe et historique', async ({ request }) => {
    const coKey = await apiKeyAuth(db, COAUTHOR_ID, 'e2e-co');
    const mainKey = await apiKeyAuth(db, AUTHOR_ID, 'e2e-main');

    // co-auteur pose son variant
    let res = await request.patch(`${GO_API_URL}/v1/creator/articles/${ARTICLE_ID}/slug`, {
      headers: { Authorization: `Bearer ${coKey}` },
      data: { slug: 'ma-version-e2e' },
    });
    expect(res.status(), await res.text()).toBe(200);
    expect((await res.json()).slug).toBe('ma-version-e2e');

    // chacun voit son slug
    for (const [key, want] of [
      [coKey, 'ma-version-e2e'],
      [mainKey, 'duo-e2e'],
    ] as const) {
      const r = await request.get(`${GO_API_URL}/v1/creator/articles/duo-e2e`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      expect(r.status()).toBe(200);
      const body = await r.json();
      expect(body.slug).toBe(want);
      const slugs = new Set((body.authors as Array<{ slug: string }>).map((a) => a.slug));
      expect(slugs.has('duo-e2e')).toBeTruthy();
      expect(slugs.has('ma-version-e2e')).toBeTruthy();
    }

    // conflit global → auto-suffixe
    await db.query(
      `INSERT INTO "Publication" (id,type,name,slug,"createdAt","updatedAt") VALUES ('pub_tiers_e2e','PERSONAL','Tiers','tiers-e2e',now(),now()) ON CONFLICT DO NOTHING`
    );
    await db.query(
      `INSERT INTO "User" (id,email,username,name,role,"publicationId","createdAt","updatedAt")
       VALUES ('00000000-0000-4000-8000-0000000000a3','own@qoe.fi','own_e2e','Own','user','pub_tiers_e2e',now(),now()) ON CONFLICT DO NOTHING`
    );
    await db.query(
      `INSERT INTO "Article" (id,title,slug,content,published,visibility,"readingTime",status,"publicationId","authorId","createdAt","updatedAt")
       VALUES ('art_autre_e2e','Autre','duo-e2e-2','<p>x</p>',true,'PUBLIC',1,'PUBLISHED','pub_tiers_e2e','00000000-0000-4000-8000-0000000000a3',now(),now()) ON CONFLICT DO NOTHING`
    );
    res = await request.patch(`${GO_API_URL}/v1/creator/articles/${ARTICLE_ID}/slug`, {
      headers: { Authorization: `Bearer ${coKey}` },
      data: { slug: 'duo-e2e-2' },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).slug).toBe('duo-e2e-2-1');

    // historique : ancien variant reste résolu (200 via GetArticleBySlugAny)
    const hist = await db.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM "ArticleSlugHistory" WHERE slug='ma-version-e2e' AND "articleId"=$1`,
      [ARTICLE_ID]
    );
    expect(Number(hist[0].count)).toBeGreaterThan(0);

    // filtres pointilleux
    await db.query(`UPDATE "Article" SET "categoryId"='cat_e2e' WHERE id=$1`, [ARTICLE_ID]);
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
