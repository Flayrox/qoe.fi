-- =====================================================================
-- 🏷️ Migration 00081 : Renommage structurel "Publication" -> "Publisher"
-- =====================================================================
-- Supprime l'ambiguïté sémantique entre "Publication" (journal/espace)
-- et la publication d'un article.
-- - Table "Publication" -> "Publisher"
-- - Enum "PublicationType" -> "PublisherType"
-- - Enum "MediaAssetTargetType" : PUBLICATION_* -> PUBLISHER_*
-- - Colonnes "publicationId" -> "publisherId" sur toutes les tables
-- - Colonne "audiencePublicationId" -> "audiencePublisherId"
-- - Triggers et fonctions SQL mis à jour
-- =====================================================================

-- +goose Up
-- +goose StatementBegin

-- 1. Suppression préalable des triggers et fonctions liés à "Publication" / "publicationId"
DROP TRIGGER IF EXISTS trg_sync_user_to_personal_publication ON "User";
DROP TRIGGER IF EXISTS trg_cleanup_user_personal_publication ON "User";
DROP TRIGGER IF EXISTS trg_sync_personal_publication_to_user ON "Publication";
DROP FUNCTION IF EXISTS sync_user_to_personal_publication();
DROP FUNCTION IF EXISTS cleanup_user_personal_publication();
DROP FUNCTION IF EXISTS sync_personal_publication_to_user();

-- 2. Renommage des types enum
ALTER TYPE "PublicationType" RENAME TO "PublisherType";
ALTER TYPE "MediaAssetTargetType" RENAME VALUE 'PUBLICATION_LOGO' TO 'PUBLISHER_LOGO';
ALTER TYPE "MediaAssetTargetType" RENAME VALUE 'PUBLICATION_BANNER' TO 'PUBLISHER_BANNER';

-- 3. Renommage de la table principale
ALTER TABLE "Publication" RENAME TO "Publisher";

-- 4. Renommage des colonnes "publicationId" -> "publisherId"
ALTER TABLE "ApiKey" RENAME COLUMN "publicationId" TO "publisherId";
ALTER TABLE "Article" RENAME COLUMN "publicationId" TO "publisherId";
ALTER TABLE "ArticleEvent" RENAME COLUMN "publicationId" TO "publisherId";
ALTER TABLE "ArticleImportJob" RENAME COLUMN "publicationId" TO "publisherId";
ALTER TABLE "ArticleReviewLog" RENAME COLUMN "publicationId" TO "publisherId";
ALTER TABLE "Category" RENAME COLUMN "publicationId" TO "publisherId";
ALTER TABLE "EmailSuppression" RENAME COLUMN "publicationId" TO "publisherId";
ALTER TABLE "FeatureInterest" RENAME COLUMN "publicationId" TO "publisherId";
ALTER TABLE "FeatureSignal" RENAME COLUMN "publicationId" TO "publisherId";
ALTER TABLE "FollowRequest" RENAME COLUMN "publicationId" TO "publisherId";
ALTER TABLE "Follows" RENAME COLUMN "publicationId" TO "publisherId";
ALTER TABLE "ImportSendBudget" RENAME COLUMN "publicationId" TO "publisherId";
ALTER TABLE "ImportSendDelivery" RENAME COLUMN "publicationId" TO "publisherId";
ALTER TABLE "ImportSendWave" RENAME COLUMN "publicationId" TO "publisherId";
ALTER TABLE "Media" RENAME COLUMN "publicationId" TO "publisherId";
ALTER TABLE "NavigationItem" RENAME COLUMN "publicationId" TO "publisherId";
ALTER TABLE "NewsletterIssue" RENAME COLUMN "publicationId" TO "publisherId";
ALTER TABLE "Notification" RENAME COLUMN "publicationId" TO "publisherId";
ALTER TABLE "OAuthClient" RENAME COLUMN "publicationId" TO "publisherId";
ALTER TABLE "SiteLayout" RENAME COLUMN "publicationId" TO "publisherId";
ALTER TABLE "SiteVersion" RENAME COLUMN "publicationId" TO "publisherId";
ALTER TABLE "SocialLink" RENAME COLUMN "publicationId" TO "publisherId";
ALTER TABLE "Subscriber" RENAME COLUMN "publicationId" TO "publisherId";
ALTER TABLE "SubscriberImportBatch" RENAME COLUMN "publicationId" TO "publisherId";
ALTER TABLE "SubscriberImportReconfirmRequest" RENAME COLUMN "publicationId" TO "publisherId";
ALTER TABLE "SubscriberImportReconfirmWave" RENAME COLUMN "publicationId" TO "publisherId";
ALTER TABLE "Tier" RENAME COLUMN "publicationId" TO "publisherId";
ALTER TABLE "User" RENAME COLUMN "publicationId" TO "publisherId";
ALTER TABLE "Webhook" RENAME COLUMN "publicationId" TO "publisherId";
ALTER TABLE "StaffCampaign" RENAME COLUMN "audiencePublicationId" TO "audiencePublisherId";

