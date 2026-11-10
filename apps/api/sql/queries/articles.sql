-- name: ListRecentPublishedArticles :many
-- Articles publiés récents (feed mobile « écran principal »), avec auteur /
-- publication / catégorie dénormalisés. Public, trié par date décroissante.
SELECT a.id,
       a.title,
       a.slug,
       a.content,
       a."imageUrl"     AS article_image,
       a."isPremium",
       a.visibility,
       a."readingTime",
       a."createdAt",
       a."publisherId",
       a."authorId",
       u.id::text       AS author_id,
       u.name           AS author_name,
       u.username       AS author_username,
       u."logoUrl"      AS author_logo,
       u."isCertified"  AS author_certified,
       p.name           AS publisher_name,
       p.slug           AS publisher_slug,
       p.subdomain      AS publisher_subdomain,
       p."logoUrl"      AS publisher_logo,
       p.type           AS publisher_type,
       c.id             AS category_id,
       c.name           AS category_name,
       c.slug           AS category_slug
FROM "Article" a
JOIN "User" u ON u.id = a."authorId"
JOIN "Publisher" p ON p.id = a."publisherId"
LEFT JOIN "Category" c ON c.id = a."categoryId"
WHERE a.published = true
  AND u."isShadowbanned" = false
  AND u."isSuspended" = false
  AND (a."scheduledAt" IS NULL OR a."scheduledAt" <= now())
ORDER BY a."createdAt" DESC, a.id DESC
LIMIT $1 OFFSET $2;

-- name: ListPublishedArticlesByPublisher :many
-- Articles publiés d'une publication (profil), résolue par slug OU subdomain
-- (insensible à la casse). Même shape que ListRecentPublishedArticles.
SELECT a.id,
       a.title,
       a.slug,
       a.content,
       a."imageUrl"     AS article_image,
       a."isPremium",
       a.visibility,
       a."readingTime",
       a."showOnPersonalProfile",
       a."createdAt",
       a."publisherId",
       a."authorId",
       u.id::text       AS author_id,
       u.name           AS author_name,
       u.username       AS author_username,
       u."logoUrl"      AS author_logo,
       u."isCertified"  AS author_certified,
       p.name           AS publisher_name,
       p.slug           AS publisher_slug,
       p.subdomain      AS publisher_subdomain,
       p."logoUrl"      AS publisher_logo,
       p.type           AS publisher_type,
       c.id             AS category_id,
       c.name           AS category_name,
       c.slug           AS category_slug
FROM "Article" a
JOIN "User" u ON u.id = a."authorId"
JOIN "Publisher" p ON p.id = a."publisherId"
LEFT JOIN "Category" c ON c.id = a."categoryId"
WHERE a.published = true
  AND (
    -- Si la cible est directement la publication de l'article (MEDIA ou PERSONAL)
    (
      LOWER(p.slug) = LOWER($1)
      OR LOWER(COALESCE(p.subdomain, '')) = LOWER($1)
      OR LOWER(p.id) = LOWER($1)
    )
    -- Si la cible résolue est un utilisateur ou une publication PERSONAL (et non un MEDIA)
    OR (
      NOT EXISTS (
        SELECT 1 FROM "Publisher" mp
        WHERE mp.type = 'MEDIA'
          AND (
            LOWER(mp.slug) = LOWER($1)
            OR LOWER(COALESCE(mp.subdomain, '')) = LOWER($1)
            OR LOWER(mp.id) = LOWER($1)
          )
      )
      AND EXISTS (
        SELECT 1
        FROM "User" tu
        LEFT JOIN "Publisher" tp ON tp.id = tu."publisherId"
        WHERE (
          LOWER(COALESCE(tu.username, '')) = LOWER($1)
          OR LOWER(tu.id::text) = LOWER($1)
          OR (
            tp.id IS NOT NULL
            AND tp.type = 'PERSONAL'
            AND (
              LOWER(tp.slug) = LOWER($1)
              OR LOWER(COALESCE(tp.subdomain, '')) = LOWER($1)
              OR LOWER(tp.id) = LOWER($1)
            )
          )
        )
        AND (
          a."publisherId" = tu."publisherId"
          OR (
            (
              (a."authorId" = tu.id AND a."showOnPersonalProfile" = true)
              OR EXISTS (
                SELECT 1
                FROM "ArticleAttribution" aa
                WHERE aa."articleId" = a.id
                  AND aa."userId" = tu.id
                  AND aa."consentStatus" = 'ACCEPTED'
                  AND aa."isVisible" = true
                  AND aa.role IN ('PRIMARY_AUTHOR', 'CO_AUTHOR')
                  AND (a."authorId" <> tu.id OR a."showOnPersonalProfile" = true)
              )
            )
            AND NOT EXISTS (
              SELECT 1 FROM "Article" fork
              WHERE fork."originArticleId" = a.id
                AND fork."publisherId" = tu."publisherId"
                AND fork.published = true
            )
          )
        )
      )
    )
  )
  AND u."isShadowbanned" = false
  AND u."isSuspended" = false
  AND (a."scheduledAt" IS NULL OR a."scheduledAt" <= now())
