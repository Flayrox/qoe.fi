-- Administration Média (création, membres, invitations, réglages) — migration dashboard → Go.

-- name: GetMediaMemberByID :one
SELECT id, "mediaId", "userId"::text AS user_id, role, permissions, status, "joinedAt"
FROM "MediaMember"
WHERE "mediaId" = $1 AND "userId" = $2;

-- name: GetUserMediaMemberships :many
SELECT m."mediaId"        AS media_id,
       m.role,
       m.permissions,
       m.status,
       p.id               AS publisher_id,
       p.name             AS publisher_name,
       p.slug             AS publisher_slug,
       p.subdomain        AS publisher_subdomain,
       p.bio              AS publisher_bio,
       p."logoUrl"        AS publisher_logo
FROM "MediaMember" m
JOIN "Media" md ON md.id = m."mediaId"
JOIN "Publisher" p ON p.id = md."publisherId"
WHERE m."userId" = $1
  AND m.status = 'active'
ORDER BY p.name ASC;

-- name: GetPersonalPublisherForUser :one
SELECT p.id, p.name, p.slug, p."logoUrl"
FROM "Publisher" p
JOIN "User" u ON u."publisherId" = p.id
WHERE u.id = $1 AND p.type = 'PERSONAL'
LIMIT 1;

-- name: CheckMediaSlugExists :one
SELECT EXISTS(
    SELECT 1 FROM "Publisher" WHERE slug = $1 OR subdomain = $1
) AS exists;

-- name: CreateMediaPublisher :one
INSERT INTO "Publisher" (id, type, name, slug, subdomain, bio, "logoUrl", "accentColor", "updatedAt")
VALUES (gen_random_uuid()::text, 'MEDIA', $1, $2, $3, $4, $5, $6, now())
RETURNING id;

-- name: CreateMedia :one
INSERT INTO "Media" (id, "publisherId", "updatedAt")
VALUES (gen_random_uuid()::text, $1, now())
RETURNING id;

-- name: CreateMediaMember :exec
INSERT INTO "MediaMember" (id, "mediaId", "userId", role, status, "updatedAt")
VALUES (gen_random_uuid()::text, $1, $2, $3, $4, now());

-- name: UpsertMediaMember :exec
INSERT INTO "MediaMember" (id, "mediaId", "userId", role, status, "updatedAt")
VALUES (gen_random_uuid()::text, $1, $2, $3, $4, now())
ON CONFLICT ("mediaId", "userId")
DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status, "updatedAt" = now();

-- name: UpdateMediaMemberRole :exec
UPDATE "MediaMember"
SET role = $3, permissions = ARRAY[]::text[], "updatedAt" = now()
WHERE "mediaId" = $1 AND "userId" = $2;

-- name: ActivateMediaMember :execrows
-- Accepte une invitation en attente (fiche 05 §6) : ne passe en `active`
-- qu'une ligne encore `invited`. Zéro ligne affectée = pas d'invitation (ou
-- déjà active, ou révoquée entre-temps) : l'appelant distingue via le statut
-- lu avant. Jamais d'activation implicite par un autre chemin.
UPDATE "MediaMember"
SET status = 'active', "updatedAt" = now()
WHERE "mediaId" = $1 AND "userId" = $2 AND status = 'invited';

-- name: UpdateMediaMemberPermissions :exec
UPDATE "MediaMember"
SET permissions = $3, "updatedAt" = now()
WHERE "mediaId" = $1 AND "userId" = $2;

-- name: DeleteMediaMember :exec
DELETE FROM "MediaMember" WHERE "mediaId" = $1 AND "userId" = $2;

-- name: InsertMediaAuditLog :exec
-- metadata est passé en texte puis casté en jsonb : le pool API force
-- QueryExecModeExec (PgBouncer), où pgx encoderait []byte en bytea → 22P02.
INSERT INTO "MediaAuditLog" (id, "mediaId", "actorId", action, metadata)
VALUES (gen_random_uuid()::text, $1, $2, $3, sqlc.arg('metadata')::text::jsonb);

-- name: ListMediaAuditLogs :many
-- Journal d'activité du média (réglages, membres, articles, transferts).
-- `metadata` est rendu en texte pour rester lisible par l'appelant, qui le
-- décode en JSON ; `actorId` est joint pour afficher l'auteur de l'action.
SELECT l.id::text AS id,
       l.action,
       COALESCE(l.metadata::text, '{}') AS metadata,
       l."createdAt",
       l."actorId"::text AS actor_id,
       u.name AS actor_name,
       u.username AS actor_username,
       u."logoUrl" AS actor_logo
FROM "MediaAuditLog" l
LEFT JOIN "User" u ON u.id = l."actorId"
WHERE l."mediaId" = $1
  AND (sqlc.arg('actionPrefix')::text = '' OR l.action LIKE sqlc.arg('actionPrefix'))
  AND (
    sqlc.arg('query')::text = ''
    OR l.action ILIKE '%' || sqlc.arg('query') || '%'
    OR COALESCE(u.name, '') ILIKE '%' || sqlc.arg('query') || '%'
    OR COALESCE(u.username, '') ILIKE '%' || sqlc.arg('query') || '%'
    OR COALESCE(l.metadata::text, '') ILIKE '%' || sqlc.arg('query') || '%'
  )
ORDER BY l."createdAt" DESC
LIMIT sqlc.arg('limit') OFFSET sqlc.arg('offset');

