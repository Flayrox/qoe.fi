-- name: ListRecentPublishedArticles :many
-- Articles publiés récents (feed mobile « écran principal »), avec auteur /
-- publication / catégorie dénormalisés. Public, trié par date décroissante.
SELECT a.id,
       a.title,
       a.slug,
       a.content,
       a."isPremium",
       a.visibility,
       a."readingTime",
       a."createdAt",
       a."publicationId",
       a."authorId",
       u.id::text       AS author_id,
       u.name           AS author_name,
       u.username       AS author_username,
       u."logoUrl"      AS author_logo,
       u."isCertified"  AS author_certified,
       p.name           AS publication_name,
       p.slug           AS publication_slug,
       p.subdomain      AS publication_subdomain,
       p."logoUrl"      AS publication_logo,
       p.type           AS publication_type,
       c.id             AS category_id,
       c.name           AS category_name,
       c.slug           AS category_slug
FROM "Article" a
JOIN "User" u ON u.id = a."authorId"
JOIN "Publication" p ON p.id = a."publicationId"
LEFT JOIN "Category" c ON c.id = a."categoryId"
WHERE a.published = true
  AND u."isShadowbanned" = false
  AND u."isSuspended" = false
  AND (a."scheduledAt" IS NULL OR a."scheduledAt" <= now())
ORDER BY a."createdAt" DESC, a.id DESC
LIMIT $1 OFFSET $2;

-- name: ListPublishedArticlesByPublication :many
-- Articles publiés d'une publication (profil), résolue par slug OU subdomain
-- (insensible à la casse). Même shape que ListRecentPublishedArticles.
SELECT a.id,
       a.title,
       a.slug,
       a.content,
       a."isPremium",
       a.visibility,
       a."readingTime",
       a."createdAt",
       a."publicationId",
       a."authorId",
       u.id::text       AS author_id,
       u.name           AS author_name,
       u.username       AS author_username,
       u."logoUrl"      AS author_logo,
       u."isCertified"  AS author_certified,
       p.name           AS publication_name,
       p.slug           AS publication_slug,
       p.subdomain      AS publication_subdomain,
       p."logoUrl"      AS publication_logo,
       p.type           AS publication_type,
       c.id             AS category_id,
       c.name           AS category_name,
       c.slug           AS category_slug
FROM "Article" a
JOIN "User" u ON u.id = a."authorId"
JOIN "Publication" p ON p.id = a."publicationId"
LEFT JOIN "Category" c ON c.id = a."categoryId"
WHERE a.published = true
  AND (
    LOWER(p.slug) = LOWER($1)
    OR LOWER(COALESCE(p.subdomain, '')) = LOWER($1)
    OR LOWER(COALESCE(u.username, '')) = LOWER($1)
    OR LOWER(p.id) = LOWER($1)
    OR LOWER(COALESCE(u.id::text, '')) = LOWER($1)
  )
  AND u."isShadowbanned" = false
  AND u."isSuspended" = false
  AND (a."scheduledAt" IS NULL OR a."scheduledAt" <= now())
ORDER BY a."createdAt" DESC, a.id DESC
LIMIT $2 OFFSET $3;

-- name: GetArticleByID :one
SELECT a.id, a.title, a.slug, a.content, a.published, a."isPremium", a.visibility,
       a."readingTime", a."allowPublicAnnotations", a."allowComments", a."scheduledAt",
       a.status, a."publicationId", a."authorId", a."categoryId", a."tierId",
       a."seoTitle", a."seoDescription", a."createdAt", a."updatedAt",
       u.id::text     AS author_id,
       u.name         AS author_name,
       u.username     AS author_username,
       u."logoUrl"    AS author_logo,
       p.name         AS publication_name,
       p.slug         AS publication_slug,
       p.subdomain    AS publication_subdomain
FROM "Article" a
JOIN "User" u ON u.id = a."authorId"
JOIN "Publication" p ON p.id = a."publicationId"
WHERE a.id = $1;

-- name: GetArticleBySlug :one
SELECT a.id, a.title, a.slug, a.content, a.published, a."isPremium", a.visibility,
       a."readingTime", a."allowPublicAnnotations", a."allowComments", a."scheduledAt",
       a.status, a."publicationId", a."authorId", a."categoryId", a."tierId",
       a."seoTitle", a."seoDescription", a."createdAt", a."updatedAt",
       u.id::text     AS author_id,
       u.name         AS author_name,
       u.username     AS author_username,
       u."logoUrl"    AS author_logo,
       p.name         AS publication_name,
       p.slug         AS publication_slug,
       p.subdomain    AS publication_subdomain,
       p."customDomain" AS publication_custom_domain
FROM "Article" a
JOIN "User" u ON u.id = a."authorId"
JOIN "Publication" p ON p.id = a."publicationId"
WHERE a.slug = $1 AND a."publicationId" = $2;

