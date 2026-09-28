-- =====================================================================
-- 📢 Centre de campagnes — traductions requises et compteur d'écartées
-- =====================================================================
-- Contexte : la 00035 appliquée en base ne portait que les tables de base
-- (sans traductions EN ni compteur skippedCount). Cette migration ajoute ce
-- qui manque, de façon strictement additive et idempotente : rejouable sans
-- effet sur une base qui aurait déjà ces colonnes.
--
-- Pourquoi ces colonnes : un avis légal ne part jamais dans une langue dont
-- le contenu n'a pas été revu (fiche 04 §12) — il faut donc stocker la
-- version anglaise ; et les livraisons écartées (opposition, annulation)
-- doivent être comptées pour que le bilan d'une vague soit honnête.
--
-- +goose Up
-- +goose StatementBegin
ALTER TABLE "StaffCampaign"
    ADD COLUMN IF NOT EXISTS "subjectEn" TEXT,
    ADD COLUMN IF NOT EXISTS "bodyHtmlEn" TEXT,
    ADD COLUMN IF NOT EXISTS "bodyTextEn" TEXT,
    ADD COLUMN IF NOT EXISTS "skippedCount" INTEGER NOT NULL DEFAULT 0;
-- +goose StatementEnd

-- +goose StatementBegin
-- Contraintes de la 00035, posées idempotemment : catégories, audiences et
-- statuts fermés ; approbateur distinct du rédacteur ; cohérence
-- audience/publication. DO block car ADD CONSTRAINT n'a pas de IF NOT EXISTS.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StaffCampaign_type_check') THEN
        ALTER TABLE "StaffCampaign" ADD CONSTRAINT "StaffCampaign_type_check" CHECK ("type" IN (
            'legal.version_notice', 'staff.direct', 'product.announcement'
        ));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StaffCampaign_audience_check') THEN
        ALTER TABLE "StaffCampaign" ADD CONSTRAINT "StaffCampaign_audience_check" CHECK ("audienceType" IN (
            'all_active_users', 'publication_subscribers'
        ));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StaffCampaign_status_check') THEN
        ALTER TABLE "StaffCampaign" ADD CONSTRAINT "StaffCampaign_status_check" CHECK ("status" IN (
            'draft', 'pending_review', 'approved', 'sending', 'paused',
            'completed', 'cancelled'
        ));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StaffCampaign_scope_publication_check') THEN
        ALTER TABLE "StaffCampaign" ADD CONSTRAINT "StaffCampaign_scope_publication_check" CHECK (
            ("audienceType" = 'publication_subscribers' AND "audiencePublicationId" IS NOT NULL) OR
            ("audienceType" = 'all_active_users' AND "audiencePublicationId" IS NULL)
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StaffCampaign_approver_check') THEN
        ALTER TABLE "StaffCampaign" ADD CONSTRAINT "StaffCampaign_approver_check" CHECK (
            "approvedBy" IS NULL OR "draftedBy" IS NULL OR "approvedBy" <> "draftedBy"
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StaffCampaignDelivery_status_check') THEN
        ALTER TABLE "StaffCampaignDelivery" ADD CONSTRAINT "StaffCampaignDelivery_status_check" CHECK ("status" IN (
            'queued', 'sent', 'failed', 'skipped', 'suppressed'
        ));
    END IF;
END $$;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE "StaffCampaignDelivery" DROP CONSTRAINT IF EXISTS "StaffCampaignDelivery_status_check";
ALTER TABLE "StaffCampaign"
    DROP CONSTRAINT IF EXISTS "StaffCampaign_approver_check",
    DROP CONSTRAINT IF EXISTS "StaffCampaign_scope_publication_check",
    DROP CONSTRAINT IF EXISTS "StaffCampaign_status_check",
    DROP CONSTRAINT IF EXISTS "StaffCampaign_audience_check",
    DROP CONSTRAINT IF EXISTS "StaffCampaign_type_check";
ALTER TABLE "StaffCampaign"
    DROP COLUMN IF EXISTS "skippedCount",
    DROP COLUMN IF EXISTS "bodyTextEn",
    DROP COLUMN IF EXISTS "bodyHtmlEn",
    DROP COLUMN IF EXISTS "subjectEn";
-- +goose StatementEnd
