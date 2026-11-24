-- +goose Up
-- Ordre total des verdicts (L46) : `createdAt` (TIMESTAMP(3)) ne départage pas
-- deux verdicts de la même milliseconde ; « le dernier verdict » devenait un
-- choix d'identifiant. `seq` est l'ordre réel d'insertion, monotone et unique :
-- il définit sans ambiguïté le verdict le plus récent (recours et revue).
ALTER TABLE "RiskDecision" ADD COLUMN IF NOT EXISTS "seq" BIGSERIAL NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "RiskDecision_seq_key" ON "RiskDecision" ("seq");
CREATE INDEX IF NOT EXISTS "RiskDecision_subject_seq_idx" ON "RiskDecision" ("subjectType", "subjectId", "seq" DESC);

-- +goose Down
DROP INDEX IF EXISTS "RiskDecision_subject_seq_idx";
DROP INDEX IF EXISTS "RiskDecision_seq_key";
ALTER TABLE "RiskDecision" DROP COLUMN IF EXISTS "seq";