ORDER BY a."createdAt" DESC, a.id DESC
LIMIT $2 OFFSET $3;

-- name: GetArticleByID :one
SELECT a.id, a.title, a.slug, a.content, a."draftContent", a.published, a."isPremium", a.visibility,
       a."readingTime", a."allowPublicAnnotations", a."allowComments", a."allowDownload", a."showOnPersonalProfile", a."scheduledAt",
       a."originArticleId", a."canonicalType", a."isAuthorSovereignCopy", a."canonicalUrl",
       a.status, a."publisherId", a."authorId", a."categoryId", a."tierId",
       a."seoTitle", a."seoDescription", a."createdAt", a."updatedAt",
       a."emailStatus", a."emailSentAt", a."emailSentCount", a."emailResendCount",
       u.id::text     AS author_id,
       u.name         AS author_name,
       u.username     AS author_username,
       u."logoUrl"    AS author_logo,
       p.name         AS publisher_name,
       p.slug         AS publisher_slug,
       p.subdomain    AS publisher_subdomain,
       p.type         AS publisher_type,
       p."logoUrl"    AS publisher_logo
FROM "Article" a
JOIN "User" u ON u.id = a."authorId"
JOIN "Publisher" p ON p.id = a."publisherId"
WHERE a.id = $1;

-- name: GetArticleBySlug :one
SELECT a.id, a.title, a.slug, a.content, a.published, a."isPremium", a.visibility,
       a."readingTime", a."allowPublicAnnotations", a."allowComments", a."showOnPersonalProfile", a."scheduledAt",
       a."originArticleId", a."canonicalType", a."isAuthorSovereignCopy", a."canonicalUrl",
       a.status, a."publisherId", a."authorId", a."categoryId", a."tierId",
       a."seoTitle", a."seoDescription", a."createdAt", a."updatedAt",
       a."imageUrl"   AS article_image,
       u.id::text     AS author_id,
       u.name         AS author_name,
       u.username     AS author_username,
       u."logoUrl"    AS author_logo,
       p.name         AS publisher_name,
       p.slug         AS publisher_slug,
       p.subdomain    AS publisher_subdomain,
       p.type         AS publisher_type,
       p."logoUrl"    AS publisher_logo,
       p."customDomain" AS publisher_custom_domain,
       c.id           AS category_id,
       c.name         AS category_name,
       c.slug         AS category_slug
FROM "Article" a
JOIN "User" u ON u.id = a."authorId"
JOIN "Publisher" p ON p.id = a."publisherId"
LEFT JOIN "Category" c ON c.id = a."categoryId"
WHERE a.slug = $1 AND a."publisherId" = $2;