-- 5. Mise à jour des contraintes CHECK et données des scopes
ALTER TABLE "EmailSuppression" DROP CONSTRAINT IF EXISTS "EmailSuppression_scope_check";
ALTER TABLE "EmailSuppression" DROP CONSTRAINT IF EXISTS "EmailSuppression_scope_publication_check";
DROP INDEX IF EXISTS "EmailSuppression_publication_key";
UPDATE "EmailSuppression" SET "scope" = 'publisher' WHERE "scope" = 'publication';
ALTER TABLE "EmailSuppression" ADD CONSTRAINT "EmailSuppression_scope_check"
    CHECK ("scope" IN ('global', 'publisher'));
ALTER TABLE "EmailSuppression" ADD CONSTRAINT "EmailSuppression_scope_publisher_check"
    CHECK (
        ("scope" = 'global' AND "publisherId" IS NULL) OR
        ("scope" = 'publisher' AND "publisherId" IS NOT NULL)
    );
CREATE UNIQUE INDEX IF NOT EXISTS "EmailSuppression_publisher_key"
    ON "EmailSuppression"(email, "publisherId") WHERE "scope" = 'publisher';

ALTER TABLE "SubscriptionGrant" DROP CONSTRAINT IF EXISTS "SubscriptionGrant_subject_check";
UPDATE "SubscriptionGrant" SET "subjectType" = 'publisher' WHERE "subjectType" = 'publication';
ALTER TABLE "SubscriptionGrant" ADD CONSTRAINT "SubscriptionGrant_subject_check"
    CHECK ("subjectType" IN ('user', 'publisher'));

ALTER TABLE "StaffCampaign" DROP CONSTRAINT IF EXISTS "StaffCampaign_audience_check";
ALTER TABLE "StaffCampaign" DROP CONSTRAINT IF EXISTS "StaffCampaign_scope_publication_check";
UPDATE "StaffCampaign" SET "audienceType" = 'publisher_subscribers' WHERE "audienceType" = 'publication_subscribers';
ALTER TABLE "StaffCampaign" ADD CONSTRAINT "StaffCampaign_audience_check"
    CHECK ("audienceType" IN ('all_active_users', 'publisher_subscribers', 'feature_interested'));
ALTER TABLE "StaffCampaign" ADD CONSTRAINT "StaffCampaign_scope_publisher_check"
    CHECK (
        ("audienceType" = 'publisher_subscribers' AND "audiencePublisherId" IS NOT NULL) OR
        ("audienceType" IN ('all_active_users', 'feature_interested') AND "audiencePublisherId" IS NULL)
    );

