-- Profil créateur, onboarding, sous-domaine, liens, clés API (migration dashboard → Go).

-- name: GetUserForSettings :one
SELECT u.id::text         AS id,
       u.email,
       u.username,
       u.name,
       u.role,
       u."isCertified",
       u."logoUrl",
       u."publisherId",
       u."advancedSettingsMode",
       u."hasCompletedOnboarding",
       u."apiAccessStatus",
       u."apiApplicationReason",
       u."createdAt",
       u."updatedAt"
FROM "User" u
WHERE u.id = $1;

-- name: CheckSubdomainExists :one
SELECT EXISTS(SELECT 1 FROM "Publisher" WHERE "subdomain" = $1) AS exists;

-- name: UpdatePublisherSubdomain :exec
UPDATE "Publisher"
SET "subdomain" = $2, "updatedAt" = now()
WHERE id = $1;

-- name: UpdateUserOnboardingText :exec
UPDATE "User"
SET "onboardingText" = $2, "updatedAt" = now()
WHERE id = $1;

-- name: DeleteNavigationItems :exec
DELETE FROM "NavigationItem" WHERE "publisherId" = $1;

-- name: InsertNavigationItem :exec
INSERT INTO "NavigationItem" (id, label, url, "order", "isExternal", "publisherId")
VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5);

-- name: DeleteSocialLinks :exec
DELETE FROM "SocialLink" WHERE "publisherId" = $1;

-- name: InsertSocialLink :exec
INSERT INTO "SocialLink" (id, platform, url, "order", "publisherId")
VALUES (gen_random_uuid()::text, $1, $2, $3, $4);

-- name: SetApiApplication :exec
UPDATE "User"
SET "apiAccessStatus" = 'pending', "apiApplicationReason" = $2, "updatedAt" = now()
WHERE id = $1;

-- name: GetUserApiAccessStatus :one
SELECT "apiAccessStatus" FROM "User" WHERE id = $1;

-- name: GetUserApiGrants :one
SELECT "apiGrants" FROM "User" WHERE id = $1;

-- name: InsertApiKey :exec
INSERT INTO "ApiKey" (id, name, "keyPrefix", "keyHash", scopes, "userId", "createdByUserId")
VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $5);

-- name: ListApiKeys :many
SELECT id, name, "keyPrefix", scopes, "createdAt", "lastUsedAt"
FROM "ApiKey"
WHERE "userId" = $1
ORDER BY "createdAt" DESC;

-- name: DeleteApiKey :exec
DELETE FROM "ApiKey" WHERE id = $1 AND "userId" = $2;

-- name: UpdateApiKeySecret :execrows
UPDATE "ApiKey"
SET "keyHash" = $2, "keyPrefix" = $3
WHERE id = $1 AND "userId" = $4;

-- name: CompleteOnboardingUser :exec
UPDATE "User"
SET role = $2, "hasCompletedOnboarding" = true, name = $3, "updatedAt" = now()
WHERE id = $1;

-- name: CreatePersonalPublisher :one
INSERT INTO "Publisher" (id, type, name, slug, "subdomain", "heroText", "layoutStyle",
                           "logoUrl", "isCertified", "updatedAt")
VALUES (gen_random_uuid()::text, 'PERSONAL', $1, $2, $3, $4, $5, $6, $7, now())
RETURNING id;

-- name: UpdatePersonalPublisher :exec
UPDATE "Publisher"
SET name = $2, "subdomain" = $3, "heroText" = $4, "layoutStyle" = $5, "updatedAt" = now()
WHERE id = $1;

-- name: LinkUserPublisher :exec
UPDATE "User" SET "publisherId" = $2, "updatedAt" = now() WHERE id = $1;

-- Page settings créateur (parité prisma.publication.findUnique include dans
-- apps/studio/src/app/(creator)/settings/page.tsx).

