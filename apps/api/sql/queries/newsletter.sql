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
ORDER BY "createdAt" ASC;

-- name: MarkNewsletterDelivery :exec
UPDATE "NewsletterDelivery"
SET status     = $3,
    error      = $4,
    "sentAt"   = CASE WHEN $3 = 'SENT' THEN now() ELSE NULL END,
    "updatedAt" = now()
WHERE "issueId" = $1
  AND email = $2;

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
