-- =====================================================================
-- 🤝 Recommandations croisées entre créateurs (Substack Killer)
-- =====================================================================

-- name: ListRecommendationsByPublisher :many
SELECT r.id, r."description", r."createdAt",
       p.id AS publisher_id, p.name AS publisher_name, p.slug AS publisher_slug,
       p.subdomain AS publisher_subdomain, p."customDomain" AS publisher_custom_domain,
       p.bio AS publisher_bio, p."logoUrl" AS publisher_logo_url
FROM "Recommendation" r
JOIN "Publisher" p ON p.id = r."recommendedId"
WHERE r."recommenderId" = $1
ORDER BY r."createdAt" DESC;

-- name: AddRecommendation :one
INSERT INTO "Recommendation" (id, "recommenderId", "recommendedId", "description", "createdAt")
VALUES (gen_random_uuid()::text, $1, $2, $3, now())
ON CONFLICT ("recommenderId", "recommendedId") DO UPDATE
SET "description" = EXCLUDED."description"
RETURNING *;

-- name: RemoveRecommendation :exec
DELETE FROM "Recommendation"
WHERE "recommenderId" = $1 AND "recommendedId" = $2;

-- name: CountRecommendationsByPublisher :one
SELECT count(*)
FROM "Recommendation"
WHERE "recommenderId" = $1;
