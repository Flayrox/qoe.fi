-- OAuth 2.1 / OIDC — clients, codes, tokens, consentement, quotas.

-- name: GetOAuthClientByClientId :one
SELECT id, "clientId", "clientSecretHash", name, description, "logoUrl",
       "homepageUrl", "redirectUris", scopes, "clientType"::text, status::text,
       "publicationId", "ownerUserId", "createdAt", "updatedAt"
FROM "OAuthClient"
WHERE "clientId" = $1;

-- name: GetOAuthClientByID :one
SELECT id, "clientId", "clientSecretHash", name, description, "logoUrl",
       "homepageUrl", "redirectUris", scopes, "clientType"::text, status::text,
       "publicationId", "ownerUserId", "createdAt", "updatedAt"
FROM "OAuthClient"
WHERE id = $1;

-- name: ListOAuthClientsByOwner :many
SELECT id, "clientId", "clientSecretHash", name, description, "logoUrl",
       "homepageUrl", "redirectUris", scopes, "clientType"::text, status::text,
       "publicationId", "ownerUserId", "createdAt", "updatedAt"
FROM "OAuthClient"
WHERE "ownerUserId" = $1
ORDER BY "createdAt" DESC;

-- name: CountOAuthClientsByOwner :one
SELECT COUNT(*) AS count FROM "OAuthClient" WHERE "ownerUserId" = $1;

-- name: InsertOAuthClient :exec
INSERT INTO "OAuthClient" (id, "clientId", "clientSecretHash", name, description,
                           "logoUrl", "homepageUrl", "redirectUris", scopes,
                           "clientType", status, "publicationId", "ownerUserId",
                           "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8,
                           $9::"OAuthClientType", $10::"OAuthClientStatus", $11, $12, now(), now());

-- name: UpdateOAuthClientStatus :exec
UPDATE "OAuthClient" SET status = $2::"OAuthClientStatus", "updatedAt" = now() WHERE id = $1;

-- name: UpdateOAuthClientSecret :exec
UPDATE "OAuthClient" SET "clientSecretHash" = $2, "updatedAt" = now() WHERE id = $1;

-- name: DeleteOAuthClient :exec
DELETE FROM "OAuthClient" WHERE id = $1 AND "ownerUserId" = $2;

-- name: InsertOAuthAuthorizationCode :exec
INSERT INTO "OAuthAuthorizationCode" (id, "codeHash", "clientId", "userId",
                                      "redirectUri", scopes, "codeChallenge",
                                      "codeChallengeMethod", nonce, "expiresAt", "usedAt", "createdAt")
VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, now());

-- name: GetOAuthAuthorizationCodeByHash :one
SELECT id, "codeHash", "clientId", "userId", "redirectUri", scopes,
       "codeChallenge", "codeChallengeMethod", nonce, "expiresAt", "usedAt", "createdAt"
FROM "OAuthAuthorizationCode"
WHERE "codeHash" = $1;

-- name: ConsumeOAuthAuthorizationCode :exec
UPDATE "OAuthAuthorizationCode" SET "usedAt" = now() WHERE id = $1;

-- name: InsertOAuthToken :exec
INSERT INTO "OAuthToken" (id, "clientId", "userId", "accessTokenHash",
                          "refreshTokenHash", scopes, "accessTokenExpiresAt",
                          "refreshTokenExpiresAt", "revokedAt", "lastUsedAt", "createdAt")
VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, $7, NULL, NULL, now());

-- name: GetOAuthTokenByAccessHash :one
SELECT t.id, t."clientId", t."userId", t."accessTokenHash", t."refreshTokenHash", t.scopes,
       t."accessTokenExpiresAt", t."refreshTokenExpiresAt", t."revokedAt", t."lastUsedAt", t."createdAt",
       c."clientId" AS "publicClientId"
FROM "OAuthToken" t
JOIN "OAuthClient" c ON c.id = t."clientId"
WHERE t."accessTokenHash" = $1;

-- name: GetOAuthTokenByRefreshHash :one
SELECT t.id, t."clientId", t."userId", t."accessTokenHash", t."refreshTokenHash", t.scopes,
       t."accessTokenExpiresAt", t."refreshTokenExpiresAt", t."revokedAt", t."lastUsedAt", t."createdAt",
       c."clientId" AS "publicClientId"
FROM "OAuthToken" t
JOIN "OAuthClient" c ON c.id = t."clientId"
WHERE t."refreshTokenHash" = $1;

-- name: RevokeOAuthTokenByRefreshHash :exec
UPDATE "OAuthToken" SET "revokedAt" = now() WHERE "refreshTokenHash" = $1;

-- name: RevokeOAuthTokenByAccessHash :exec
UPDATE "OAuthToken" SET "revokedAt" = now() WHERE "accessTokenHash" = $1;

-- name: RevokeOAuthTokensByUserClient :exec
UPDATE "OAuthToken" SET "revokedAt" = now()
WHERE "userId" = $1 AND "clientId" = $2 AND "revokedAt" IS NULL;

-- name: UpdateOAuthTokenLastUsed :exec
UPDATE "OAuthToken" SET "lastUsedAt" = now() WHERE id = $1;

-- name: CountActiveOAuthTokens :one
SELECT COUNT(*) AS count FROM "OAuthToken"
WHERE "userId" = $1 AND "revokedAt" IS NULL AND "accessTokenExpiresAt" > now();

-- name: UpsertOAuthConsent :exec
INSERT INTO "OAuthConsent" (id, "clientId", "userId", scopes, "grantedAt", "updatedAt")
VALUES (gen_random_uuid()::text, $1, $2, $3, now(), now())
ON CONFLICT ("clientId", "userId")
DO UPDATE SET scopes = EXCLUDED.scopes, "updatedAt" = now();

-- name: GetOAuthConsent :one
SELECT id, "clientId", "userId", scopes, "grantedAt", "updatedAt"
FROM "OAuthConsent"
WHERE "clientId" = $1 AND "userId" = $2;

-- name: ListOAuthConfig :many
SELECT key, value FROM "SystemConfig" WHERE key LIKE 'OAUTH_%';

-- name: GetOAuthUserClaims :one
SELECT id::text AS id, email, username, name, "logoUrl", pronouns, "isCertified", role
FROM "User"
WHERE id = $1;

-- name: DeleteExpiredOAuthArtifacts :exec
DELETE FROM "OAuthAuthorizationCode"
WHERE "expiresAt" < now() - interval '1 day' OR "usedAt" IS NOT NULL;

-- name: DeleteRevokedOAuthTokens :exec
DELETE FROM "OAuthToken"
WHERE "revokedAt" IS NOT NULL AND "revokedAt" < now() - interval '7 days';
