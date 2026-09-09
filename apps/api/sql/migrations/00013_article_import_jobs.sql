-- =====================================================================
-- 📦 Import bulk d'articles : jobs asynq + rapport d'erreurs
-- =====================================================================

-- +goose Up

CREATE TABLE "ArticleImportJob" (
    "id"            TEXT NOT NULL,
    "userId"        UUID NOT NULL,
    "publicationId" TEXT NOT NULL,
    "status"        TEXT NOT NULL DEFAULT 'PENDING',
    "total"         INTEGER NOT NULL DEFAULT 0,
    "imported"      INTEGER NOT NULL DEFAULT 0,
    "duplicates"    INTEGER NOT NULL DEFAULT 0,
    "errors"        JSONB NOT NULL DEFAULT '[]',
    "articles"      JSONB NOT NULL DEFAULT '[]',
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleImportJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ArticleImportJob_userId_idx" ON "ArticleImportJob"("userId");
CREATE INDEX "ArticleImportJob_publicationId_idx" ON "ArticleImportJob"("publicationId");

ALTER TABLE "ArticleImportJob" ADD CONSTRAINT "ArticleImportJob_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- +goose Down

DROP TABLE IF EXISTS "ArticleImportJob";