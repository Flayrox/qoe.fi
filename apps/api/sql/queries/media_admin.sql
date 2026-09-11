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
       p.id               AS publication_id,
       p.name             AS publication_name,
       p.slug             AS publication_slug,
       p.subdomain        AS publication_subdomain,
       p.bio              AS publication_bio,
       p."logoUrl"        AS publication_logo
FROM "MediaMember" m
JOIN "Media" md ON md.id = m."mediaId"
JOIN "Publication" p ON p.id = md."publicationId"
WHERE m."userId" = $1
ORDER BY p.name ASC;

-- name: GetPersonalPublicationForUser :one
SELECT p.id, p.name, p.slug, p."logoUrl"
FROM "Publication" p
JOIN "User" u ON u."publicationId" = p.id
WHERE u.id = $1 AND p.type = 'PERSONAL'
LIMIT 1;

-- name: CheckMediaSlugExists :one
SELECT EXISTS(
    SELECT 1 FROM "Publication" WHERE slug = $1 OR subdomain = $1
) AS exists;

-- name: CreateMediaPublication :one
INSERT INTO "Publication" (id, type, name, slug, subdomain, bio, "logoUrl", "accentColor", "updatedAt")
VALUES (gen_random_uuid()::text, 'MEDIA', $1, $2, $3, $4, $5, $6, now())
RETURNING id;

-- name: CreateMedia :one
INSERT INTO "Media" (id, "publicationId", "updatedAt")
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

-- name: GetUserByEmail :one
SELECT id::text AS id, email, name, username, "logoUrl", "isCertified"
FROM "User"
WHERE email = $1;

-- name: CreateMediaInvite :one
INSERT INTO "MediaInvite" (id, "mediaId", "inviterId", email, role, token, "expiresAt")
VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6)
RETURNING id;

-- name: GetMediaInviteByToken :one
SELECT id, "mediaId", "inviterId"::text AS inviter_id, email, role, token, status, "expiresAt", "acceptedAt"
FROM "MediaInvite"
WHERE token = $1;

-- name: UpdateMediaInviteStatus :exec
UPDATE "MediaInvite"
SET status = $2, "acceptedAt" = now()
WHERE id = $1;

-- name: ListMediaInvites :many
SELECT i.id, i.email, i.role, i.status, i."createdAt", i."expiresAt",
       u.id::text AS inviter_id, u.name AS inviter_name, u.username AS inviter_username
FROM "MediaInvite" i
JOIN "User" u ON u.id = i."inviterId"
WHERE i."mediaId" = $1 AND i.status = 'PENDING'
ORDER BY i."createdAt" DESC;

-- name: GetMediaWithPublication :one
SELECT md.id                 AS media_id,
       md."publicationId"    AS publication_id,
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
JOIN "Publication" p ON p.id = md."publicationId"
WHERE md.id = $1;

-- name: CountArticlesByPublication :one
SELECT COUNT(*)::int AS count FROM "Article" WHERE "publicationId" = $1;

-- name: CountMediaMembers :one
SELECT COUNT(*)::int AS count FROM "MediaMember" WHERE "mediaId" = $1;

-- name: CountMediaInvites :one
SELECT COUNT(*)::int AS count FROM "MediaInvite" WHERE "mediaId" = $1;

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
JOIN "Media" m ON m."publicationId" = ak."publicationId"
LEFT JOIN "User" u ON u.id = ak."createdByUserId"
WHERE m.id = $1
ORDER BY ak."createdAt" DESC;

-- name: CountMediaApiKeys :one
SELECT COUNT(*)::int
FROM "ApiKey" ak
JOIN "Media" m ON m."publicationId" = ak."publicationId"
WHERE m.id = $1;

-- name: InsertMediaApiKey :exec
INSERT INTO "ApiKey" (id, name, "keyPrefix", "keyHash", scopes, "publicationId", "createdByUserId")
VALUES ($1, $2, $3, $4, $5, $6, $7);

-- name: GetMediaApiKeyByID :one
SELECT ak.id,
       ak.name,
       ak."keyPrefix",
       ak.scopes,
       ak."createdAt",
       ak."lastUsedAt",
       ak."publicationId",
       COALESCE(ak."createdByUserId"::text, '')::text AS created_by_user_id,
       m.id                                           AS media_id
FROM "ApiKey" ak
JOIN "Media" m ON m."publicationId" = ak."publicationId"
WHERE ak.id = sqlc.arg('key_id') AND m.id = sqlc.arg('media_id');

-- name: UpdateMediaApiKeyName :execrows
UPDATE "ApiKey" ak
SET name = sqlc.arg('name')
FROM "Media" m
WHERE ak.id = sqlc.arg('key_id') AND m.id = sqlc.arg('media_id') AND ak."publicationId" = m."publicationId";

-- name: UpdateMediaApiKeySecret :execrows
UPDATE "ApiKey" ak
SET "keyHash" = sqlc.arg('key_hash'), "keyPrefix" = sqlc.arg('key_prefix')
FROM "Media" m
WHERE ak.id = sqlc.arg('key_id') AND m.id = sqlc.arg('media_id') AND ak."publicationId" = m."publicationId";

-- name: DeleteMediaApiKey :execrows
DELETE FROM "ApiKey" ak
USING "Media" m
WHERE ak.id = sqlc.arg('key_id') AND m.id = sqlc.arg('media_id') AND ak."publicationId" = m."publicationId";
