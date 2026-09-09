-- =====================================================================
-- 📬 ArticleReleaseDelivery : envois automatiques à la publication
-- d'un article (synchro release → email). Dédup par (article, email) :
-- unpublish → republish ne renvoie jamais deux fois le même email.
-- =====================================================================

-- +goose Up

CREATE TABLE IF NOT EXISTS "ArticleReleaseDelivery" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "subscriberId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "ArticleReleaseDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ArticleReleaseDelivery_articleId_email_key"
    ON "ArticleReleaseDelivery"("articleId", "email");

CREATE INDEX IF NOT EXISTS "ArticleReleaseDelivery_articleId_status_idx"
    ON "ArticleReleaseDelivery"("articleId", "status");

-- +goose Down
DROP TABLE IF EXISTS "ArticleReleaseDelivery";