-- name: GetArticleBySlugAny :one
-- Lecture publique par slug SEUL (premier article publié) — parité avec
-- findFirstBySlug Prisma de la page autonome /article/[slug] du reader core.
SELECT a.id, a.title, a.slug, a.content, a.published, a."isPremium", a.visibility,
       a."readingTime", a."allowPublicAnnotations", a."allowComments", a."scheduledAt",
       a.status, a."publicationId", a."authorId", a."categoryId", a."tierId",
       a."seoTitle", a."seoDescription", a."createdAt", a."updatedAt",
       u.id::text     AS author_id,
       u.name         AS author_name,
       u.username     AS author_username,
       u."logoUrl"    AS author_logo,
       p.name         AS publication_name,
       p.slug         AS publication_slug,
       p.subdomain    AS publication_subdomain,
       p."customDomain" AS publication_custom_domain
FROM "Article" a
JOIN "User" u ON u.id = a."authorId"
JOIN "Publication" p ON p.id = a."publicationId"
WHERE a.slug = $1 AND a.published = true
ORDER BY a."createdAt" DESC, a.id DESC
LIMIT 1;

-- name: GetCreatorArticleBySlug :one
-- Lecture d'un article PUBLIÉ d'une publication au format contrat créateurs
-- (clé API → publication du créateur), catégorie embarquée.
SELECT a.id, a.title, a.slug, a.content, a.published, a."isPremium", a.visibility,
       a."readingTime", a.status, a."tierId", a."createdAt", a."updatedAt",
       c.id AS category_id, c.name AS category_name, c.slug AS category_slug,
       c.description AS category_description
FROM "Article" a
LEFT JOIN "Category" c ON c.id = a."categoryId"
WHERE a.slug = $1 AND a."publicationId" = $2 AND a.published = true;

-- name: ListCreatorArticles :many
-- Liste des articles d'une publication au format contrat créateurs (Hono) :
-- filtres `published` (défaut true) et `category` (slug), catégorie embarquée.
SELECT a.id, a.title, a.slug, a.content, a.published, a."isPremium", a.visibility,
       a."readingTime", a.status, a."tierId", a."createdAt", a."updatedAt",
       c.id AS category_id, c.name AS category_name, c.slug AS category_slug,
       c.description AS category_description
FROM "Article" a
LEFT JOIN "Category" c ON c.id = a."categoryId"
WHERE a."publicationId" = sqlc.arg('publicationId')
  AND (sqlc.narg('published')::boolean IS NULL OR a.published = sqlc.narg('published'))
  AND (sqlc.narg('categorySlug')::text IS NULL OR c.slug = sqlc.narg('categorySlug'))
ORDER BY a."createdAt" DESC
LIMIT sqlc.arg('limit') OFFSET sqlc.arg('offset');

-- name: CountCreatorArticles :one
-- Compte des articles d'une publication (mêmes filtres que ListCreatorArticles).
SELECT COUNT(*)
FROM "Article" a
LEFT JOIN "Category" c ON c.id = a."categoryId"
WHERE a."publicationId" = sqlc.arg('publicationId')
  AND (sqlc.narg('published')::boolean IS NULL OR a.published = sqlc.narg('published'))
  AND (sqlc.narg('categorySlug')::text IS NULL OR c.slug = sqlc.narg('categorySlug'));

-- name: ListArticlesWithCategory :many
SELECT a.id, a.title, a.slug, a.published, a."isPremium", a.visibility, a."readingTime",
       a.status, a."createdAt", a."updatedAt", a."categoryId", a."publicationId",
       c.id  AS category_id,
       c.name AS category_name,
       c.slug AS category_slug
FROM "Article" a
LEFT JOIN "Category" c ON c.id = a."categoryId"
WHERE a."publicationId" = $1
ORDER BY a."createdAt" DESC
LIMIT $2 OFFSET $3;

-- name: GetArticleIdByPublicationAndSlug :one
-- Dédoublonnage import RSS : un article existe déjà si publicationId + slug matchent.
SELECT id FROM "Article" WHERE "publicationId" = $1 AND slug = $2 LIMIT 1;

-- name: CreateArticle :one
INSERT INTO "Article" (id, title, slug, content, published, "isPremium", visibility,
                       "readingTime", "allowPublicAnnotations", "allowComments", status,
                       "publicationId", "authorId", "categoryId", "tierId", "seoTitle", "seoDescription", "updatedAt")
VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now())
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
    "categoryId" = $8, "seoTitle" = $9, "seoDescription" = $10, "readingTime" = $11, "updatedAt" = now()
WHERE id = $1
RETURNING id;

-- name: SetArticleStatus :one
UPDATE "Article"
SET status = $2, published = $3, "updatedAt" = now()
WHERE id = $1
RETURNING id;

-- name: GetSubscriberEntitlement :one
SELECT s."isPremium", s."isActive", s."tierId"
FROM "Subscriber" s
WHERE s."publicationId" = $1
  AND (s."userId" = $2 OR s.email = $3)
LIMIT 1;

-- name: GetUserPersonalPublication :one
SELECT "publicationId" AS id
FROM "User"
WHERE id = $1;

-- name: GetMediaRoleForUser :one
SELECT m.role
FROM "MediaMember" m
JOIN "Media" md ON md.id = m."mediaId"
WHERE md."publicationId" = $1 AND m."userId" = $2
LIMIT 1;

-- name: DeleteArticle :exec
DELETE FROM "Article"
WHERE id = $1;
