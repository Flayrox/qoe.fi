-- =====================================================================
-- 🔗 Historique des slugs pour redirections 301
-- =====================================================================
-- Quand un variant change, l'ancien slug est conservé pour rediriger
-- (SEO, liens externes). La résolution publique vérifie aussi cette table.

-- +goose Up
CREATE TABLE "ArticleSlugHistory" (
    "id"        TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "slug"      TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleSlugHistory_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ArticleSlugHistory_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT "ArticleSlugHistory_slug_key" UNIQUE ("slug")
);

CREATE INDEX "ArticleSlugHistory_slug_idx" ON "ArticleSlugHistory" ("slug");
CREATE INDEX "ArticleSlugHistory_articleId_idx" ON "ArticleSlugHistory" ("articleId");

-- +goose Down
DROP TABLE "ArticleSlugHistory";
