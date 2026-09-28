-- =====================================================================
-- 👥 Import de listes d'abonnés — quarantaine et revue staff (fiche 03)
-- =====================================================================
-- État constaté avant cette migration : `importSubscribersCsvAction` (Studio)
-- lisait un CSV envoyé par le navigateur puis appelait POST /v1/home/subscribe
-- **une fois par adresse**. Or cet endpoint crée un abonné avec
-- `confirmedAt = now()` et `receiveArticles = true`. Déposer un fichier
-- suffisait donc à rendre des milliers d'adresses immédiatement destinataires
-- de la prochaine campagne, avec une confirmation que personne n'avait
-- effectuée, sans revue, sans preuve de provenance et sans trace.
--
-- Principe de cette table : **importer n'est pas envoyer**. Un dépôt de fichier
-- ne touche ni `Subscriber`, ni un envoi. Il alimente une quarantaine examinée
-- par le staff, et la décision est un enregistrement immuable — un changement
-- produit une nouvelle décision, jamais une réécriture de l'ancienne.
--
-- `confirmedAt` reste réservé aux clics réellement effectués chez qoe.fi. Une
-- approbation d'import est un **autre type de preuve** : elle vit dans
-- `SubscriberImportDecision`, rattachée au lot et à son empreinte de fichier,
-- donc révocable sans falsifier l'historique du consentement.

-- +goose Up
-- +goose StatementBegin
CREATE TABLE "SubscriberImportBatch" (
    "id"              TEXT NOT NULL,
    "publicationId"   TEXT NOT NULL,
    "mediaId"         TEXT,
    "requesterId"     UUID NOT NULL,
    "status"          TEXT NOT NULL DEFAULT 'draft',
    -- Source déclarée par le demandeur (ancien service, export CMS, autre).
    "source"          TEXT NOT NULL DEFAULT 'other',
    "sourceDetail"    TEXT,
    "collectionPeriod" TEXT,
    "lastSendAt"      TIMESTAMP(3),
    "optInMethod"     TEXT,
    -- Déclarations du demandeur (origine licite, absence d'adresses achetées
    -- ou collectées sur le Web, absence de désabonnés, liste de suppressions
    -- identifiée). Une déclaration n'est PAS une preuve : elle est conservée
    -- pour l'audit et confrontée aux contrôles techniques.
    "declarations"    JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Références de pièces justificatives conservées hors accès public.
    "proofRefs"       JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Empreinte du contenu soumis : une approbation porte sur cette version
    -- exacte. Modifier le fichier crée une nouvelle version à réexaminer.
    "fileFingerprint" TEXT NOT NULL,
    "fileVersion"     INTEGER NOT NULL DEFAULT 1,
    "rowCount"        INTEGER NOT NULL DEFAULT 0,
    -- Bilan agrégé du parsing (reçues, valides, doublons, exclues, déjà
    -- présentes, éligibles à la revue). Aucune adresse individuelle ici.
    "stats"           JSONB NOT NULL DEFAULT '{}'::jsonb,
    "reviewDueAt"     TIMESTAMP(3),
    "suspendedAt"     TIMESTAMP(3),
    "submittedAt"     TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriberImportBatch_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SubscriberImportBatch_status_check" CHECK ("status" IN (
        'draft', 'submitted', 'reviewing', 'needs_info', 'rejected',
        'approved_reconfirm', 'approved_direct', 'running', 'completed',
        'suspended', 'cancelled'
    )),
    CONSTRAINT "SubscriberImportBatch_source_check" CHECK ("source" IN (
        'substack', 'ghost', 'beehiiv', 'mailchimp', 'cms_export', 'csv_manual', 'other'
    ))
);

CREATE INDEX "SubscriberImportBatch_publication_idx"
    ON "SubscriberImportBatch"("publicationId", "createdAt" DESC);
