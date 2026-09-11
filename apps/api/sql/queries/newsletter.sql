-- =====================================================================
-- 📬 Newsletters créateurs (NewsletterIssue / NewsletterDelivery).
-- =====================================================================

-- name: CreateNewsletterIssue :one
INSERT INTO "NewsletterIssue" (id, "publicationId", subject, "previewText", html, "updatedAt")
VALUES (gen_random_uuid()::text, $1, $2, $3, $4, now())
RETURNING *;

-- name: ListNewsletterIssuesByPublication :many
SELECT *
FROM "NewsletterIssue"
WHERE "publicationId" = $1
ORDER BY "createdAt" DESC;

-- name: GetNewsletterIssue :one
SELECT *
FROM "NewsletterIssue"
WHERE id = $1;

-- name: GetNewsletterIssueWithPublication :one
SELECT i.*, p.name AS publication_name, p.subdomain AS publication_subdomain,
       p."customDomain" AS publication_custom_domain, p."logoUrl" AS publication_logo_url
FROM "NewsletterIssue" i
JOIN "Publication" p ON p.id = i."publicationId"
WHERE i.id = $1;

-- name: UpdateNewsletterIssueDraft :one
UPDATE "NewsletterIssue"
SET subject       = $2,
    "previewText" = $3,
    html          = $4,
    "updatedAt"   = now()
WHERE id = $1
  AND status = 'DRAFT'
RETURNING *;

-- name: DeleteNewsletterIssueDraft :exec
DELETE FROM "NewsletterIssue"
WHERE id = $1
  AND status = 'DRAFT';

-- name: SetNewsletterIssueSending :one
UPDATE "NewsletterIssue"
SET status     = 'SENDING',
    "updatedAt" = now()
WHERE id = $1
  AND status = 'DRAFT'
RETURNING id;

-- name: FinishNewsletterIssue :one
UPDATE "NewsletterIssue"
SET status           = $2,
    "sentCount"      = $3,
    "failedCount"    = $4,
    "totalRecipients" = $5,
    "sentAt"         = COALESCE("sentAt", now()),
    "updatedAt"      = now()
WHERE id = $1
RETURNING id;

-- name: InsertNewsletterDeliveries :exec
INSERT INTO "NewsletterDelivery" (id, "issueId", email, "subscriberId", "updatedAt")
SELECT gen_random_uuid()::text, $1, s.email, s.id, now()
FROM "Subscriber" s
WHERE s."publicationId" = $2
  AND s."isActive" = true
  AND s."receiveArticles" = true
ON CONFLICT ("issueId", email) DO NOTHING;

-- name: ListNewsletterDeliveriesByIssue :many
SELECT id, email, status, error
FROM "NewsletterDelivery"
WHERE "issueId" = $1
  AND status = 'QUEUED'
ORDER BY "createdAt" ASC
LIMIT $2;

-- name: MarkNewsletterDelivery :exec
UPDATE "NewsletterDelivery"
SET status     = $3,
    error      = $4,
    "sentAt"   = CASE WHEN $3 = 'SENT' THEN now() ELSE NULL END,
    "updatedAt" = now()
WHERE "issueId" = $1
  AND email = $2;

-- name: InsertArticleReleaseDeliveries :exec
INSERT INTO "ArticleReleaseDelivery" (id, "articleId", email, "subscriberId", "updatedAt")
SELECT gen_random_uuid()::text, $1, s.email, s.id, now()
FROM "Subscriber" s
WHERE s."publicationId" = $2
  AND s."isActive" = true
  AND s."receiveArticles" = true
ON CONFLICT ("articleId", email) DO NOTHING;

-- name: ListQueuedArticleReleaseDeliveries :many
SELECT id, email, status, error
FROM "ArticleReleaseDelivery"
WHERE "articleId" = $1
  AND status = 'QUEUED'
ORDER BY "createdAt" ASC
LIMIT $2;

-- name: MarkArticleReleaseDelivery :exec
UPDATE "ArticleReleaseDelivery"
SET status     = $3,
    error      = $4,
    "sentAt"   = CASE WHEN $3 = 'SENT' THEN now() ELSE NULL END,
    "updatedAt" = now()
WHERE "articleId" = $1
  AND email = $2;

-- name: ResetNewsletterIssueToDraft :exec
UPDATE "NewsletterIssue"
SET status     = 'DRAFT',
    "updatedAt" = now()
WHERE id = $1
  AND status = 'SENDING';

-- name: GetArticleReleaseInfo :one
SELECT a.id, a.title, a.slug, a.visibility, a."isPremium", a.content,
       a."publicationId",
       p.name AS publication_name, p.subdomain, p."customDomain"