-- name: CountMediaAuditLogs :one
-- Compte le journal filtré pour paginer sans mentir sur le total.
SELECT COUNT(*)::int AS total
FROM "MediaAuditLog" l
LEFT JOIN "User" u ON u.id = l."actorId"
WHERE l."mediaId" = $1
  AND (sqlc.arg('actionPrefix')::text = '' OR l.action LIKE sqlc.arg('actionPrefix'))
  AND (
    sqlc.arg('query')::text = ''
    OR l.action ILIKE '%' || sqlc.arg('query') || '%'
    OR COALESCE(u.name, '') ILIKE '%' || sqlc.arg('query') || '%'
    OR COALESCE(u.username, '') ILIKE '%' || sqlc.arg('query') || '%'
    OR COALESCE(l.metadata::text, '') ILIKE '%' || sqlc.arg('query') || '%'
  );

-- name: GetUserByEmail :one
SELECT id::text AS id, email, name, username, "logoUrl", "isCertified"
FROM "User"
WHERE email = $1;

-- name: GetMediaWithPublisher :one
SELECT md.id                 AS media_id,
       md."publisherId"    AS publisher_id,
       p.name,
       p.slug,
       p.bio,
       p."logoUrl",
       p.subdomain,
       p."customDomain",
       p."accentColor",
       p."heroText",
       p."headerImageUrl",
       p."footerText",
       p."themeMode",
       p."layoutStyle",
       p."seoTitle",
       p."seoDescription",
       p."allowIndexing",
       p."fontFamily",
       p."supportUrl"
FROM "Media" md
JOIN "Publisher" p ON p.id = md."publisherId"
WHERE md.id = $1;

-- name: CountArticlesByPublisher :one
SELECT COUNT(*)::int AS count FROM "Article" WHERE "publisherId" = $1;

-- name: CountMediaMembers :one
SELECT COUNT(*)::int AS count FROM "MediaMember" WHERE "mediaId" = $1;

-- name: GetUserIdentity :one
SELECT name, username, "logoUrl", email
FROM "User" WHERE id = $1;

-- name: ListMediaMembers :many
SELECT m.id AS member_id, m."userId"::text AS user_id, m.role, m.permissions, m.status, m."joinedAt",
       u.name, u.username, u."logoUrl"
FROM "MediaMember" m
JOIN "User" u ON u.id = m."userId"
WHERE m."mediaId" = $1
ORDER BY m."joinedAt" ASC;

-- ============================================================================
-- Clés API Média (gestion par le média, délégation api_keys:manage)
-- ============================================================================

-- name: ListMediaApiKeys :many
SELECT ak.id,
       ak.name,
       ak."keyPrefix",
       ak.scopes,
       ak."createdAt",
       ak."lastUsedAt",
       COALESCE(ak."createdByUserId"::text, '')::text AS created_by_user_id,
       u.name                                         AS created_by_name,
       u.username                                     AS created_by_username
FROM "ApiKey" ak
JOIN "Media" m ON m."publisherId" = ak."publisherId"
LEFT JOIN "User" u ON u.id = ak."createdByUserId"
WHERE m.id = $1
ORDER BY ak."createdAt" DESC;

-- name: CountMediaApiKeys :one
SELECT COUNT(*)::int
FROM "ApiKey" ak
JOIN "Media" m ON m."publisherId" = ak."publisherId"
WHERE m.id = $1;

-- name: InsertMediaApiKey :exec
INSERT INTO "ApiKey" (id, name, "keyPrefix", "keyHash", scopes, "publisherId", "createdByUserId")
VALUES ($1, $2, $3, $4, $5, $6, $7);

-- name: GetMediaApiKeyByID :one
SELECT ak.id,
       ak.name,
       ak."keyPrefix",
       ak.scopes,
       ak."createdAt",
       ak."lastUsedAt",
       ak."publisherId",
       COALESCE(ak."createdByUserId"::text, '')::text AS created_by_user_id,
       m.id                                           AS media_id
FROM "ApiKey" ak
JOIN "Media" m ON m."publisherId" = ak."publisherId"
WHERE ak.id = sqlc.arg('key_id') AND m.id = sqlc.arg('media_id');

-- name: UpdateMediaApiKeyName :execrows
UPDATE "ApiKey" ak
SET name = sqlc.arg('name')
FROM "Media" m
WHERE ak.id = sqlc.arg('key_id') AND m.id = sqlc.arg('media_id') AND ak."publisherId" = m."publisherId";

-- name: UpdateMediaApiKeySecret :execrows
UPDATE "ApiKey" ak
SET "keyHash" = sqlc.arg('key_hash'), "keyPrefix" = sqlc.arg('key_prefix')
FROM "Media" m
WHERE ak.id = sqlc.arg('key_id') AND m.id = sqlc.arg('media_id') AND ak."publisherId" = m."publisherId";

-- name: DeleteMediaApiKey :execrows
DELETE FROM "ApiKey" ak
USING "Media" m
WHERE ak.id = sqlc.arg('key_id') AND m.id = sqlc.arg('media_id') AND ak."publisherId" = m."publisherId";

-- name: GetMediaByPublisherID :one
-- Résout un Média depuis l'identifiant de SA publication (le profil public
-- d'un média expose la publisherId, pas l'id du média).
SELECT md.id AS media_id,
       md."publisherId" AS publisher_id
FROM "Media" md
WHERE md."publisherId" = $1
LIMIT 1;