-- 6. Renommage des index principaux pour cohérence
ALTER INDEX IF EXISTS "Publication_pkey" RENAME TO "Publisher_pkey";
ALTER INDEX IF EXISTS "Publication_slug_key" RENAME TO "Publisher_slug_key";
ALTER INDEX IF EXISTS "Publication_subdomain_key" RENAME TO "Publisher_subdomain_key";
ALTER INDEX IF EXISTS "Publication_customDomain_key" RENAME TO "Publisher_customDomain_key";
ALTER INDEX IF EXISTS "Publication_type_idx" RENAME TO "Publisher_type_idx";
ALTER INDEX IF EXISTS "User_publicationId_key" RENAME TO "User_publisherId_key";
ALTER INDEX IF EXISTS "ApiKey_publicationId_idx" RENAME TO "ApiKey_publisherId_idx";
ALTER INDEX IF EXISTS "Article_publicationId_emailSentAt_idx" RENAME TO "Article_publisherId_emailSentAt_idx";
ALTER INDEX IF EXISTS "Article_publicationId_published_createdAt_idx" RENAME TO "Article_publisherId_published_createdAt_idx";
ALTER INDEX IF EXISTS "Article_publicationId_slug_key" RENAME TO "Article_publisherId_slug_key";
ALTER INDEX IF EXISTS "ArticleEvent_publicationId_createdAt_idx" RENAME TO "ArticleEvent_publisherId_createdAt_idx";
ALTER INDEX IF EXISTS "ArticleImportJob_publicationId_idx" RENAME TO "ArticleImportJob_publisherId_idx";
ALTER INDEX IF EXISTS "ArticleReviewLog_publicationId_createdAt_idx" RENAME TO "ArticleReviewLog_publisherId_createdAt_idx";
ALTER INDEX IF EXISTS "Category_publicationId_default_key" RENAME TO "Category_publisherId_default_key";
ALTER INDEX IF EXISTS "Category_publicationId_idx" RENAME TO "Category_publisherId_idx";
ALTER INDEX IF EXISTS "Category_slug_publicationId_key" RENAME TO "Category_slug_publisherId_key";
ALTER INDEX IF EXISTS "FeatureSignal_publication_created_idx" RENAME TO "FeatureSignal_publisher_created_idx";
ALTER INDEX IF EXISTS "FeatureSignal_publication_kind_idx" RENAME TO "FeatureSignal_publisher_kind_idx";
ALTER INDEX IF EXISTS "FollowRequest_publication_pending_idx" RENAME TO "FollowRequest_publisher_pending_idx";
ALTER INDEX IF EXISTS "Follows_publicationId_idx" RENAME TO "Follows_publisherId_idx";
ALTER INDEX IF EXISTS "Follows_readerId_publicationId_key" RENAME TO "Follows_readerId_publisherId_key";
ALTER INDEX IF EXISTS "Media_publicationId_key" RENAME TO "Media_publisherId_key";
ALTER INDEX IF EXISTS "NavigationItem_publicationId_idx" RENAME TO "NavigationItem_publisherId_idx";
ALTER INDEX IF EXISTS "NewsletterIssue_publicationId_idx" RENAME TO "NewsletterIssue_publisherId_idx";
ALTER INDEX IF EXISTS "Notification_publicationId_idx" RENAME TO "Notification_publisherId_idx";
ALTER INDEX IF EXISTS "SiteVersion_publicationId_createdAt_idx" RENAME TO "SiteVersion_publisherId_createdAt_idx";
ALTER INDEX IF EXISTS "SocialLink_publicationId_idx" RENAME TO "SocialLink_publisherId_idx";
ALTER INDEX IF EXISTS "Subscriber_email_publicationId_key" RENAME TO "Subscriber_email_publisherId_key";
ALTER INDEX IF EXISTS "Subscriber_publicationId_email_status_idx" RENAME TO "Subscriber_publisherId_email_status_idx";
ALTER INDEX IF EXISTS "Subscriber_userId_publicationId_idx" RENAME TO "Subscriber_userId_publisherId_idx";
ALTER INDEX IF EXISTS "SubscriberImportBatch_publication_idx" RENAME TO "SubscriberImportBatch_publisher_idx";
ALTER INDEX IF EXISTS "Tier_publicationId_idx" RENAME TO "Tier_publisherId_idx";
ALTER INDEX IF EXISTS "Webhook_publicationId_idx" RENAME TO "Webhook_publisherId_idx";

