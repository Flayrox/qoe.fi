-- =====================================================================
-- 🤝 Console admin : quorum N3 — demande et seconde validation (plan, Phase 8)
-- =====================================================================
-- `DoubleApproval` est modélisé dans internal/authz depuis le début (actions
-- `legal_publish`, `staff_high_impact`), et le garde sait exiger un acte nommé
-- sur une cible précise (`WithApprovalAct`, `WithApprovalTargetParam`). Ce qui
-- manquait, c'est de QUOI l'exiger : une demande portée par la console, et une
-- seconde personne autorisée pour l'approuver.
--
-- Trois choix à ne pas perdre de vue :
--   - la demande nomme l'ACTE et sa CIBLE (une approbation pour la version A ne
--     doit pas ouvrir la version B) ;
--   - l'approbateur est une AUTRE personne : l'auto-validation est refusée par
--     le service, sinon le quorum ne serait qu'un clic de plus ;
--   - une approbation EXPIRE (72 h). Elle vaut pour un acte, pas pour toujours.
--     `consumed` marque une approbation déjà exercée : elle ne se rejoue pas.
-- =====================================================================

-- +goose Up

CREATE TABLE IF NOT EXISTS "AdminApproval" (
    "id"          TEXT NOT NULL,
    -- Action du noyau (internal/authz) : 'legal_publish', 'staff_high_impact'…
    "act"         TEXT NOT NULL,
    -- Cible de l'acte (identifiant de version, de lot…) ; vide si l'acte n'a
    -- pas de cible.
    "target"      TEXT NOT NULL DEFAULT '',
    -- Capacité que le DEMANDEUR doit détenir pour cet acte (et l'approbateur
    -- pour valider) : la double validation ne remplace pas le droit.
    "capability"  TEXT NOT NULL,
    "requestedBy" UUID NOT NULL,
    "reason"      TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'pending',
    "decidedBy"   UUID,
    "decidedAt"   TIMESTAMP(3),
    "note"        TEXT,
    "expiresAt"   TIMESTAMP(3) NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminApproval_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AdminApproval_status_check"
        CHECK ("status" IN ('pending', 'approved', 'rejected', 'consumed')),
    -- Un acte irréversible se valide à deux : une raison vide ne dit rien.
    CONSTRAINT "AdminApproval_reason_check" CHECK (length(btrim("reason")) >= 5),
    -- L'approbateur est une seconde personne.
    CONSTRAINT "AdminApproval_decider_check" CHECK ("decidedBy" IS NULL OR "decidedBy" <> "requestedBy"),
    CONSTRAINT "AdminApproval_expiry_check" CHECK ("expiresAt" > "createdAt")
);

-- Lecture du garde : « cette personne a-t-elle une approbation valide pour cet
-- acte et cette cible ? » — chemin chaud, index sur les trois colonnes de la
-- question.
CREATE INDEX IF NOT EXISTS "AdminApproval_lookup_idx"
    ON "AdminApproval" ("requestedBy", "act", "target", "status");

-- File d'attente de l'écran : ce qui attend une seconde validation.
CREATE INDEX IF NOT EXISTS "AdminApproval_pending_idx"
    ON "AdminApproval" ("status", "expiresAt");

-- +goose Down

DROP TABLE IF EXISTS "AdminApproval";
