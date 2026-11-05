-- Distribution d'article par email façon Substack : traçabilité, idempotence et re-send.
--
-- +goose Up
ALTER TABLE "Article"
  ADD COLUMN IF NOT EXISTS "emailStatus" TEXT NOT NULL DEFAULT 'NOT_SENT' CHECK ("emailStatus" IN ('NOT_SENT', 'QUEUED', 'SENDING', 'SENT', 'FAILED')),
  ADD COLUMN IF NOT EXISTS "emailSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "emailSubject" TEXT,
  ADD COLUMN IF NOT EXISTS "emailPreviewText" TEXT,
  ADD COLUMN IF NOT EXISTS "emailSentCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "emailFailedCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "emailTotalRecipients" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "emailResendCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "Article_publicationId_emailSentAt_idx" 
  ON "Article"("publicationId", "emailSentAt" DESC NULLS LAST);

ALTER TABLE "ArticleReleaseDelivery"
  ADD COLUMN IF NOT EXISTS "deliveryType" TEXT NOT NULL DEFAULT 'INITIAL';

DROP INDEX IF EXISTS "ArticleReleaseDelivery_articleId_email_key";
CREATE UNIQUE INDEX IF NOT EXISTS "ArticleReleaseDelivery_article_email_delivery_key" 
  ON "ArticleReleaseDelivery"("articleId", "email", "deliveryType");

-- +goose Down
DROP INDEX IF EXISTS "ArticleReleaseDelivery_article_email_delivery_key";
CREATE UNIQUE INDEX IF NOT EXISTS "ArticleReleaseDelivery_articleId_email_key" 
  ON "ArticleReleaseDelivery"("articleId", "email");

ALTER TABLE "ArticleReleaseDelivery"
  DROP COLUMN IF EXISTS "deliveryType";

DROP INDEX IF EXISTS "Article_publicationId_emailSentAt_idx";

ALTER TABLE "Article"
  DROP COLUMN IF EXISTS "emailStatus",
  DROP COLUMN IF EXISTS "emailSentAt",
  DROP COLUMN IF EXISTS "emailSubject",
  DROP COLUMN IF EXISTS "emailPreviewText",
  DROP COLUMN IF EXISTS "emailSentCount",
  DROP COLUMN IF EXISTS "emailFailedCount",
  DROP COLUMN IF EXISTS "emailTotalRecipients",
  DROP COLUMN IF EXISTS "emailResendCount";
