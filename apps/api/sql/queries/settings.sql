-- Profil créateur, onboarding, sous-domaine, liens, clés API (migration dashboard → Go).

-- name: GetUserForSettings :one
SELECT u.id::text         AS id,
       u.email,
       u.username,
       u.name,
       u.role,
       u."isCertified",
       u."logoUrl",
       u."publicationId",
       u."advancedSettingsMode",
       u."hasCompletedOnboarding",
       u."apiAccessStatus",
       u."apiApplicationReason",
       u."createdAt",
       u."updatedAt"
FROM "User" u
WHERE u.id = $1;

-- name: CheckSubdomainExists :one
SELECT EXISTS(SELECT 1 FROM "Publication" WHERE "subdomain" = $1) AS exists;

-- name: UpdatePublicationSubdomain :exec
UPDATE "Publication"
SET "subdomain" = $2, "updatedAt" = now()
WHERE id = $1;

-- name: UpdateUserOnboardingText :exec
UPDATE "User"
SET "onboardingText" = $2, "updatedAt" = now()
WHERE id = $1;

-- name: DeleteNavigationItems :exec
DELETE FROM "NavigationItem" WHERE "publicationId" = $1;

-- name: InsertNavigationItem :exec
INSERT INTO "NavigationItem" (id, label, url, "order", "isExternal", "publicationId")
VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5);

-- name: DeleteSocialLinks :exec
DELETE FROM "SocialLink" WHERE "publicationId" = $1;

-- name: InsertSocialLink :exec
INSERT INTO "SocialLink" (id, platform, url, "order", "publicationId")
VALUES (gen_random_uuid()::text, $1, $2, $3, $4);

-- name: SetApiApplication :exec
UPDATE "User"
SET "apiAccessStatus" = 'pending', "apiApplicationReason" = $2, "updatedAt" = now()
WHERE id = $1;

-- name: GetUserApiAccessStatus :one
SELECT "apiAccessStatus" FROM "User" WHERE id = $1;

-- name: InsertApiKey :exec
INSERT INTO "ApiKey" (id, name, "keyPrefix", "keyHash", scopes, "userId")
VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5);

-- name: DeleteApiKey :exec
DELETE FROM "ApiKey" WHERE id = $1 AND "userId" = $2;

-- name: CompleteOnboardingUser :exec
UPDATE "User"
SET role = $2, "hasCompletedOnboarding" = true, name = $3, "updatedAt" = now()
WHERE id = $1;

-- name: CreatePersonalPublication :one
INSERT INTO "Publication" (id, type, name, slug, "subdomain", "heroText", "layoutStyle",
                           "logoUrl", "isCertified", "updatedAt")
VALUES (gen_random_uuid()::text, 'PERSONAL', $1, $2, $3, $4, $5, $6, $7, now())
RETURNING id;

-- name: UpdatePersonalPublication :exec
UPDATE "Publication"
SET name = $2, "subdomain" = $3, "heroText" = $4, "layoutStyle" = $5, "updatedAt" = now()
WHERE id = $1;

-- name: LinkUserPublication :exec
UPDATE "User" SET "publicationId" = $2, "updatedAt" = now() WHERE id = $1;
