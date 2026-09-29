-- =====================================================================
-- 🛡️ Anti-abus : registre d'incidents (fiche 06 §9-§10)
-- =====================================================================
-- Quand une attaque est confirmée (ferme de comptes, raid de signalement,
-- vague d'inscriptions contre une publication), la réponse ne tient pas dans
-- un verdict par sujet : il faut un DOSSIER — portée, mesures temporaires
-- (coupe-feu engagé ? limitation ?), suivi coût/performance, communication.
-- `AntiAbuseIncident` est ce dossier, ouvert et tenu par le staff (jamais
-- par l'automate : qualifier une attaque est un jugement humain).
--
-- Statuts : open (attaque en cours) → contained (mesures actives, sous
-- contrôle) → resolved (terminée, bilan écrit) ; reopened rouvre sans
-- effacer l'historique (pas de UPDATE qui réécrit le passé : le statut
-- avance, les notes s'ajoutent). `measures` liste les actions prises en
-- texte libre horodaté par l'application (pas de JSONB opaque : lisible en
-- SQL, exportable tel quel pour la communication publique de l'incident —
-- fiche §10 : mesures temporaires, impacts connus, correction et recours).
--
-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS "AntiAbuseIncident" (
    "id"          TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "kind"        TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'open',
    "scope"       TEXT NOT NULL DEFAULT '',
    "impact"      TEXT NOT NULL DEFAULT '',
    "measures"    TEXT NOT NULL DEFAULT '',
    "openedBy"    TEXT NOT NULL,
    "resolvedBy"  TEXT,
    "resolvedAt"  TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AntiAbuseIncident_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AntiAbuseIncident_kind_check" CHECK ("kind" IN (
        'account_farm', 'report_raid', 'signup_flood', 'api_abuse',
        'impersonation', 'spam_wave', 'other'
    )),
    CONSTRAINT "AntiAbuseIncident_status_check" CHECK ("status" IN (
        'open', 'contained', 'resolved', 'reopened'
    )),
    CONSTRAINT "AntiAbuseIncident_title_check" CHECK (char_length("title") BETWEEN 5 AND 200)
);

-- File des incidents : ouverts d'abord, plus récents d'abord.
CREATE INDEX IF NOT EXISTS "AntiAbuseIncident_status_idx"
    ON "AntiAbuseIncident"("status", "createdAt" DESC);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS "AntiAbuseIncident";
-- +goose StatementEnd
