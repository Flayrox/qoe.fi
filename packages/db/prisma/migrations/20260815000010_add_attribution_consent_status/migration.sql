ALTER TABLE "ArticleAttribution"
  ADD COLUMN "consentStatus" TEXT NOT NULL DEFAULT 'ACCEPTED',
  ADD COLUMN "consentUpdatedAt" TIMESTAMP(3);

CREATE INDEX "ArticleAttribution_articleId_consentStatus_isVisible_idx"
  ON "ArticleAttribution"("articleId", "consentStatus", "isVisible");