-- File d'attente de la revue : les lots ouverts sont peu nombreux, index partiel.
CREATE INDEX "SubscriberImportBatch_open_review_idx"
    ON "SubscriberImportBatch"("submittedAt" ASC)
    WHERE "status" IN ('submitted', 'reviewing', 'needs_info');
CREATE INDEX "SubscriberImportBatch_requester_idx"
    ON "SubscriberImportBatch"("requesterId", "createdAt" DESC);
-- +goose StatementEnd

-- +goose StatementBegin
-- Staging : une ligne par adresse soumise, avec son verdict de quarantaine.
-- L'adresse est stockée en clair car elle est l'objet même de la revue ; son
-- accès est restreint au demandeur (agrégats) et au staff (revue).
CREATE TABLE "SubscriberImportRow" (
    "id"           TEXT NOT NULL,
    "batchId"      TEXT NOT NULL,
    "email"        TEXT NOT NULL,
    "status"       TEXT NOT NULL,
    "reason"       TEXT,
    -- Abonnement qoe.fi existant pour la même publication, si la ligne
    -- correspond déjà à un contact connu.
    "subscriberId" TEXT,
    -- 'system' pour un verdict automatique de quarantaine, sinon l'id de la
    -- décision staff qui a prononcé une exclusion.
    "excludedBy"   TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriberImportRow_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SubscriberImportRow_status_check" CHECK ("status" IN (
        'invalid', 'duplicate', 'suppressed', 'already_subscribed',
        'pending_confirmation', 'eligible_direct', 'excluded', 'active'
    ))
);

CREATE UNIQUE INDEX "SubscriberImportRow_batch_email_key"
    ON "SubscriberImportRow"("batchId", "email");
CREATE INDEX "SubscriberImportRow_batch_status_idx"
    ON "SubscriberImportRow"("batchId", "status");
-- Retrouver rapidement si une adresse a déjà été soumise dans un autre lot
-- (détection de réimport, exigée par la revue).
CREATE INDEX "SubscriberImportRow_email_idx"
    ON "SubscriberImportRow"(email);
-- +goose StatementEnd

-- +goose StatementBegin
-- Décision staff : append-only. Aucune mise à jour, aucune suppression : un
-- changement d'avis ajoute une décision. C'est ce qui rend une approbation
-- traçable et contestable, et ce qui empêche de « corriger » silencieusement
-- l'historique d'une liste.
CREATE TABLE "SubscriberImportDecision" (
    "id"              TEXT NOT NULL,
    "batchId"         TEXT NOT NULL,
    "decision"        TEXT NOT NULL,
    "actorId"         UUID,
    "actorKind"       TEXT NOT NULL DEFAULT 'staff',
    -- Deux motifs distincts : l'un interne (analyse, soupçons), l'autre
    -- communicable au demandeur. Ne jamais exposer le premier.
    "internalReason"  TEXT,
    "publicReason"    TEXT,
    -- Segments concernés, quotas, plafonds d'envoi, expiration.
    "limits"          JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- La décision porte sur une version précise du fichier.
    "fileVersion"     INTEGER NOT NULL,
    "fileFingerprint" TEXT NOT NULL,
    "expiresAt"       TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriberImportDecision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SubscriberImportDecision_decision_check" CHECK ("decision" IN (
        'needs_info', 'rejected', 'approved_reconfirm', 'approved_direct',
        'suspended', 'resumed', 'cancelled'
    )),
    CONSTRAINT "SubscriberImportDecision_actor_kind_check" CHECK ("actorKind" IN ('staff', 'system'))
);

CREATE INDEX "SubscriberImportDecision_batch_idx"
    ON "SubscriberImportDecision"("batchId", "createdAt" DESC);

