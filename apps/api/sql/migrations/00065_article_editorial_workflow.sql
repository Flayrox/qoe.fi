-- Workflow éditorial et relecture média :
-- 1. Types de notifications d'approbation et de rejet de soumission
-- 2. Métadonnées JSONB sur les notifications (motif de rejet, contexte)
-- 3. Journal d'audit éditorial ArticleReviewLog
--
-- ⚠️ Annotations goose obligatoires (cf. 00064) : sans elles, goose refusait
-- de parser la chaîne et cette migration n'était jamais appliquée — la revue
-- média échouait donc en base sur une table inexistante.

-- +goose Up
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MEDIA_ARTICLE_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MEDIA_ARTICLE_REJECTED';

ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

CREATE TABLE IF NOT EXISTS "ArticleReviewLog" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "reviewerId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleReviewLog_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ArticleReviewLog_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ArticleReviewLog_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ArticleReviewLog_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ArticleReviewLog_action_check" CHECK ("action" IN ('SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN'))
);

CREATE INDEX IF NOT EXISTS "ArticleReviewLog_articleId_createdAt_idx"
    ON "ArticleReviewLog" ("articleId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ArticleReviewLog_publicationId_createdAt_idx"
    ON "ArticleReviewLog" ("publicationId", "createdAt" DESC);

-- +goose Down
DROP TABLE IF EXISTS "ArticleReviewLog";
ALTER TABLE "Notification" DROP COLUMN IF EXISTS "metadata";
-- Les valeurs ajoutées à un enum Postgres ne peuvent pas être retirées.