-- name: GetArticleBySlugAny :one
-- Lecture publique par slug SEUL (premier article publié) — parité avec
-- findFirstBySlug Prisma de la page autonome /article/[slug] du reader core.
-- Résout aussi les slugs personnalisés par auteur (ArticleSlug).
SELECT a.id, a.title, a.slug, a.content, a.published, a."isPremium", a.visibility,
       a."readingTime", a."allowPublicAnnotations", a."allowComments", a."showOnPersonalProfile", a."scheduledAt",
       a."originArticleId", a."canonicalType", a."isAuthorSovereignCopy", a."canonicalUrl",
       a.status, a."publisherId", a."authorId", a."categoryId", a."tierId",
       a."seoTitle", a."seoDescription", a."createdAt", a."updatedAt",
       u.id::text     AS author_id,
       u.name         AS author_name,
       u.username     AS author_username,
       u."logoUrl"    AS author_logo,
       p.name         AS publisher_name,
       p.slug         AS publisher_slug,
       p.subdomain    AS publisher_subdomain,
       p.type         AS publisher_type,
       p."logoUrl"    AS publisher_logo,
       p."customDomain" AS publisher_custom_domain,
       a."imageUrl"   AS article_image,
       c.id           AS category_id,
       c.name         AS category_name,
       c.slug         AS category_slug
FROM "Article" a
JOIN "User" u ON u.id = a."authorId"
JOIN "Publisher" p ON p.id = a."publisherId"
LEFT JOIN "Category" c ON c.id = a."categoryId"
WHERE (a.slug = $1
       OR EXISTS (SELECT 1 FROM "ArticleSlug" s
                  WHERE s.slug = $1 AND s."articleId" = a.id)
       OR EXISTS (SELECT 1 FROM "ArticleSlugHistory" h
                  WHERE h.slug = $1 AND h."articleId" = a.id))
  AND a.published = true
ORDER BY a."createdAt" DESC, a.id DESC
LIMIT 1;

-- name: GetCreatorArticleBySlug :one
-- Lecture d'un article PUBLIÉ d'une publication au format contrat créateurs
-- (clé API → publication du créateur), catégorie embarquée.
SELECT a.id, a.title, a.slug, a.content, a."imageUrl", a.published, a."isPremium", a.visibility,
       a."readingTime", a.status, a."tierId", a."createdAt", a."updatedAt",
       c.id AS category_id, c.name AS category_name, c.slug AS category_slug,
       c.description AS category_description
FROM "Article" a
LEFT JOIN "Category" c ON c.id = a."categoryId"
WHERE a.slug = $1 AND a."publisherId" = $2 AND a.published = true;

-- name: ListCreatorArticles :many
-- Liste des articles d'une publication au format contrat créateurs (Hono) :
-- filtres `published` (défaut true) et `category` (slug ou UUID ou catégorie parente), catégorie embarquée.
SELECT a.id, a.title, a.slug, a.content, a."imageUrl", a.published, a."isPremium", a.visibility,
       a."readingTime", a.status, a."tierId", a."createdAt", a."updatedAt",
       c.id AS category_id, c.name AS category_name, c.slug AS category_slug,
       c.description AS category_description
FROM "Article" a
LEFT JOIN "Category" c ON c.id = a."categoryId"
WHERE a."publisherId" = sqlc.arg('publisherId')
  AND (sqlc.narg('published')::boolean IS NULL OR a.published = sqlc.narg('published'))
  AND (
    sqlc.narg('categorySlug')::text IS NULL
    OR c.slug = sqlc.narg('categorySlug')
    OR c.id = sqlc.narg('categorySlug')
    OR c."parentId" IN (
      SELECT parent_cat.id FROM "Category" parent_cat
      WHERE parent_cat."publisherId" = sqlc.arg('publisherId')
        AND (parent_cat.slug = sqlc.narg('categorySlug') OR parent_cat.id = sqlc.narg('categorySlug'))
    )
  )
ORDER BY a."createdAt" DESC
LIMIT sqlc.arg('limit') OFFSET sqlc.arg('offset');

-- name: CountCreatorArticles :one
-- Compte des articles d'une publication (mêmes filtres que ListCreatorArticles).
SELECT COUNT(*)
FROM "Article" a
LEFT JOIN "Category" c ON c.id = a."categoryId"
WHERE a."publisherId" = sqlc.arg('publisherId')
  AND (sqlc.narg('published')::boolean IS NULL OR a.published = sqlc.narg('published'))
  AND (
    sqlc.narg('categorySlug')::text IS NULL
    OR c.slug = sqlc.narg('categorySlug')
    OR c.id = sqlc.narg('categorySlug')
    OR c."parentId" IN (
      SELECT parent_cat.id FROM "Category" parent_cat
      WHERE parent_cat."publisherId" = sqlc.arg('publisherId')
        AND (parent_cat.slug = sqlc.narg('categorySlug') OR parent_cat.id = sqlc.narg('categorySlug'))
    )
  );

