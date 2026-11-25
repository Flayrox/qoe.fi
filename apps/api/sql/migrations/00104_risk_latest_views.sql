-- +goose Up
-- Autorité unique du « dernier verdict » : l'ordre est l'insertion ("seq"),
-- jamais createdAt (TIMESTAMP(3) + horloges locale/UTC). Toute lecture du
-- dernier verdict par sujet passe par ces vues, au lieu de recopier un
-- DISTINCT ON dans chaque appelant.
CREATE VIEW "LatestRiskDecision" AS
SELECT DISTINCT ON ("subjectType", "subjectId") *
FROM "RiskDecision"
ORDER BY "subjectType", "subjectId", "seq" DESC;

-- Dernier verdict BLOQUANT : un allow plus récent ne rouvre pas un dossier,
-- mais il ne doit pas masquer le dernier non-allow non plus. C'est la
-- définition de la file de revue, du recours et de la file admin.
CREATE VIEW "LatestNonAllowRiskDecision" AS
SELECT DISTINCT ON ("subjectType", "subjectId") *
FROM "RiskDecision"
WHERE "result" <> 'allow'
ORDER BY "subjectType", "subjectId", "seq" DESC;

-- +goose Down
DROP VIEW IF EXISTS "LatestNonAllowRiskDecision";
DROP VIEW IF EXISTS "LatestRiskDecision";
