-- Catégories d'articles (éditeur dashboard).

-- name: GetCategoryByID :one
SELECT id, name, slug, description, "publicationId", "parentId"
FROM "Category"
WHERE id = $1;

-- name: CheckCategorySlugExists :one
SELECT EXISTS(
    SELECT 1 FROM "Category"
    WHERE "publicationId" = $1 AND slug = $2 AND id <> $3
) AS exists;

-- name: CreateCategory :one
INSERT INTO "Category" (id, name, slug, description, "publicationId", "parentId")
VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5)
RETURNING id, name, slug, description, "publicationId", "parentId";

-- name: UpdateCategory :exec
UPDATE "Category"
SET name = $2, slug = $3, description = $4
WHERE id = $1;

-- name: DeleteCategory :exec
DELETE FROM "Category" WHERE id = $1;

-- name: CheckArticleSlugExists :one
SELECT EXISTS(
    SELECT 1 FROM "Article"
    WHERE "publicationId" = $1 AND slug = $2 AND id <> $3
) AS exists;
