-- +goose Up
-- Ordre total des messages (L46).
-- `createdAt` seul ne départage pas deux messages écrits dans la même
-- milliseconde (TIMESTAMP(3)) : la liste pouvait changer d'ordre d'une lecture
-- à l'autre. `seq` (BIGSERIAL) est monotone à l'insertion, unique, et sert de
-- tie-breaker ET de curseur de pagination : plus de doublon ni de trou entre
-- deux pages.
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "seq" BIGSERIAL NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Message_seq_key" ON "Message" ("seq");
CREATE INDEX IF NOT EXISTS "Message_conversationId_seq_idx" ON "Message" ("conversationId", "seq" DESC);

-- +goose Down
DROP INDEX IF EXISTS "Message_conversationId_seq_idx";
DROP INDEX IF EXISTS "Message_seq_key";
ALTER TABLE "Message" DROP COLUMN IF EXISTS "seq";
