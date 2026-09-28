-- =====================================================================
-- ✉️ Import d'abonnés — branche de reconfirmation individuelle (fiche 03)
-- =====================================================================
-- Un lot `approved_reconfirm` ne rend aucun contact destinataire : chaque
-- adresse doit confirmer elle-même, une par une. Cette migration porte les
-- demandes en attente et les vagues d'envoi plafonnées qui les portent.
--
-- Invariants structurels :
--   • le jeton est à usage unique et rattaché à (publication, email) : le lien
--     de confirmation existant (`/v1/newsletters/confirm`) vérifie déjà ce
--     triplet (email + publicationId + token, plus signature HMAC) et consomme
--     le jeton. Ici on ajoute l'unicité du jeton au niveau des demandes pour
--     qu'un même jeton ne serve jamais deux adresses ;
--   • `confirmedAt` ne peut être franchi que par le clic individuel : la vague
--     crée des abonnés **inactifs** (`receiveArticles = false`,
--     `confirmedAt NULL`) porteurs d'un token, jamais des destinataires ;
--   • une demande expirée ne confirme plus rien : la purge efface le token des
--     abonnés restés non confirmés au lieu de laisser un lien éternel.
--
-- +goose Up
-- +goose StatementBegin
CREATE TABLE "SubscriberImportReconfirmWave" (
    "id"            TEXT NOT NULL,
    "batchId"       TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    -- Décision `approved_reconfirm` qui autorise cette vague : traçabilité.
    "decisionId"    TEXT NOT NULL,
    "status"        TEXT NOT NULL DEFAULT 'queued',
    -- Plafond de la vague : jamais plus de `waveSize` demandes créées.
    "waveSize"      INTEGER NOT NULL,
    -- Curseur de progression (email de reprise, ordre alphabétique stable).
    "cursor"        TEXT,
    "sentCount"     INTEGER NOT NULL DEFAULT 0,
    "confirmedCount" INTEGER NOT NULL DEFAULT 0,
    "expiredCount"  INTEGER NOT NULL DEFAULT 0,
    "skippedCount"  INTEGER NOT NULL DEFAULT 0,
    "expiresAt"     TIMESTAMP(3),
    "completedAt"   TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriberImportReconfirmWave_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SubscriberImportReconfirmWave_status_check" CHECK ("status" IN (
        'queued', 'sending', 'paused', 'completed', 'cancelled'
    )),
    CONSTRAINT "SubscriberImportReconfirmWave_size_check" CHECK ("waveSize" > 0)
);

CREATE INDEX "SubscriberImportReconfirmWave_batch_idx"
    ON "SubscriberImportReconfirmWave"("batchId", "createdAt" DESC);
-- Une seule vague active par lot : pas de doubles envois concurrents.
CREATE UNIQUE INDEX "SubscriberImportReconfirmWave_active_key"
    ON "SubscriberImportReconfirmWave"("batchId")
    WHERE "status" IN ('queued', 'sending', 'paused');
-- +goose StatementEnd

-- +goose StatementBegin
-- Demande de reconfirmation : une adresse, un jeton, un état. Le jeton en
-- clair ne vit que dans `Subscriber.confirmationToken` (schéma existant) le
-- temps de l'envoi ; ici on ne stocke que son empreinte, avec unicité, pour
-- garantir l'usage unique sans conserver de secret supplémentaire.
CREATE TABLE "SubscriberImportReconfirmRequest" (
    "id"            TEXT NOT NULL,
    "waveId"        TEXT NOT NULL,
    "batchId"       TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "rowId"         TEXT,
    "email"         TEXT NOT NULL,
    "tokenHash"     TEXT NOT NULL,
    "status"        TEXT NOT NULL DEFAULT 'pending',
    "attempts"      INTEGER NOT NULL DEFAULT 0,
    "sentAt"        TIMESTAMP(3),
    "confirmedAt"   TIMESTAMP(3),
    "expiresAt"     TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriberImportReconfirmRequest_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SubscriberImportReconfirmRequest_status_check" CHECK ("status" IN (
        'pending', 'sent', 'confirmed', 'expired', 'skipped'
    ))
);

-- Un jeton ne sert jamais deux adresses (usage unique structurel).
CREATE UNIQUE INDEX "SubscriberImportReconfirmRequest_token_key"
    ON "SubscriberImportReconfirmRequest"("tokenHash");
-- Une adresse n'a qu'une demande vivante par vague (rejeu idempotent).
CREATE UNIQUE INDEX "SubscriberImportReconfirmRequest_wave_email_key"
    ON "SubscriberImportReconfirmRequest"("waveId", "email");
CREATE INDEX "SubscriberImportReconfirmRequest_wave_status_idx"
    ON "SubscriberImportReconfirmRequest"("waveId", "status", "email");
-- Purge des demandes échues : ne balaye que les états vivants.
CREATE INDEX "SubscriberImportReconfirmRequest_expiry_idx"
    ON "SubscriberImportReconfirmRequest"("expiresAt")
    WHERE "status" IN ('pending', 'sent');
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS "SubscriberImportReconfirmRequest";
DROP TABLE IF EXISTS "SubscriberImportReconfirmWave";
-- +goose StatementEnd
