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
INSERT INTO "MediaAuditLog" (id, "mediaId", "actorId", action, metadata)
VALUES (gen_random_uuid()::text, $1, $2, $3, $4);

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

-- name: ListMediaMembers :many
SELECT m."userId"::text AS user_id, m.role, m.permissions, m.status, m."joinedAt",
       u.name, u.username, u."logoUrl"
FROM "MediaMember" m
JOIN "User" u ON u.id = m."userId"
WHERE m."mediaId" = $1
ORDER BY m."joinedAt" ASC;
