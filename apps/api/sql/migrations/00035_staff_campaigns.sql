-- =====================================================================
-- 📢 Communications — centre de campagnes administratives (fiche 04 §10)
-- =====================================================================
-- Il n'existait aucun moyen d'envoyer un message officiel ciblé : ni campagne
-- légale, ni annonce produit, ni message staff — seulement du code ad hoc ou
-- rien. Surtout, il n'existait aucune barrière contre un `sendAnyEmail(to,
-- html)` : ce centre est cette barrière. Catégories fermées, audience générée
-- côté serveur (jamais de CSV libre), rédacteur ≠ approbateur, audience figée
-- à l'approbation, arrêt possible à tout moment.
--
-- Invariants structurels :
--   • catégories fermées par CHECK : un message « obligatoire » ne peut pas
--     servir à envoyer une promotion déguisée ;
--   • approbation par un SECOND superadmin : rédiger ≠ approuver, vérifié en
--     base au moment d'approuver, pas dans l'UI ;
--   • audience figée : le snapshot (critères + compteurs) est pris à
--     l'approbation ; toute modification substantielle du contenu ou de
--     l'audience après validation renvoie en revue (nouveau brouillon) ;
--   • une seule campagne active par... non : plusieurs campagnes peuvent
--     coexister, mais une seule vague d'envoi active par campagne (unicité
--     partielle sur les livraisons en cours via le statut) ;
--   • variables sur liste blanche, substituées avec échappement : aucun HTML
--     arbitraire injecté via une variable.
--
-- +goose Up
-- +goose StatementBegin
CREATE TABLE "StaffCampaign" (
    "id"            TEXT NOT NULL,
    -- Catégorie fermée : legal.version_notice, staff.direct,
    -- product.announcement. Les invitations d'événements attendent le
    -- chantier événements ; les newsletters créateur restent sur leur chemin.
    "type"          TEXT NOT NULL,
    "subject"       TEXT NOT NULL,
    "bodyHtml"      TEXT NOT NULL,
    "bodyText"      TEXT NOT NULL DEFAULT '',
    -- Audience : 'all_active_users' (comptes non suspendus, pour le légal) ou
    -- 'publication_subscribers' (abonnés actifs confirmés non supprimés).
    -- Jamais de liste libre : l'audience est générée côté serveur.
    "audienceType"  TEXT NOT NULL,
    "audiencePublicationId" TEXT,
    -- Snapshot figé à l'approbation : critères + compteurs estimés. C'est sur
    -- ce snapshot que porte l'approbation, pas sur une audience mouvante.
    "audienceSnapshot" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "status"        TEXT NOT NULL DEFAULT 'draft',
    -- Séparation rédacteur / approbateur : deux superadmins distincts.
    "draftedBy"     UUID,
    "approvedBy"    UUID,
    "approvedAt"    TIMESTAMP(3),
    "scheduledAt"   TIMESTAMP(3),
    "sentCount"     INTEGER NOT NULL DEFAULT 0,
    "failedCount"   INTEGER NOT NULL DEFAULT 0,
    "completedAt"   TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffCampaign_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StaffCampaign_type_check" CHECK ("type" IN (
        'legal.version_notice', 'staff.direct', 'product.announcement'
    )),
    CONSTRAINT "StaffCampaign_audience_check" CHECK ("audienceType" IN (
        'all_active_users', 'publication_subscribers'
    )),
    CONSTRAINT "StaffCampaign_status_check" CHECK ("status" IN (
        'draft', 'pending_review', 'approved', 'sending', 'paused',
        'completed', 'cancelled'
    )),
    -- Une audience par publication exige sa publication ; l'audience globale
    -- n'en a pas.
    CONSTRAINT "StaffCampaign_audience_publication_check" CHECK (
        ("audienceType" = 'publication_subscribers' AND "audiencePublicationId" IS NOT NULL) OR
        ("audienceType" = 'all_active_users' AND "audiencePublicationId" IS NULL)
    ),
    -- Un approbateur ne peut pas être le rédacteur : vérifié aussi côté Go
    -- (messages d'erreur explicites), la contrainte est le filet.
    CONSTRAINT "StaffCampaign_approver_check" CHECK (
        "approvedBy" IS NULL OR "draftedBy" IS NULL OR "approvedBy" <> "draftedBy"
    )
);

CREATE INDEX "StaffCampaign_status_idx"
    ON "StaffCampaign"("status", "createdAt" DESC);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE "StaffCampaignDelivery" (
    "id"         TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "email"      TEXT NOT NULL,
    "status"     TEXT NOT NULL DEFAULT 'queued',
    "error"      TEXT,
    "sentAt"        TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffCampaignDelivery_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "StaffCampaignDelivery_status_check" CHECK ("status" IN (
        'queued', 'sent', 'failed', 'skipped', 'suppressed'
    ))
);

-- Une adresse n'est visée qu'une fois par campagne (rejeu idempotent).
CREATE UNIQUE INDEX "StaffCampaignDelivery_campaign_email_key"
    ON "StaffCampaignDelivery"("campaignId", "email");
CREATE INDEX "StaffCampaignDelivery_campaign_status_idx"
    ON "StaffCampaignDelivery"("campaignId", "status", "email");
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS "StaffCampaignDelivery";
DROP TABLE IF EXISTS "StaffCampaign";
-- +goose StatementEnd
