-- =====================================================================
-- 🤝 Recommandations croisées entre créateurs (Substack Killer)
-- =====================================================================

-- name: ListRecommendationsByPublication :many
SELECT r.id, r."description", r."createdAt",
       p.id AS publication_id, p.name AS publication_name, p.slug AS publication_slug,
       p.subdomain AS publication_subdomain, p."customDomain" AS publication_custom_domain,
       p.bio AS publication_bio, p."logoUrl" AS publication_logo_url
FROM "Recommendation" r
JOIN "Publication" p ON p.id = r."recommendedId"
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

-- name: CountRecommendationsByPublication :one
SELECT count(*)
FROM "Recommendation"
WHERE "recommenderId" = $1;
