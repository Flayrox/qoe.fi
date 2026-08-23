-- Analytics ReadingSession — migration Prisma → Go (sqlc + raw SQL fallback).
-- Remplace :
--   prisma.readingSession.groupBy { by: ['source'|'hostname'|'referrerUsername'|'articleId'] }
--   prisma.$queryRawUnsafe `SELECT to_char(date_trunc('day', "createdAt")...)`
--   prisma.readingSession.count
--   prisma.user.groupBy (demographie) — voir analytics_demographics.sql si besoin
--   prisma.article.findMany + attributions — voir ListAttributedArticleIDs ci-dessous

-- name: GroupReadingSessionsBySource :many
SELECT source AS key, COUNT(*)::int AS count
FROM "ReadingSession"
WHERE "articleId" = ANY($1::text[])
  AND ($2::timestamptz IS NULL OR "createdAt" >= $2)
GROUP BY source
ORDER BY count DESC;

-- name: GroupByHostname :many
SELECT hostname AS key, COUNT(*)::int AS count
FROM "ReadingSession"
WHERE "articleId" = ANY($1::text[])
  AND hostname IS NOT NULL
  AND ($2::timestamptz IS NULL OR "createdAt" >= $2)
GROUP BY hostname
ORDER BY count DESC;

-- name: GroupByReferrerUsername :many
SELECT "referrerUsername" AS key, COUNT(*)::int AS count
FROM "ReadingSession"
WHERE "articleId" = ANY($1::text[])
  AND "referrerUsername" IS NOT NULL
  AND ($2::timestamptz IS NULL OR "createdAt" >= $2)
GROUP BY "referrerUsername"
ORDER BY count DESC;

-- name: GetReadingSessionDailySeries :many
SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day, COUNT(*)::int AS cnt
FROM "ReadingSession"
WHERE "articleId" = ANY($1::text[])
  AND ($2::timestamptz IS NULL OR "createdAt" >= $2)
GROUP BY date_trunc('day', "createdAt")
ORDER BY day;

-- name: CountReadingSessionsByArticleId :one
SELECT COUNT(*)::int AS count
FROM "ReadingSession"
WHERE "articleId" = $1
  AND ($2::timestamptz IS NULL OR "createdAt" >= $2);

-- name: GroupReadingSessionsByArticleId :many
SELECT "articleId" AS article_id, COUNT(*)::int AS count
FROM "ReadingSession"
WHERE "articleId" = ANY($1::text[])
  AND ($2::timestamptz IS NULL OR "createdAt" >= $2)
GROUP BY "articleId"
ORDER BY count DESC;

-- name: ListAttributedArticleIDs :many
-- Articles attribués à un créateur : publication directe OU co-signés via ArticleAttribution ACCEPTED + visible.
-- Miroir de prisma.article.findMany { OR: [{publicationId}, {attributions: {some: {userId, consentStatus, isVisible}}}] } où published = true.
SELECT a.id
FROM "Article" a
WHERE a.published = true
  AND (
    a."publicationId" = $1
    OR EXISTS (
      SELECT 1 FROM "ArticleAttribution" aa
      WHERE aa."articleId" = a.id
        AND aa."userId" = $2
        AND aa."consentStatus" = 'ACCEPTED'
        AND aa."isVisible" = true
    )
  );

-- name: CountReadingSessionsByArticleIds :many
-- Variante batch pour provenance globale (tous les articleIds du créateur).
SELECT COUNT(*)::int AS count
FROM "ReadingSession"
WHERE "articleId" = ANY($1::text[])
  AND ($2::timestamptz IS NULL OR "createdAt" >= $2);

-- name: GroupUsersByGender :many
SELECT gender::text AS value, COUNT(*)::int AS count
FROM "User"
WHERE gender IS NOT NULL
  AND ($1::uuid[] IS NULL OR id = ANY($1::uuid[]))
GROUP BY gender
ORDER BY count DESC;

-- name: GroupUsersByAgeRange :many
SELECT "ageRange"::text AS value, COUNT(*)::int AS count
FROM "User"
WHERE "ageRange" IS NOT NULL
  AND ($1::uuid[] IS NULL OR id = ANY($1::uuid[]))
GROUP BY "ageRange"
ORDER BY count DESC;

-- name: GroupUsersByCountry :many
SELECT "countryCode" AS value, COUNT(*)::int AS count
FROM "User"
WHERE "countryCode" IS NOT NULL
  AND ($1::uuid[] IS NULL OR id = ANY($1::uuid[]))
GROUP BY "countryCode"
ORDER BY count DESC;

-- name: GroupUsersByLanguage :many
SELECT "languageCode" AS value, COUNT(*)::int AS count
FROM "User"
WHERE "languageCode" IS NOT NULL
  AND ($1::uuid[] IS NULL OR id = ANY($1::uuid[]))
GROUP BY "languageCode"
ORDER BY count DESC;