-- name: GetPublisherForSettings :one
SELECT p.id, p.name, p.slug, p."subdomain", p."customDomain", p."heroText",
       p."accentColor", p."fontFamily", p."themeMode", p."layoutStyle",
       p."logoUrl", p."headerImageUrl", p."footerText", p."seoTitle",
       p."seoDescription", p."allowIndexing", p."supportUrl", p.type, p."umamiWebsiteId",
       p."siteOptions",
       COALESCE(u.id::text, '')::text AS owner_id, u.email AS owner_email, u.username AS owner_username,
       u."advancedSettingsMode" AS owner_advanced_settings_mode
FROM "Publisher" p
LEFT JOIN "User" u ON u."publisherId" = p.id
WHERE p.id = $1;

-- name: ListNavigationForPublisher :many
SELECT id, label, url, "order", "isExternal"
FROM "NavigationItem"
WHERE "publisherId" = $1
ORDER BY "order" ASC;

-- name: ListSocialLinksForPublisher :many
SELECT id, platform, url, "order"
FROM "SocialLink"
WHERE "publisherId" = $1
ORDER BY "order" ASC;

-- name: ListArticlesForSettings :many
SELECT id, title, slug, content, published, "isPremium", "categoryId", "seoTitle",
       "seoDescription", "createdAt"
FROM "Article"
WHERE "publisherId" = $1
ORDER BY "createdAt" DESC;

-- name: ListCategoriesForPublisher :many
SELECT id, name, slug, description, "parentId"
FROM "Category"
WHERE "publisherId" = $1
ORDER BY name ASC;

-- =====================================================================
-- ✅ Réglages email transactionnels par publication (double opt-in,
--    bienvenue) — personnalisation + délivrabilité.
-- =====================================================================

-- name: UpdatePublisherEmailSettings :exec
UPDATE "Publisher"
SET "emailSettings" = sqlc.arg(email_settings)::text::jsonb, "updatedAt" = now()
WHERE id = sqlc.arg(publisher_id);

-- name: CheckSubdomainExistsOther :one
SELECT EXISTS(SELECT 1 FROM "Publisher" WHERE "subdomain" = $1 AND id != $2) AS exists;

-- name: GetPublisherEmailDefaults :one
-- Identité par défaut de la publication (pré-remplissage du formulaire
-- email du studio) + réglages email stockés.
SELECT p.name, p."accentColor", p."logoUrl", p."emailSettings"
FROM "Publisher" p
WHERE p.id = $1;

-- name: GetSubscriberEmailDefaults :one
-- Identité d'une publication pour la prévisualisation des emails
-- transactionnels (POST /v1/settings/email/preview) : mêmes colonnes que
-- GetSubscriberEmailContext (newsletter.sql) sans ligne Subscriber — la
-- prévisualisation ne suppose aucun abonné réel.
SELECT p.name AS publisher_name,
       p.subdomain,
       p."customDomain" AS custom_domain,
       p."accentColor" AS accent_color,
       p."logoUrl" AS logo_url,
       p."emailSettings"
FROM "Publisher" p
WHERE p.id = $1;

-- name: GetPublisherForEmailTest :one
-- Identité complète de la publication pour l'envoi d'un email de test
-- (POST /v1/settings/email/test) : mêmes colonnes que
-- GetSubscriberEmailDefaults + réglages stockés rendus par le moteur.
SELECT p.name AS publisher_name,
       p.subdomain,
       p."customDomain" AS custom_domain,
       p."accentColor" AS accent_color,
       p."logoUrl" AS logo_url,
       p."emailSettings"
FROM "Publisher" p
WHERE p.id = $1;

-- name: SetPublisherDownloadDefault :one
-- Défaut de téléchargement des NOUVEAUX articles (l'auteur ajuste ensuite
-- par article). Réservé au propriétaire/membre via authorizeSettings.
UPDATE "Publisher"
SET "allowDownloadDefault" = $2, "updatedAt" = now()
WHERE id = $1
RETURNING "allowDownloadDefault";