-- 7. Recréation des fonctions et triggers avec "Publisher" et "publisherId"
CREATE OR REPLACE FUNCTION sync_user_to_personal_publisher()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."publisherId" IS NOT NULL THEN
        UPDATE "Publisher"
        SET slug = COALESCE(NEW.username, slug),
            name = COALESCE(NULLIF(NEW.name, ''), NEW.username, name),
            "logoUrl" = NEW."logoUrl",
            "updatedAt" = now()
        WHERE id = NEW."publisherId"
          AND type = 'PERSONAL'
          AND (
            slug IS DISTINCT FROM NEW.username
            OR name IS DISTINCT FROM COALESCE(NULLIF(NEW.name, ''), NEW.username, name)
            OR "logoUrl" IS DISTINCT FROM NEW."logoUrl"
          );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_user_to_personal_publisher ON "User";
CREATE TRIGGER trg_sync_user_to_personal_publisher
AFTER INSERT OR UPDATE OF username, name, "logoUrl", "publisherId" ON "User"
FOR EACH ROW
EXECUTE FUNCTION sync_user_to_personal_publisher();

CREATE OR REPLACE FUNCTION sync_personal_publisher_to_user()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.type = 'PERSONAL' THEN
        UPDATE "User"
        SET username = COALESCE(NEW.slug, username),
            name = COALESCE(NULLIF(NEW.name, ''), name),
            "logoUrl" = NEW."logoUrl",
            "updatedAt" = now()
        WHERE "publisherId" = NEW.id
          AND username IS NOT NULL
          AND username <> ''
          AND (
            username IS DISTINCT FROM NEW.slug
            OR name IS DISTINCT FROM COALESCE(NULLIF(NEW.name, ''), name)
            OR "logoUrl" IS DISTINCT FROM NEW."logoUrl"
          );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_personal_publisher_to_user ON "Publisher";
CREATE TRIGGER trg_sync_personal_publisher_to_user
AFTER UPDATE OF slug, name, "logoUrl" ON "Publisher"
FOR EACH ROW
EXECUTE FUNCTION sync_personal_publisher_to_user();

CREATE OR REPLACE FUNCTION cleanup_user_personal_publisher()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD."publisherId" IS NOT NULL THEN
        DELETE FROM "Publisher"
        WHERE id = OLD."publisherId"
          AND type = 'PERSONAL';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cleanup_user_personal_publisher ON "User";
CREATE TRIGGER trg_cleanup_user_personal_publisher
AFTER DELETE ON "User"
FOR EACH ROW
EXECUTE FUNCTION cleanup_user_personal_publisher();