FROM "Article" a
JOIN "Publication" p ON p.id = a."publicationId"
WHERE a.id = $1
  AND a.published = true
  AND a.status = 'PUBLISHED';

-- name: CountArticleReleaseDeliveries :one
SELECT COUNT(*)::bigint AS total,
       COUNT(*) FILTER (WHERE status = 'SENT')::bigint   AS sent,
       COUNT(*) FILTER (WHERE status = 'FAILED')::bigint AS failed
FROM "ArticleReleaseDelivery"
WHERE "articleId" = $1;

-- name: CountNewsletterDeliveriesByIssue :one
SELECT COUNT(*)::bigint AS total,
       COUNT(*) FILTER (WHERE status = 'SENT')::bigint   AS sent,
       COUNT(*) FILTER (WHERE status = 'FAILED')::bigint AS failed
FROM "NewsletterDelivery"
WHERE "issueId" = $1;

-- name: UnsubscribeNewsletterSubscriber :exec
UPDATE "Subscriber"
SET "receiveArticles" = false,
    "updatedAt"       = now()
WHERE "publicationId" = $1
  AND email = $2;

-- name: GetUserPublicationID :one
SELECT COALESCE("publicationId", '')
FROM "User"
WHERE id = $1;

-- name: UserOwnsPublication :one
SELECT (
    EXISTS (SELECT 1 FROM "User" WHERE "User".id = $1 AND "User"."publicationId" = $2)
    OR EXISTS (SELECT 1 FROM "MediaMember" mm JOIN "Media" md ON md.id = mm."mediaId"
               WHERE mm."userId" = $1 AND md."publicationId" = $2
                 AND mm.role = 'owner' AND mm.status = 'active')
)::boolean AS owns;

-- =====================================================================
-- 👥 Gestion des abonnés (Subscribers API & Headless integrations)
-- =====================================================================

-- name: UpsertSubscriber :one
INSERT INTO "Subscriber" (
    id, email, "publicationId", status, "isActive", "receiveArticles", "createdAt", "updatedAt"
)
VALUES (
    gen_random_uuid()::text,
    LOWER(TRIM(sqlc.arg(email)::text)),
    sqlc.arg(publication_id)::text,
    'ACTIVE',
    true,
    true,
    now(),
    now()
)
ON CONFLICT ("email", "publicationId") DO UPDATE
SET "isActive" = true,
    "receiveArticles" = true,
    status = 'ACTIVE',
    "updatedAt" = now()
RETURNING id, email, status, "isActive", "isPremium", "receiveArticles", "createdAt", "updatedAt", "publicationId";

-- name: ListSubscribersByPublication :many
SELECT id, email, status, "isActive", "isPremium", "receiveArticles", "createdAt", "updatedAt"
FROM "Subscriber"
WHERE "publicationId" = $1
ORDER BY "createdAt" DESC
LIMIT $2 OFFSET $3;

-- name: CountSubscribersByPublication :one
SELECT COUNT(*)::bigint
FROM "Subscriber"
WHERE "publicationId" = $1;

-- name: GetSubscriberStatsByPublication :one
SELECT 
    COUNT(*)::bigint AS total,
    COUNT(*) FILTER (WHERE "isActive" = true)::bigint AS active,
    COUNT(*) FILTER (WHERE "isActive" = true AND "isPremium" = true)::bigint AS premium
FROM "Subscriber"
WHERE "publicationId" = $1;

-- name: DeactivateSubscriber :one
UPDATE "Subscriber"
SET "isActive" = false,
    "receiveArticles" = false,
    status = 'CANCELED',
    "updatedAt" = now()
WHERE "publicationId" = sqlc.arg(publication_id)::text
  AND (id = sqlc.arg(id)::text OR LOWER(email) = LOWER(TRIM(sqlc.arg(id)::text)))
RETURNING id;

-- name: ResolvePublicationIDBySlugOrID :one
SELECT id
FROM "Publication"
WHERE id = $1
   OR LOWER(slug) = LOWER($1)
   OR LOWER(COALESCE(subdomain, '')) = LOWER($1)
LIMIT 1;

-- name: GetPublicationMetadataByID :one
SELECT 
    p.id,
    p.type,
    p.name,
    p.slug,
    p.bio,
    p.subdomain,
    p."customDomain",
    p."heroText",
    p."footerText",
    p."logoUrl",
    p."headerImageUrl",
    p."accentColor",
    p."themeMode",
    p."layoutStyle",
    p."fontFamily",
    p."supportUrl",
    p."seoTitle",
    p."seoDescription",
    p."allowIndexing",
    p."allowPublicAnnotations",
    p."allowComments",
    p."isCertified",
    p."createdAt",
    p."updatedAt"
FROM "Publication" p
WHERE p.id = $1;