CREATE OR REPLACE FUNCTION prevent_subscriber_import_decision_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'une décision d''import est immuable : ajoutez une nouvelle décision';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_subscriber_import_decision_immutable ON "SubscriberImportDecision";
CREATE TRIGGER trg_subscriber_import_decision_immutable
BEFORE UPDATE OR DELETE ON "SubscriberImportDecision"
FOR EACH ROW
EXECUTE FUNCTION prevent_subscriber_import_decision_mutation();
-- +goose StatementEnd

-- +goose StatementBegin
-- Journal des actions du lot : dépôt, soumission, consultation staff, décision,
-- suspension. Sert de base au futur chantier de recours (fiche 03 §11) : chaque
-- refus et chaque suspension doit avoir un identifiant, un auteur et une date.
CREATE TABLE "SubscriberImportEvent" (
    "id"        TEXT NOT NULL,
    "batchId"   TEXT NOT NULL,
    "type"      TEXT NOT NULL,
    "actorId"   UUID,
    "actorKind" TEXT NOT NULL DEFAULT 'requester',
    "detail"    JSONB NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriberImportEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SubscriberImportEvent_actor_kind_check" CHECK ("actorKind" IN ('requester', 'staff', 'system'))
);

CREATE INDEX "SubscriberImportEvent_batch_idx"
    ON "SubscriberImportEvent"("batchId", "createdAt" ASC);
-- +goose StatementEnd

-- +goose StatementBegin
-- Opposition durable : désabonnements, rejets définitifs, plaintes, exclusions
-- staff. Contrairement à `Subscriber."receiveArticles" = false`, une ligne ici
-- survit à la suppression de l'abonné et couvre plusieurs publications.
--
-- Sans cette table, l'opposition n'était pas durable : un réimport du même CSV
-- réactivait un contact désabonné, car POST /v1/home/subscribe fait
-- `ON CONFLICT DO UPDATE SET "isActive" = true`. Le balayage de quarantaine
-- refuse désormais toute adresse présente ici pour sa publication ou au niveau
-- global, avant même la revue.
CREATE TABLE "EmailSuppression" (
    "id"            TEXT NOT NULL,
    "email"         TEXT NOT NULL,
    -- 'global' : ne jamais recontacter, quelle que soit la publication.
    -- 'publication' : opposition pour cette publication seulement.
    "scope"         TEXT NOT NULL,
    "publicationId" TEXT,
    "reason"        TEXT NOT NULL,
    "source"        TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EmailSuppression_scope_check" CHECK ("scope" IN ('global', 'publication')),
    CONSTRAINT "EmailSuppression_reason_check" CHECK ("reason" IN (
        'unsubscribe', 'hard_bounce', 'complaint', 'staff_exclusion',
        'import_exclusion', 'manual'
    )),
    -- Une opposition globale n'a pas de publication ; une opposition ciblée en
    -- a toujours une.
    CONSTRAINT "EmailSuppression_scope_publication_check" CHECK (
        ("scope" = 'global' AND "publicationId" IS NULL) OR
        ("scope" = 'publication' AND "publicationId" IS NOT NULL)
    )
);

-- Deux index uniques partiels : `publicationId` étant NULL pour les
-- oppositions globales, un index unique classique ne dédupliquerait rien.
CREATE UNIQUE INDEX "EmailSuppression_global_key"
    ON "EmailSuppression"(email) WHERE "scope" = 'global';
CREATE UNIQUE INDEX "EmailSuppression_publication_key"
    ON "EmailSuppression"(email, "publicationId") WHERE "scope" = 'publication';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TRIGGER IF EXISTS trg_subscriber_import_decision_immutable ON "SubscriberImportDecision";
DROP FUNCTION IF EXISTS prevent_subscriber_import_decision_mutation();
DROP TABLE IF EXISTS "EmailSuppression";
DROP TABLE IF EXISTS "SubscriberImportEvent";
DROP TABLE IF EXISTS "SubscriberImportDecision";
DROP TABLE IF EXISTS "SubscriberImportRow";
DROP TABLE IF EXISTS "SubscriberImportBatch";
-- +goose StatementEnd
