-- name: ListStarterPacks :many
SELECT sp.id, sp.title, sp.description, sp.icon, sp."createdAt", sp."updatedAt",
       p.id::text AS pub_id, p.name AS pub_name, p.slug AS pub_slug,
       p."subdomain" AS pub_subdomain, p."customDomain" AS pub_custom_domain,
       p."logoUrl" AS pub_logo, p."isCertified" AS pub_certified,
       (SELECT count(*)::int FROM "StarterPackItem" i WHERE i."starterPackId" = sp.id) AS item_count
FROM "StarterPack" sp
JOIN "Publication" p ON p.id = sp."publicationId"
ORDER BY sp."createdAt" DESC
LIMIT $1 OFFSET $2;

-- name: ListStarterPackItems :many
SELECT i."starterPackId" AS starter_pack_id, i."userId"::text AS user_id,
       u.name AS user_name, u.username AS user_username, u."logoUrl" AS user_logo,
       u."isCertified" AS user_certified,
       p.id::text AS pub_id, p.slug AS pub_slug, p."subdomain" AS pub_subdomain,
       (SELECT count(*)::int FROM "Follows" f WHERE f."publicationId" = p.id) AS follower_count
FROM "StarterPackItem" i
JOIN "User" u ON u.id = i."userId"
LEFT JOIN "Publication" p ON p.id = u."publicationId"
WHERE i."starterPackId" = $1
ORDER BY i."createdAt" ASC;

-- name: GetStarterPackByID :one
SELECT sp.id, sp.title, sp.description, sp.icon, sp."createdAt", sp."updatedAt",
       p.id::text AS pub_id, p.name AS pub_name, p.slug AS pub_slug,
       p."subdomain" AS pub_subdomain, p."customDomain" AS pub_custom_domain,
       p."logoUrl" AS pub_logo, p."isCertified" AS pub_certified,
       (SELECT count(*)::int FROM "StarterPackItem" i WHERE i."starterPackId" = sp.id) AS item_count
FROM "StarterPack" sp
JOIN "Publication" p ON p.id = sp."publicationId"
WHERE sp.id = $1;

-- name: CreateStarterPack :one
INSERT INTO "StarterPack" (id, title, description, icon, "publicationId", "updatedAt")
VALUES (gen_random_uuid()::text, $1, $2, $3, $4, now())
RETURNING id, title, description, icon, "publicationId", "createdAt", "updatedAt";

-- name: InsertStarterPackItem :exec
INSERT INTO "StarterPackItem" (id, "starterPackId", "userId")
VALUES (gen_random_uuid()::text, $1, $2)
ON CONFLICT ("starterPackId", "userId") DO NOTHING;

-- name: FollowPublications :one
WITH inserted AS (
  INSERT INTO "Follows" (id, "readerId", "publicationId")
  SELECT gen_random_uuid()::text, $2, u."publicationId"
  FROM "StarterPackItem" i
  JOIN "User" u ON u.id = i."userId"
  WHERE i."starterPackId" = $1 AND u."publicationId" IS NOT NULL
  GROUP BY u."publicationId"
  ON CONFLICT ("readerId", "publicationId") DO NOTHING
  RETURNING 1
)
SELECT count(*)::int AS followed_count FROM inserted;
