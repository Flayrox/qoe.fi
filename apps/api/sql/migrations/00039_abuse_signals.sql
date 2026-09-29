-- =====================================================================
-- 🛡️ Anti-abus : signaux et décisions de risque (fiche 06 §8-§9)
-- =====================================================================
-- Deux constats avant cette migration :
--   1. Les signalements (`ModerationReport`) existent mais on ne voit pas les
--      campagnes coordonnées : 100 signalements synchronisés contre la même
--      cible ne valent pas preuve (fiche 06 §8 l'interdit comme sanction
--      automatique), mais doivent déclencher une revue priorisée selon le
--      risque réel, pas selon le bruit.
--   2. Les rafales d'inscriptions (fermes de comptes) ne laissent aucune
--      trace exploitable : le rate-limit Redis est volatil et ne distingue
--      pas une vague légitime d'une attaque contre une publication.
--
-- `AbuseSignal` enregistre des faits (jamais des verdicts) avec échéance de
-- rétention ; `RiskDecision` persiste chaque décision du noyau (politique,
-- version, codes de raison, auteur auto/humain, expiration, recours). Un
-- signal faible ne punit jamais : la décision la plus basse est l'observation
-- journalisée. Les seuils exacts restent côté serveur (pas d'aide à
-- l'attaquant pour calibrer sous le radar).
--
-- +goose Up
-- +goose StatementBegin
-- Un signal = un fait observé (inscription, signalement, demande...), pas un
-- verdict. `confidence` (0-100) dit ce que vaut la source, pas si la cible
-- est coupable. `expiresAt` borne la rétention (minimisation fiche 06 §9 :
-- pas de fichier comportemental perpétuel).
CREATE TABLE IF NOT EXISTS "AbuseSignal" (
    "id"           TEXT NOT NULL,
    "type"         TEXT NOT NULL,
    "subjectType"  TEXT NOT NULL,
    "subjectId"    TEXT NOT NULL,
    "source"       TEXT NOT NULL,
    "confidence"   SMALLINT NOT NULL DEFAULT 50,
    "ruleVersion"  TEXT NOT NULL DEFAULT 'v1',
    "observedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt"    TIMESTAMP(3) NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AbuseSignal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AbuseSignal_confidence_check" CHECK ("confidence" BETWEEN 0 AND 100)
);

-- Comptage des rafales : (type, sujet, récence). Index couvrant la requête
-- du noyau « combien de signaux de ce type sur ce sujet depuis X ».
CREATE INDEX IF NOT EXISTS "AbuseSignal_burst_idx"
    ON "AbuseSignal"("type", "subjectType", "subjectId", "observedAt" DESC);
-- Purge de rétention : les signaux expirés sont supprimables par lot.
CREATE INDEX IF NOT EXISTS "AbuseSignal_expiry_idx"
    ON "AbuseSignal"("expiresAt");
-- +goose StatementEnd

-- +goose StatementBegin
-- Une décision = un verdict traçable du noyau (ou d'un humain qui le
-- reprend). `result` reprend le vocabulaire fermé de la fiche (allow, slow,
-- challenge, needs_review, limit_distribution, pause_sending, suspend) ;
-- `reasonCodes` (tableau de codes stables) explique SANS exposer les seuils.
-- `decidedBy` distingue l'automate de l'humain ; `appealRef` pointera vers le
-- futur système de recours (fiche 06 §8) — nullable en attendant.
CREATE TABLE IF NOT EXISTS "RiskDecision" (
    "id"          TEXT NOT NULL,
    "policy"      TEXT NOT NULL,
    "version"     TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId"   TEXT NOT NULL,
    "result"      TEXT NOT NULL,
    "reasonCodes" TEXT[] NOT NULL DEFAULT '{}',
    "decidedBy"   TEXT NOT NULL DEFAULT 'auto',
    "deciderId"   TEXT,
    "expiresAt"   TIMESTAMP(3),
    "appealRef"   TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskDecision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RiskDecision_result_check" CHECK ("result" IN (
        'allow', 'slow', 'challenge', 'needs_review',
        'limit_distribution', 'pause_sending', 'suspend'
    )),
    CONSTRAINT "RiskDecision_decidedby_check" CHECK ("decidedBy" IN ('auto', 'human'))
);

-- Dernière décision par sujet : la revue et le support lisent l'état courant
-- sans balayer l'historique.
CREATE INDEX IF NOT EXISTS "RiskDecision_subject_idx"
    ON "RiskDecision"("subjectType", "subjectId", "createdAt" DESC);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS "RiskDecision";
DROP TABLE IF EXISTS "AbuseSignal";
-- +goose StatementEnd
