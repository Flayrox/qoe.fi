-- name: GetArticleForSearch :one
SELECT id, title, content, slug, "authorId", "categoryId", published, "isPremium",
       "seoTitle", "seoDescription", "createdAt", "updatedAt"
FROM "Article"
WHERE id = $1;
