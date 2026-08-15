CREATE TABLE "ArticleAttribution" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'CO_AUTHOR',
    "order" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArticleAttribution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ArticleAttribution_articleId_userId_key" ON "ArticleAttribution"("articleId", "userId");
CREATE INDEX "ArticleAttribution_articleId_order_idx" ON "ArticleAttribution"("articleId", "order");
CREATE INDEX "ArticleAttribution_userId_idx" ON "ArticleAttribution"("userId");

ALTER TABLE "ArticleAttribution" ADD CONSTRAINT "ArticleAttribution_articleId_fkey"
  FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ArticleAttribution" ADD CONSTRAINT "ArticleAttribution_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