CREATE OR REPLACE FUNCTION can_view_profile(viewer_id UUID, target_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT CASE
    WHEN target_user_id IS NULL THEN false
    WHEN NOT EXISTS (SELECT 1 FROM "User" WHERE id = target_user_id) THEN false
    WHEN viewer_id IS NOT NULL AND viewer_id = target_user_id THEN true
    WHEN viewer_id IS NOT NULL AND is_blocked_bidirectional(viewer_id, target_user_id) THEN false
    WHEN COALESCE((SELECT us."profileVisibility" FROM "UserSettings" us WHERE us."userId" = target_user_id), 'PUBLIC') = 'PUBLIC' THEN true
    WHEN viewer_id IS NULL THEN false
    ELSE EXISTS (
      SELECT 1 FROM "Follows" f
      JOIN "User" u ON u."publisherId" = f."publisherId"
      WHERE f."readerId" = viewer_id AND u.id = target_user_id
    )
  END;
$$ LANGUAGE SQL STABLE;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin

DROP TRIGGER IF EXISTS trg_sync_user_to_personal_publisher ON "User";
DROP TRIGGER IF EXISTS trg_cleanup_user_personal_publisher ON "User";
DROP TRIGGER IF EXISTS trg_sync_personal_publisher_to_user ON "Publisher";
DROP FUNCTION IF EXISTS sync_user_to_personal_publisher();
DROP FUNCTION IF EXISTS cleanup_user_personal_publisher();
DROP FUNCTION IF EXISTS sync_personal_publisher_to_user();

ALTER TYPE "PublisherType" RENAME TO "PublicationType";
ALTER TYPE "MediaAssetTargetType" RENAME VALUE 'PUBLISHER_LOGO' TO 'PUBLICATION_LOGO';
ALTER TYPE "MediaAssetTargetType" RENAME VALUE 'PUBLISHER_BANNER' TO 'PUBLICATION_BANNER';

ALTER TABLE "Publisher" RENAME TO "Publication";

ALTER TABLE "ApiKey" RENAME COLUMN "publisherId" TO "publicationId";
ALTER TABLE "Article" RENAME COLUMN "publisherId" TO "publicationId";
ALTER TABLE "ArticleEvent" RENAME COLUMN "publisherId" TO "publicationId";
ALTER TABLE "ArticleImportJob" RENAME COLUMN "publisherId" TO "publicationId";
ALTER TABLE "ArticleReviewLog" RENAME COLUMN "publisherId" TO "publicationId";
ALTER TABLE "Category" RENAME COLUMN "publisherId" TO "publicationId";
ALTER TABLE "EmailSuppression" RENAME COLUMN "publisherId" TO "publicationId";
ALTER TABLE "FeatureInterest" RENAME COLUMN "publisherId" TO "publicationId";
ALTER TABLE "FeatureSignal" RENAME COLUMN "publisherId" TO "publicationId";
ALTER TABLE "FollowRequest" RENAME COLUMN "publisherId" TO "publicationId";
ALTER TABLE "Follows" RENAME COLUMN "publisherId" TO "publicationId";
ALTER TABLE "ImportSendBudget" RENAME COLUMN "publisherId" TO "publicationId";
ALTER TABLE "ImportSendDelivery" RENAME COLUMN "publisherId" TO "publicationId";
ALTER TABLE "ImportSendWave" RENAME COLUMN "publisherId" TO "publicationId";
ALTER TABLE "Media" RENAME COLUMN "publisherId" TO "publicationId";
ALTER TABLE "NavigationItem" RENAME COLUMN "publisherId" TO "publicationId";
ALTER TABLE "NewsletterIssue" RENAME COLUMN "publisherId" TO "publicationId";
ALTER TABLE "Notification" RENAME COLUMN "publisherId" TO "publicationId";
ALTER TABLE "OAuthClient" RENAME COLUMN "publisherId" TO "publicationId";
ALTER TABLE "SiteLayout" RENAME COLUMN "publisherId" TO "publicationId";
ALTER TABLE "SiteVersion" RENAME COLUMN "publisherId" TO "publicationId";
ALTER TABLE "SocialLink" RENAME COLUMN "publisherId" TO "publicationId";
ALTER TABLE "Subscriber" RENAME COLUMN "publisherId" TO "publicationId";
ALTER TABLE "SubscriberImportBatch" RENAME COLUMN "publisherId" TO "publicationId";
ALTER TABLE "SubscriberImportReconfirmRequest" RENAME COLUMN "publisherId" TO "publicationId";
ALTER TABLE "SubscriberImportReconfirmWave" RENAME COLUMN "publisherId" TO "publicationId";
ALTER TABLE "Tier" RENAME COLUMN "publisherId" TO "publicationId";
ALTER TABLE "User" RENAME COLUMN "publisherId" TO "publicationId";
ALTER TABLE "Webhook" RENAME COLUMN "publisherId" TO "publicationId";
ALTER TABLE "StaffCampaign" RENAME COLUMN "audiencePublisherId" TO "audiencePublicationId";

ALTER TABLE "EmailSuppression" DROP CONSTRAINT IF EXISTS "EmailSuppression_scope_check";
ALTER TABLE "EmailSuppression" DROP CONSTRAINT IF EXISTS "EmailSuppression_scope_publisher_check";
DROP INDEX IF EXISTS "EmailSuppression_publisher_key";
UPDATE "EmailSuppression" SET "scope" = 'publication' WHERE "scope" = 'publisher';
ALTER TABLE "EmailSuppression" ADD CONSTRAINT "EmailSuppression_scope_check"
    CHECK ("scope" IN ('global', 'publication'));
ALTER TABLE "EmailSuppression" ADD CONSTRAINT "EmailSuppression_scope_publication_check"
    CHECK (
        ("scope" = 'global' AND "publicationId" IS NULL) OR
        ("scope" = 'publication' AND "publicationId" IS NOT NULL)
    );
CREATE UNIQUE INDEX IF NOT EXISTS "EmailSuppression_publication_key"
    ON "EmailSuppression"(email, "publicationId") WHERE "scope" = 'publication';

ALTER TABLE "SubscriptionGrant" DROP CONSTRAINT IF EXISTS "SubscriptionGrant_subject_check";
UPDATE "SubscriptionGrant" SET "subjectType" = 'publication' WHERE "subjectType" = 'publisher';
ALTER TABLE "SubscriptionGrant" ADD CONSTRAINT "SubscriptionGrant_subject_check"
    CHECK ("subjectType" IN ('user', 'publication'));

ALTER TABLE "StaffCampaign" DROP CONSTRAINT IF EXISTS "StaffCampaign_audience_check";
ALTER TABLE "StaffCampaign" DROP CONSTRAINT IF EXISTS "StaffCampaign_scope_publisher_check";
UPDATE "StaffCampaign" SET "audienceType" = 'publication_subscribers' WHERE "audienceType" = 'publisher_subscribers';
ALTER TABLE "StaffCampaign" ADD CONSTRAINT "StaffCampaign_audience_check"
    CHECK ("audienceType" IN ('all_active_users', 'publication_subscribers', 'feature_interested'));
ALTER TABLE "StaffCampaign" ADD CONSTRAINT "StaffCampaign_scope_publication_check"
    CHECK (
        ("audienceType" = 'publication_subscribers' AND "audiencePublicationId" IS NOT NULL) OR
        ("audienceType" IN ('all_active_users', 'feature_interested') AND "audiencePublicationId" IS NULL)
    );

CREATE OR REPLACE FUNCTION can_view_profile(viewer_id UUID, target_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT CASE
    WHEN target_user_id IS NULL THEN false
    WHEN NOT EXISTS (SELECT 1 FROM "User" WHERE id = target_user_id) THEN false
    WHEN viewer_id IS NOT NULL AND viewer_id = target_user_id THEN true
    WHEN viewer_id IS NOT NULL AND is_blocked_bidirectional(viewer_id, target_user_id) THEN false
    WHEN COALESCE((SELECT us."profileVisibility" FROM "UserSettings" us WHERE us."userId" = target_user_id), 'PUBLIC') = 'PUBLIC' THEN true
    WHEN viewer_id IS NULL THEN false
    ELSE EXISTS (
      SELECT 1 FROM "Follows" f
      JOIN "User" u ON u."publicationId" = f."publicationId"
      WHERE f."readerId" = viewer_id AND u.id = target_user_id
    )
  END;
$$ LANGUAGE SQL STABLE;

-- +goose StatementEnd
