-- +goose Up
-- +goose StatementBegin
ALTER TABLE "Subscriber" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'fr';
ALTER TABLE "Publication" ADD COLUMN "emailSettings" JSONB NOT NULL DEFAULT '{}'::jsonb;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE "Publication" DROP COLUMN IF EXISTS "emailSettings";
ALTER TABLE "Subscriber" DROP COLUMN IF EXISTS "locale";
-- +goose StatementEnd