-- name: ListArticlesWithCategory :many
SELECT a.id, a.title, a.slug, a.published, a."isPremium", a.visibility, a."readingTime",
       a.status, a."createdAt", a."updatedAt", a."categoryId", a."publisherId", a."authorId",
       a."allowPublicAnnotations", a."allowComments", a."allowDownload", a."showOnPersonalProfile",
       a."originArticleId", a."canonicalType", a."isAuthorSovereignCopy", a."canonicalUrl",
       (a."draftContent" IS NOT NULL AND a."draftContent" <> '') AS has_unpublished_changes,
       a."emailStatus", a."emailSentAt", a."emailSentCount",
       c.id  AS category_id,
       c.name AS category_name,
       c.slug AS category_slug,
       p.name AS publisher_name,
       p.slug AS publisher_slug,
       p.type AS publisher_type,
       p."logoUrl" AS publisher_logo
FROM "Article" a
JOIN "Publisher" p ON p.id = a."publisherId"
LEFT JOIN "Category" c ON c.id = a."categoryId"
WHERE a."publisherId" = $1
   OR ($4::boolean AND (
     a."authorId" = $5::uuid
     OR EXISTS (
       SELECT 1 FROM "ArticleAttribution" aa
       WHERE aa."articleId" = a.id
         AND aa."userId" = $5::uuid
         AND aa."consentStatus" = 'ACCEPTED'
         AND aa."isVisible" = true
     )
   ))
ORDER BY a."createdAt" DESC
LIMIT $2 OFFSET $3;

-- name: GetArticleIdByPublisherAndSlug :one
-- Dédoublonnage import RSS : un article existe déjà si publisherId + slug matchent.
SELECT id FROM "Article" WHERE "publisherId" = $1 AND slug = $2 LIMIT 1;

-- name: CreateArticle :one
INSERT INTO "Article" (id, title, slug, content, published, "isPremium", visibility,
                       "readingTime", "allowPublicAnnotations", "allowComments", "allowDownload", status,
                       "publisherId", "authorId", "categoryId", "tierId", "seoTitle", "seoDescription",
                       "scheduledAt", "imageUrl", "showOnPersonalProfile", "updatedAt")
VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, now())
RETURNING id;

-- name: UpdateArticleContent :one
UPDATE "Article"
SET title = $2, content = $3, slug = $4, "isPremium" = $5, "categoryId" = $6,
    "seoTitle" = $7, "seoDescription" = $8, "readingTime" = $9, "updatedAt" = now()
WHERE id = $1
RETURNING id;

-- name: UpdateArticleFull :one
UPDATE "Article"
SET title = $2, content = $3, slug = $4, published = $5, status = $6, "isPremium" = $7,
    "categoryId" = $8, "seoTitle" = $9, "seoDescription" = $10, "readingTime" = $11,
    "scheduledAt" = $12, "imageUrl" = $13, "allowPublicAnnotations" = $14,
    "allowComments" = $15, "allowDownload" = $16, "showOnPersonalProfile" = $17, "updatedAt" = now()
WHERE id = $1
RETURNING id;

-- name: UpdateArticleSettings :one
UPDATE "Article"
SET "isPremium" = COALESCE(sqlc.narg('is_premium'), "isPremium"),
    "categoryId" = CASE
      WHEN sqlc.arg('set_category')::boolean THEN sqlc.narg('category_id')
      ELSE "categoryId"
    END,
    "allowPublicAnnotations" = COALESCE(sqlc.narg('allow_public_annotations'), "allowPublicAnnotations"),
    "allowComments" = COALESCE(sqlc.narg('allow_comments'), "allowComments"),
    "allowDownload" = COALESCE(sqlc.narg('allow_download'), "allowDownload"),
    "showOnPersonalProfile" = COALESCE(sqlc.narg('show_on_personal_profile'), "showOnPersonalProfile"),
    "updatedAt" = now()
WHERE id = sqlc.arg('id')
RETURNING id;

