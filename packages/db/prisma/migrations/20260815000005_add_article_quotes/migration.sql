-- Store article quotes independently from post text so the feed can render
-- the excerpt as a highlighted passage without displaying the source URL.
ALTER TABLE "Post" ADD COLUMN "quotedArticleId" TEXT;
ALTER TABLE "Post" ADD COLUMN "quotedExcerpt" TEXT;

CREATE INDEX "Post_quotedArticleId_idx" ON "Post"("quotedArticleId");

ALTER TABLE "Post"
  ADD CONSTRAINT "Post_quotedArticleId_fkey"
  FOREIGN KEY ("quotedArticleId") REFERENCES "Article"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
