-- =====================================================================
-- 🔗 Slugs par auteur pour les articles multi-signatures
-- =====================================================================
-- Un article co-écrit partage le même ID, mais chaque auteur peut
-- personnaliser SON URL (slug). La résolution publique accepte le slug
-- principal ET tous les variants ; l'API créateur expose le slug
-- effectif de l'auteur courant et permet de l'éditer.
-- =====================================================================

-- +goose Up
CREATE TABLE "ArticleSlug" (
    "id"          TEXT NOT NULL,
    "articleId"   TEXT NOT NULL,
    "ownerUserId" UUID NOT NULL,
    "slug"        TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleSlug_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ArticleSlug_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT "ArticleSlug_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    -- Une URL ne pointe que vers un seul endroit.
    CONSTRAINT "ArticleSlug_slug_key" UNIQUE ("slug"),
    -- Un auteur n'a qu'un variant par article.
    CONSTRAINT "ArticleSlug_article_owner_key" UNIQUE ("articleId", "ownerUserId")
);

CREATE INDEX "ArticleSlug_slug_idx" ON "ArticleSlug" ("slug");

-- +goose Down
DROP TABLE "ArticleSlug";