-- name: TransferArticlePublisher :one
UPDATE "Article"
SET "publisherId" = $2,
    "categoryId" = $3,
    slug = $4,
    status = $5,
    published = $6,
    "showOnPersonalProfile" = $7,
    -- Un palier d'abonnement appartient à la publication d'origine : il ne
    -- peut pas suivre l'article vers une autre publication.
    "tierId" = NULL,
    "scheduledAt" = $8,
    "updatedAt" = now()
WHERE id = $1
RETURNING id;

-- name: UpdateArticleDraft :one
UPDATE "Article"
SET "draftContent" = $2, "updatedAt" = now()
WHERE id = $1
RETURNING id;

-- name: PublishArticleDraft :one
UPDATE "Article"
SET content = COALESCE("draftContent", content), "draftContent" = NULL, "updatedAt" = now()
WHERE id = $1
RETURNING id;

-- name: SetArticleStatus :one
UPDATE "Article"
SET status = $2, published = $3, "scheduledAt" = $4, "updatedAt" = now()
WHERE id = $1
RETURNING id;

-- name: GetSubscriberEntitlement :one
SELECT s."isPremium", s."isActive", s."tierId"
FROM "Subscriber" s
WHERE s."publisherId" = $1
  AND (s."userId" = $2 OR s.email = $3)
LIMIT 1;

-- name: GetUserPersonalPublisher :one
SELECT "publisherId" AS id
FROM "User"
WHERE id = $1;

-- name: GetMediaRoleForUser :one
SELECT m.role
FROM "MediaMember" m
JOIN "Media" md ON md.id = m."mediaId"
WHERE md."publisherId" = $1 AND m."userId" = $2
  AND m.status = 'active'
LIMIT 1;

-- name: DeleteArticle :exec
DELETE FROM "Article"
WHERE id = $1;

-- name: ListSitemapArticles :many
-- Catalogue SEO slim (index de sitemaps) : slug + owner + date de MAJ,
-- SANS contenu (contrairement au feed). Mêmes prédicats de visibilité que
-- ListRecentPublishedArticles (publié, auteur ni shadowban ni suspendu,
-- programmé passé). Tri stable par date décroissante pour une pagination
-- par offset déterministe.
SELECT a.slug,
       COALESCE(p.slug, p.subdomain, u.username, 'article') AS owner,
       a."updatedAt" AS "updatedAt"
FROM "Article" a
JOIN "User" u ON u.id = a."authorId"
JOIN "Publisher" p ON p.id = a."publisherId"
WHERE a.published = true
  AND u."isShadowbanned" = false
  AND u."isSuspended" = false
  AND (a."scheduledAt" IS NULL OR a."scheduledAt" <= now())
  AND NOT EXISTS (
    SELECT 1
    FROM "Publisher" pv
    JOIN "User" owner ON owner."publisherId" = pv.id
    JOIN "UserSettings" us ON us."userId" = owner.id
    WHERE pv.id = a."publisherId" AND us."profileVisibility" <> 'PUBLIC'
  )
ORDER BY a."createdAt" DESC, a.id DESC
LIMIT $1 OFFSET $2;

-- name: CountPublishedArticles :one
-- Total d'articles indexables (dimensionne les shards du sitemap index).
SELECT COUNT(*)::bigint AS total
FROM "Article" a
JOIN "User" u ON u.id = a."authorId"
WHERE a.published = true
  AND u."isShadowbanned" = false
  AND u."isSuspended" = false
  AND (a."scheduledAt" IS NULL OR a."scheduledAt" <= now())
  AND NOT EXISTS (
    SELECT 1
    FROM "Publisher" pv
    JOIN "User" owner ON owner."publisherId" = pv.id
    JOIN "UserSettings" us ON us."userId" = owner.id
    WHERE pv.id = a."publisherId" AND us."profileVisibility" <> 'PUBLIC'
  );

-- name: SetArticleAllowDownload :one
-- Droit de téléchargement d'un article (l'auteur choisit — hors-ligne et
-- file d'écoute vérifient). La garde (auteur/média/co-auteur) est
-- applicative (Service.authorizeEdit, partagée avec Update) : ici, simple
-- bascule. Retourne id + nouvelle valeur.
UPDATE "Article"
SET "allowDownload" = $2, "updatedAt" = now()
WHERE id = $1
RETURNING id, "allowDownload";

