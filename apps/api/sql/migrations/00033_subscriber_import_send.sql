-- =====================================================================
-- 📨 Import d'abonnés — envoi encadré approved_direct (fiche 03 §7)
-- =====================================================================
-- Un lot `approved_direct` autorise une campagne initiale plafonnée vers des
-- contacts qui n'ont PAS cliqué individuellement. C'est l'opération la plus
-- dangereuse du plan : elle n'existe que parce que la quarantaine (00031), la
-- décision immuable et la reconfirmation (00032) existent déjà.
--
-- Invariants structurels :
--   • budget atomique : le plafond est consommé par UPDATE conditionnel
--     (`consumed + n <= cap`) en une seule requête — deux workers concurrents
--     ne dépassent jamais, même en course ;
--   • `confirmedAt` n'est jamais écrit par ce chemin : l'approbation staff est
--     une preuve **séparée** (lot + décision), jamais un clic. Seul le lien
--     « confirmer » de l'e-mail, cliqué par le destinataire, franchit
--     `confirmedAt` via le chemin normal ;
--   • une seule vague active par lot (unicité partielle), comme pour la
--     reconfirmation : pas de doubles envois concurrents ;
--   • suspension automatique sur seuils (rejets durs, plaintes) : les compteurs
--     vivent sur la vague, la décision de suspendre est un événement tracé.
--
-- +goose Up
-- +goose StatementBegin
-- Budget d'envoi d'un lot : plafond issu des `limits` de la décision
-- `approved_direct`, consommation strictement atomique.
CREATE TABLE "ImportSendBudget" (
    "id"            TEXT NOT NULL,
    "batchId"       TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    -- Décision `approved_direct` qui ouvre ce budget : traçabilité.
    "decisionId"    TEXT NOT NULL,
    "cap"           INTEGER NOT NULL,
    "consumed"      INTEGER NOT NULL DEFAULT 0,
    -- Version optimiste : toute consommation incrémente, ce qui rend les
    -- courses visibles au lieu de silencieuses.
    "version"       INTEGER NOT NULL DEFAULT 0,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportSendBudget_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ImportSendBudget_cap_check" CHECK ("cap" > 0),
    CONSTRAINT "ImportSendBudget_consumed_check" CHECK ("consumed" >= 0 AND "consumed" <= "cap")
);

-- Un seul budget ouvert par lot : un second `approved_direct` ne crée pas un
-- second compteur qui contournerait le premier.
CREATE UNIQUE INDEX "ImportSendBudget_batch_key"
    ON "ImportSendBudget"("batchId");
-- +goose StatementEnd

-- +goose StatementBegin
-- Vague d'envoi encadré : segment figé, curseur de reprise, compteurs de
-- qualité pour la suspension automatique.
CREATE TABLE "ImportSendWave" (
    "id"            TEXT NOT NULL,
    "batchId"       TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "decisionId"    TEXT NOT NULL,
    "budgetId"      TEXT NOT NULL,
    "status"        TEXT NOT NULL DEFAULT 'queued',
    -- Curseur de reprise (email, ordre alphabétique stable).
    "cursor"        TEXT,
    "sentCount"     INTEGER NOT NULL DEFAULT 0,
    "skippedCount"  INTEGER NOT NULL DEFAULT 0,
    "failedCount"   INTEGER NOT NULL DEFAULT 0,
    -- Compteurs de qualité : rejets durs, plaintes, désinscriptions issues de
    -- cette vague. Ils alimentent la suspension automatique, pas un score.
    "hardBounceCount"   INTEGER NOT NULL DEFAULT 0,
    "complaintCount"    INTEGER NOT NULL DEFAULT 0,
    "unsubscribeCount"  INTEGER NOT NULL DEFAULT 0,
    -- Seuils de suspension copiés à l'ouverture (décision ou défauts) : figés
    -- pour que la vague ne change pas de règles en cours de route.
    "maxHardBounceRate" REAL NOT NULL DEFAULT 0.10,
    "maxComplaints"     INTEGER NOT NULL DEFAULT 5,
    "maxFailedRate"     REAL NOT NULL DEFAULT 0.20,
    "minSample"         INTEGER NOT NULL DEFAULT 50,
    "completedAt"   TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportSendWave_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ImportSendWave_status_check" CHECK ("status" IN (
        'queued', 'sending', 'paused', 'completed', 'cancelled'
    ))
);

CREATE INDEX "ImportSendWave_batch_idx"
    ON "ImportSendWave"("batchId", "createdAt" DESC);
-- Une seule vague active par lot : pas de doubles envois concurrents.
CREATE UNIQUE INDEX "ImportSendWave_active_key"
    ON "ImportSendWave"("batchId")
    WHERE "status" IN ('queued', 'sending', 'paused');
-- +goose StatementEnd

-- +goose StatementBegin
-- Livraison d'envoi encadré : une adresse, un état. Séparée de
-- `NewsletterDelivery` (campagnes créateur normales) pour que les quotas,
-- les compteurs et les suspensions des listes fraîches ne se mélangent jamais
-- avec ceux des abonnés acquis et confirmés directement (fiche 03 §7).
CREATE TABLE "ImportSendDelivery" (
    "id"            TEXT NOT NULL,
    "waveId"        TEXT NOT NULL,
    "batchId"       TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "email"         TEXT NOT NULL,
    "status"        TEXT NOT NULL DEFAULT 'queued',
    "error"         TEXT,
    "sentAt"        TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportSendDelivery_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ImportSendDelivery_status_check" CHECK ("status" IN (
        'queued', 'sent', 'failed', 'skipped', 'suppressed'
    ))
);

-- Une adresse n'est visée qu'une fois par vague (rejeu idempotent).
CREATE UNIQUE INDEX "ImportSendDelivery_wave_email_key"
    ON "ImportSendDelivery"("waveId", "email");
CREATE INDEX "ImportSendDelivery_wave_status_idx"
    ON "ImportSendDelivery"("waveId", "status", "email");
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS "ImportSendDelivery";
DROP TABLE IF EXISTS "ImportSendWave";
DROP TABLE IF EXISTS "ImportSendBudget";
-- +goose StatementEnd
