-- +goose Up
ALTER TABLE "Article" ADD COLUMN IF NOT EXISTS "showOnPersonalProfile" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ArticleAttribution" ADD COLUMN IF NOT EXISTS "categoryId" TEXT REFERENCES "Category"(id) ON DELETE SET NULL;

-- +goose Down
ALTER TABLE "ArticleAttribution" DROP COLUMN IF EXISTS "categoryId";
ALTER TABLE "Article" DROP COLUMN IF EXISTS "showOnPersonalProfile";
