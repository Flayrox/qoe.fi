-- Import bulk d'articles — jobs asynq + rapports d'erreurs.

-- name: InsertArticleImportJob :one
INSERT INTO "ArticleImportJob" (id, "userId", "publicationId", total, articles)
VALUES (gen_random_uuid()::text, $1, $2, $3, $4)
RETURNING id;

-- name: GetArticleImportJob :one
SELECT id, "userId"::text, "publicationId", status, total, imported, duplicates,
       errors, "createdAt", "updatedAt"
FROM "ArticleImportJob"
WHERE id = $1 AND "userId" = $2;

-- name: GetArticleImportJobByID :one
SELECT id, "userId"::text, "publicationId", status, total, imported, duplicates,
       errors, articles, "createdAt", "updatedAt"
FROM "ArticleImportJob"
WHERE id = $1;

-- name: MarkArticleImportJobRunning :exec
UPDATE "ArticleImportJob"
SET status = 'RUNNING', "updatedAt" = now()
WHERE id = $1;

-- name: FinishArticleImportJob :exec
UPDATE "ArticleImportJob"
SET status = 'DONE', imported = $2, duplicates = $3, errors = $4, "updatedAt" = now()
WHERE id = $1;

-- name: FailArticleImportJob :exec
UPDATE "ArticleImportJob"
SET status = 'FAILED', "updatedAt" = now()
WHERE id = $1;

-- name: ListArticleImportJobs :many
SELECT id, "userId"::text, "publicationId", status, total, imported, duplicates,
       errors, "createdAt", "updatedAt"
FROM "ArticleImportJob"
WHERE "userId" = $1
ORDER BY "createdAt" DESC
LIMIT $2;