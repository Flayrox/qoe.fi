-- Catégories d'articles (éditeur dashboard).

-- name: GetCategoryByID :one
SELECT id, name, slug, description, "publicationId", "parentId", "isDefault"
FROM "Category"
WHERE id = $1;

-- name: EnsureDefaultCategory :one
-- Crée (ou récupère) la catégorie « Non classé » d'une publication.
-- Idempotent grâce à l'index unique partiel sur ("publicationId") WHERE "isDefault".
INSERT INTO "Category" (id, name, slug, description, "publicationId", "parentId", "isDefault")
VALUES (gen_random_uuid()::text, 'Non classé', 'uncategorized', NULL, $1, NULL, true)
ON CONFLICT ("publicationId") WHERE "isDefault" DO UPDATE SET "isDefault" = EXCLUDED."isDefault"
RETURNING id, name, slug, description, "publicationId", "parentId", "isDefault";

-- name: CheckCategorySlugExists :one
SELECT EXISTS(
    SELECT 1 FROM "Category"
    WHERE "publicationId" = $1 AND slug = $2 AND id <> $3
) AS exists;

-- name: CreateCategory :one
INSERT INTO "Category" (id, name, slug, description, "publicationId", "parentId")
VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5)
RETURNING id, name, slug, description, "publicationId", "parentId", "isDefault";

-- name: UpdateCategory :exec
UPDATE "Category"
SET name = $2, slug = $3, description = $4, "parentId" = $5
WHERE id = $1;

-- name: DeleteCategory :exec
DELETE FROM "Category" WHERE id = $1 AND "isDefault" = false;

-- name: CheckArticleSlugExists :one
SELECT EXISTS(
    SELECT 1 FROM "Article"
    WHERE "publicationId" = $1 AND slug = $2 AND id <> $3
) AS exists;