-- name: GetArticleOfflinePack :one
-- Pack hors-ligne (fiche Plus P1) : contenu + droits + publication, en une
-- lecture. Le service vérifie PLUS (HasPlus), la publication (published) et
-- le droit auteur (allowDownload) — jamais de contenu interdit dans le pack.
-- Le contenu est coupé au paywall par le service (même SliceContentAtPaywall
-- que la lecture : le hors-ligne ne contourne jamais le paywall contenu).
SELECT a.id, a.title, a.slug, a.content, a."readingTime", a."isPremium",
       a."allowDownload", a.published, a."publisherId", a.visibility, a."tierId", a."createdAt",
       p.name AS publisher_name,
       u.name AS author_name
FROM "Article" a
JOIN "Publisher" p ON p.id = a."publisherId"
JOIN "User" u ON u.id = a."authorId"
WHERE a.id = $1;

-- name: AddListenLater :one
-- Ajout idempotent à la file (même article deux fois = no-op, retourne
-- l'existant). position = max+1 (fin de file).
INSERT INTO "ListenLater" (id, "userId", "articleId", "position")
SELECT gen_random_uuid()::text, sqlc.arg('user_id')::uuid, sqlc.arg('article_id'), COALESCE(MAX("position"), -1) + 1
FROM "ListenLater" WHERE "userId" = sqlc.arg('user_id')::uuid
ON CONFLICT ("userId", "articleId") DO NOTHING
RETURNING id;

-- name: ListListenLater :many
-- File ordonnée (position, puis ancienneté). Le service joint les métadonnées.
SELECT l.id, l."articleId", l."position", l."createdAt"
FROM "ListenLater" l
WHERE l."userId" = sqlc.arg('user_id')::uuid
ORDER BY l."position", l."createdAt";

-- name: RemoveListenLater :execrows
DELETE FROM "ListenLater" WHERE "userId" = sqlc.arg('user_id')::uuid AND "articleId" = sqlc.arg('article_id');

-- name: DiscardArticleDraft :one
UPDATE "Article"
SET "draftContent" = NULL, "updatedAt" = now()
WHERE id = $1
RETURNING id;

-- name: InsertArticleReviewLog :exec
INSERT INTO "ArticleReviewLog" (id, "articleId", "publisherId", "reviewerId", action, comment)
VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5);

-- name: GetLatestArticleReviewFeedback :one
SELECT r.id, r."articleId", r."publisherId", r."reviewerId", r.action, r.comment, r."createdAt",
       u.name AS reviewer_name, u.username AS reviewer_username, u."logoUrl" AS reviewer_logo
FROM "ArticleReviewLog" r
JOIN "User" u ON u.id = r."reviewerId"
WHERE r."articleId" = $1
ORDER BY r."createdAt" DESC
LIMIT 1;

-- name: GetSovereignCopyByOriginAndAuthor :one
SELECT id, "publisherId", status, published
FROM "Article"
WHERE "originArticleId" = $1
  AND "authorId" = $2
  AND "isAuthorSovereignCopy" = true
LIMIT 1;

-- name: CreateSovereignArticleCopy :one
INSERT INTO "Article" (
    id, title, slug, content, published, "isPremium", visibility,
    "readingTime", "allowPublicAnnotations", "allowComments", "allowDownload",
    status, "publisherId", "authorId", "categoryId", "seoTitle", "seoDescription",
    "imageUrl", "showOnPersonalProfile", "originArticleId", "canonicalType",
    "isAuthorSovereignCopy", "canonicalUrl", "updatedAt"
)
VALUES (
    gen_random_uuid()::text, $1, $2, $3, false, $4, $5,
    $6, $7, $8, $9,
    'DRAFT', $10, $11, $12, $13, $14,
    $15, true, $16, 'PERSONAL_FORK',
    true, $17, now()
)
RETURNING id;

-- name: SetArticleCanonicalType :exec
UPDATE "Article"
SET "canonicalType" = $2, "updatedAt" = now()
WHERE id = $1;

