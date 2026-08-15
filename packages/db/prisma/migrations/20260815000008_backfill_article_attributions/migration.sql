INSERT INTO "ArticleAttribution" ("id", "articleId", "userId", "role", "order", "isVisible", "createdAt", "updatedAt")
SELECT
  'legacy_' || a."id",
  a."id",
  a."authorId",
  'PRIMARY_AUTHOR',
  0,
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Article" a
WHERE NOT EXISTS (
  SELECT 1
  FROM "ArticleAttribution" attribution
  WHERE attribution."articleId" = a."id"
    AND attribution."userId" = a."authorId"
);
