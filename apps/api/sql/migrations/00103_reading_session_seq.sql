-- +goose Up
-- Ordre total des sessions de lecture : "createdAt" est un TIMESTAMP(3), donc
-- deux sessions insérées dans la même milliseconde n'avaient aucun ordre
-- défini. L'historique de lecture ("la plus récente d'abord", dédup par
-- article) pouvait donc changer d'un appel à l'autre. "seq" donne l'ordre
-- d'insertion réel, indépendant de l'horloge.
ALTER TABLE "ReadingSession" ADD COLUMN "seq" BIGSERIAL;
CREATE INDEX "ReadingSession_userId_seq_idx" ON "ReadingSession"("userId", "seq" DESC);

-- +goose Down
DROP INDEX IF EXISTS "ReadingSession_userId_seq_idx";
ALTER TABLE "ReadingSession" DROP COLUMN IF EXISTS "seq";
