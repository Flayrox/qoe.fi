-- name: UpsertArticleEmbedding :exec
-- Écrit le vecteur d'un article (généré par le worker jina-embeddings-v3).
UPDATE "Article" SET "embedding" = $2, "updatedAt" = now() WHERE id = $1;

-- name: UpsertUserEmbedding :exec
-- Écrit le vecteur d'un utilisateur/publication (profil).
UPDATE "User" SET "embedding" = $2 WHERE id = $1;

-- name: GetArticleEmbeddingText :one
-- Retourne le vecteur d'un article sous forme texte ('' si absent). Le scan
-- d'un type vector NULL n'est pas géré par pgvector-go → on cast en texte.
SELECT COALESCE("embedding"::text, '')::text AS embedding_text FROM "Article" WHERE id = $1;

-- name: FindSimilarArticles :many
-- Articles publiés classés par similarité cosinus avec un vecteur donné,
-- en excluant l'article source. Requête ANN via l'index HNSW.
SELECT a.id,
       a.title,
       a.slug,
       a."isPremium",
       a."readingTime",
       a."createdAt",
       a."publicationId",
       a."authorId",
       u.name          AS author_name,
       u.username      AS author_username,
       u."logoUrl"     AS author_logo,
       p.name          AS publication_name,
       p.subdomain     AS publication_subdomain,
       p."logoUrl"     AS publication_logo,
       (1 - (a."embedding" <=> $1::vector))::float8 AS score
FROM "Article" a
JOIN "User" u ON u.id = a."authorId"
JOIN "Publication" p ON p.id = a."publicationId"
WHERE a.published = true
  AND a."embedding" IS NOT NULL
  AND a.id <> $2
  AND u."isShadowbanned" = false
  AND u."isSuspended" = false
ORDER BY a."embedding" <=> $1::vector
LIMIT $3;

-- name: SearchSemanticArticles :many
-- Recherche sémantique plein corpus (ordre par similarité cosinus).
SELECT a.id,
       a.title,
       a.slug,
       a."isPremium",
       a."readingTime",
       a."createdAt",
       a."publicationId",
       a."authorId",
       u.name          AS author_name,
       u.username      AS author_username,
       u."logoUrl"     AS author_logo,
       p.name          AS publication_name,
       p.subdomain     AS publication_subdomain,
       p."logoUrl"     AS publication_logo,
       (1 - (a."embedding" <=> $1::vector))::float8 AS score
FROM "Article" a
JOIN "User" u ON u.id = a."authorId"
JOIN "Publication" p ON p.id = a."publicationId"
WHERE a.published = true
  AND a."embedding" IS NOT NULL
  AND u."isShadowbanned" = false
  AND u."isSuspended" = false
ORDER BY a."embedding" <=> $1::vector
LIMIT $2;
