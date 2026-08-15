-- =====================================================================
-- 🧱 BASELINE from-scratch (idempotent)
-- =====================================================================
-- Contexte : l'historique de migrations est un workflow « snapshot +
-- deltas » — les migrations existantes sont des deltas écrits à la main
-- sur un schéma créé originellement par `prisma db push` (Supabase).
-- Résultat : `prisma migrate deploy` échouait sur une base vierge
-- (types/tables manquants : NotificationType, Media, Category, ...).
--
-- Cette migration recrée l'état d'origine (avant le premier delta) :
--   • base vierge  → tout est créé, puis les deltas s'appliquent ;
--   • base déjà migrée (prod/dev) → garde atomique : la table
--     « Publication » existe → no-op pur, rien n'est modifié.
--
-- Générée via `prisma migrate diff --from-url <état après migrations de
-- base> --to-schema-datamodel <schéma d'origine>` (état = ceee6c7~1,
-- juste avant 20260814000000_add_publication_model).
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'Publication'
  ) THEN
    -- CreateExtension
    CREATE EXTENSION IF NOT EXISTS "vector";
    
    -- CreateEnum
    CREATE TYPE "ContentVisibility" AS ENUM ('PUBLIC', 'MEMBERS_ONLY', 'PAID_SUBSCRIBERS', 'TIER_SPECIFIC');
    
    -- CreateEnum
    CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED', 'UNPAID', 'INCOMPLETE');
    
    -- CreateEnum
    CREATE TYPE "NotificationType" AS ENUM ('LIKE', 'REPOST', 'REPLY', 'MENTION', 'FOLLOW');
    
    -- DropForeignKey
    ALTER TABLE "Article" DROP CONSTRAINT "Article_authorId_fkey";
    
    -- DropIndex
    DROP INDEX "Article_slug_key";
    
    -- AlterTable
    ALTER TABLE "Article" ADD COLUMN     "allowComments" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN     "allowPublicAnnotations" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN     "categoryId" TEXT,
    ADD COLUMN     "completionRate" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    ADD COLUMN     "embedding" vector(1536),
    ADD COLUMN     "isEditorPick" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN     "isPremium" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN     "mediaId" TEXT,
    ADD COLUMN     "readingTime" INTEGER NOT NULL DEFAULT 5,
    ADD COLUMN     "scheduledAt" TIMESTAMP(3),
    ADD COLUMN     "semanticTags" TEXT[],
    ADD COLUMN     "seoDescription" TEXT,
    ADD COLUMN     "seoTitle" TEXT,
    ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DRAFT',
    ADD COLUMN     "tierId" TEXT,
    ADD COLUMN     "visibility" "ContentVisibility" NOT NULL DEFAULT 'PUBLIC';
    
    -- AlterTable
    ALTER TABLE "User" ADD COLUMN     "accentColor" TEXT,
    ADD COLUMN     "advancedSettingsMode" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN     "allowComments" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN     "allowIndexing" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN     "allowPublicAnnotations" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN     "apiAccessStatus" TEXT NOT NULL DEFAULT 'none',
    ADD COLUMN     "apiApplicationReason" TEXT,
    ADD COLUMN     "customDomain" TEXT,
    ADD COLUMN     "embedding" vector(1536),
    ADD COLUMN     "fontFamily" TEXT,
    ADD COLUMN     "footerText" TEXT,
    ADD COLUMN     "forceStandardTheme" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN     "hasCompletedOnboarding" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN     "headerImageUrl" TEXT,
    ADD COLUMN     "heroText" TEXT,
    ADD COLUMN     "isCertified" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN     "isShadowbanned" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN     "isSuspended" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN     "layoutStyle" TEXT DEFAULT 'minimal',
    ADD COLUMN     "logoUrl" TEXT,
    ADD COLUMN     "onboardingText" TEXT,
    ADD COLUMN     "seoDescription" TEXT,
    ADD COLUMN     "seoTitle" TEXT,
    ADD COLUMN     "stripeAccountId" TEXT,
    ADD COLUMN     "subdomain" TEXT,
    ADD COLUMN     "supportUrl" TEXT,
    ADD COLUMN     "suspendReason" TEXT,
    ADD COLUMN     "themeMode" TEXT DEFAULT 'system',
    ADD COLUMN     "umamiWebsiteId" TEXT,
    ADD COLUMN     "walletBalanceCents" INTEGER NOT NULL DEFAULT 0;
    
    -- CreateTable
    CREATE TABLE "SystemConfig" (
        "key" TEXT NOT NULL,
        "value" TEXT NOT NULL,
        "description" TEXT,
        "updatedAt" TIMESTAMP(3) NOT NULL,
    
        CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("key")
    );
    
    -- CreateTable
    CREATE TABLE "Recommendation" (
        "id" TEXT NOT NULL,
        "recommenderId" UUID NOT NULL,
        "recommendedId" UUID NOT NULL,
        "description" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
        CONSTRAINT "Recommendation_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "Tier" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "description" TEXT,
        "monthlyPriceCents" INTEGER NOT NULL,
        "yearlyPriceCents" INTEGER,
        "stripePriceIdMonthly" TEXT,
        "stripePriceIdYearly" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        "creatorId" UUID NOT NULL,
    
        CONSTRAINT "Tier_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "MutedWord" (
        "id" TEXT NOT NULL,
        "word" TEXT NOT NULL,
        "userId" UUID NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
        CONSTRAINT "MutedWord_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "BlockedUser" (
        "id" TEXT NOT NULL,
        "creatorId" UUID NOT NULL,
        "readerId" UUID NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
        CONSTRAINT "BlockedUser_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "WalletTransaction" (
        "id" TEXT NOT NULL,
        "userId" UUID NOT NULL,
        "amountCents" INTEGER NOT NULL,
        "type" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
        CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "Subscriber" (
        "id" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "isPremium" BOOLEAN NOT NULL DEFAULT false,
        "ltvCents" INTEGER NOT NULL DEFAULT 0,
        "receiveArticles" BOOLEAN NOT NULL DEFAULT true,
        "receivePosts" BOOLEAN NOT NULL DEFAULT false,
        "currentPeriodEnd" TIMESTAMP(3),
        "stripeSubscriptionId" TEXT,
        "stripeCustomerId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        "creatorId" UUID NOT NULL,
        "userId" UUID,
        "tierId" TEXT,
    
        CONSTRAINT "Subscriber_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "Follows" (
        "id" TEXT NOT NULL,
        "readerId" UUID NOT NULL,
        "creatorId" UUID NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
        CONSTRAINT "Follows_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "Bookmark" (
        "id" TEXT NOT NULL,
        "readerId" UUID NOT NULL,
        "articleId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
        CONSTRAINT "Bookmark_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "Highlight" (
        "id" TEXT NOT NULL,
        "text" TEXT NOT NULL,
        "note" TEXT,
        "isPublic" BOOLEAN NOT NULL DEFAULT false,
        "isOfficial" BOOLEAN NOT NULL DEFAULT false,
        "upvotesCount" INTEGER NOT NULL DEFAULT 0,
        "readerId" UUID NOT NULL,
        "articleId" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
        CONSTRAINT "Highlight_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "AnnotationComment" (
        "id" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "highlightId" TEXT NOT NULL,
        "authorId" UUID NOT NULL,
    
        CONSTRAINT "AnnotationComment_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "AnnotationUpvote" (
        "id" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "highlightId" TEXT NOT NULL,
        "userId" UUID NOT NULL,
    
        CONSTRAINT "AnnotationUpvote_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "Letter" (
        "id" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "isPublic" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "senderId" UUID NOT NULL,
        "recipientId" UUID NOT NULL,
        "articleId" TEXT,
    
        CONSTRAINT "Letter_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "SocialLink" (
        "id" TEXT NOT NULL,
        "platform" TEXT NOT NULL,
        "url" TEXT NOT NULL,
        "order" INTEGER NOT NULL DEFAULT 0,
        "userId" UUID NOT NULL,
    
        CONSTRAINT "SocialLink_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "Category" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "slug" TEXT NOT NULL,
        "description" TEXT,
        "userId" UUID NOT NULL,
        "parentId" TEXT,
    
        CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "NavigationItem" (
        "id" TEXT NOT NULL,
        "label" TEXT NOT NULL,
        "url" TEXT,
        "order" INTEGER NOT NULL DEFAULT 0,
        "isExternal" BOOLEAN NOT NULL DEFAULT false,
        "userId" UUID NOT NULL,
        "parentId" TEXT,
    
        CONSTRAINT "NavigationItem_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "Media" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "slug" TEXT NOT NULL,
        "bio" TEXT,
        "logoUrl" TEXT,
        "subdomain" TEXT,
        "customDomain" TEXT,
        "accentColor" TEXT DEFAULT '#EE4B2B',
        "allowIndexing" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
    
        CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "MediaMember" (
        "id" TEXT NOT NULL,
        "mediaId" TEXT NOT NULL,
        "userId" UUID NOT NULL,
        "role" TEXT NOT NULL DEFAULT 'writer',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
        CONSTRAINT "MediaMember_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "CollaborationRequest" (
        "id" TEXT NOT NULL,
        "articleId" TEXT NOT NULL,
        "inviterId" UUID NOT NULL,
        "inviteeId" UUID NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'PENDING',
        "showOnPublicProfile" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
    
        CONSTRAINT "CollaborationRequest_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "Post" (
        "id" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "authorId" UUID NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        "tags" TEXT[],
        "imageUrl" TEXT,
        "visibility" TEXT NOT NULL DEFAULT 'public',
        "contentVisibility" "ContentVisibility" NOT NULL DEFAULT 'PUBLIC',
        "isDraft" BOOLEAN NOT NULL DEFAULT false,
        "scheduledAt" TIMESTAMP(3),
        "triggerWarning" TEXT,
        "isPinned" BOOLEAN NOT NULL DEFAULT false,
        "deletedAt" TIMESTAMP(3),
        "tierId" TEXT,
        "replyRestriction" TEXT NOT NULL DEFAULT 'everyone',
        "isHiddenByAuthor" BOOLEAN NOT NULL DEFAULT false,
        "likeCount" INTEGER NOT NULL DEFAULT 0,
        "repostCount" INTEGER NOT NULL DEFAULT 0,
        "replyCount" INTEGER NOT NULL DEFAULT 0,
        "parentId" TEXT,
        "rootId" TEXT,
        "repostId" TEXT,
    
        CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "Like" (
        "id" TEXT NOT NULL,
        "postId" TEXT NOT NULL,
        "userId" UUID NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
        CONSTRAINT "Like_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "Trend" (
        "id" TEXT NOT NULL,
        "hashtag" TEXT NOT NULL,
        "count" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
    
        CONSTRAINT "Trend_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "PartnerPromo" (
        "id" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "description" TEXT NOT NULL,
        "ctaText" TEXT,
        "ctaUrl" TEXT,
        "imageUrl" TEXT,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
    
        CONSTRAINT "PartnerPromo_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "ApiKey" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "keyPrefix" TEXT NOT NULL,
        "keyHash" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "lastUsedAt" TIMESTAMP(3),
        "userId" UUID NOT NULL,
    
        CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "TranslationAuditLog" (
        "id" TEXT NOT NULL,
        "key" TEXT NOT NULL,
        "lang" TEXT NOT NULL,
        "oldValue" TEXT,
        "newValue" TEXT,
        "authorId" UUID,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
        CONSTRAINT "TranslationAuditLog_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "ArticleComment" (
        "id" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        "articleId" TEXT NOT NULL,
        "authorId" UUID NOT NULL,
        "parentId" TEXT,
    
        CONSTRAINT "ArticleComment_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "Notification" (
        "id" TEXT NOT NULL,
        "recipientId" UUID NOT NULL,
        "senderId" UUID NOT NULL,
        "type" "NotificationType" NOT NULL,
        "thoughtId" TEXT,
        "articleId" TEXT,
        "commentId" TEXT,
        "isRead" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
        CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "NotificationPreference" (
        "id" TEXT NOT NULL,
        "userId" UUID NOT NULL,
        "emailLikes" BOOLEAN NOT NULL DEFAULT true,
        "pushLikes" BOOLEAN NOT NULL DEFAULT true,
        "emailReplies" BOOLEAN NOT NULL DEFAULT true,
        "pushReplies" BOOLEAN NOT NULL DEFAULT true,
        "emailMentions" BOOLEAN NOT NULL DEFAULT true,
        "pushMentions" BOOLEAN NOT NULL DEFAULT true,
        "emailFollows" BOOLEAN NOT NULL DEFAULT true,
        "pushFollows" BOOLEAN NOT NULL DEFAULT true,
        "emailReposts" BOOLEAN NOT NULL DEFAULT true,
        "pushReposts" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
    
        CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "MediaAttachment" (
        "id" TEXT NOT NULL,
        "thoughtId" TEXT NOT NULL,
        "type" TEXT NOT NULL DEFAULT 'IMAGE',
        "url" TEXT NOT NULL,
        "altText" TEXT,
        "width" INTEGER,
        "height" INTEGER,
        "order" INTEGER NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
        CONSTRAINT "MediaAttachment_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "StarterPack" (
        "id" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "description" TEXT,
        "icon" TEXT DEFAULT '🚀',
        "creatorId" UUID NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
    
        CONSTRAINT "StarterPack_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "StarterPackItem" (
        "id" TEXT NOT NULL,
        "starterPackId" TEXT NOT NULL,
        "userId" UUID NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
        CONSTRAINT "StarterPackItem_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "Poll" (
        "id" TEXT NOT NULL,
        "thoughtId" TEXT NOT NULL,
        "expiresAt" TIMESTAMP(3) NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
        CONSTRAINT "Poll_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "PollOption" (
        "id" TEXT NOT NULL,
        "pollId" TEXT NOT NULL,
        "text" TEXT NOT NULL,
        "order" INTEGER NOT NULL DEFAULT 0,
    
        CONSTRAINT "PollOption_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "PollVote" (
        "id" TEXT NOT NULL,
        "pollId" TEXT NOT NULL,
        "optionId" TEXT NOT NULL,
        "userId" UUID NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
        CONSTRAINT "PollVote_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "ModerationReport" (
        "id" TEXT NOT NULL,
        "reporterId" UUID NOT NULL,
        "targetId" TEXT NOT NULL,
        "targetType" TEXT NOT NULL,
        "reason" TEXT NOT NULL,
        "details" TEXT,
        "status" TEXT NOT NULL DEFAULT 'pending',
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
    
        CONSTRAINT "ModerationReport_pkey" PRIMARY KEY ("id")
    );
    
    -- CreateTable
    CREATE TABLE "_CoAuthors" (
        "A" TEXT NOT NULL,
        "B" UUID NOT NULL,
    
        CONSTRAINT "_CoAuthors_AB_pkey" PRIMARY KEY ("A","B")
    );
    
    -- CreateIndex
    CREATE INDEX "Recommendation_recommenderId_idx" ON "Recommendation"("recommenderId");
    
    -- CreateIndex
    CREATE INDEX "Recommendation_recommendedId_idx" ON "Recommendation"("recommendedId");
    
    -- CreateIndex
    CREATE UNIQUE INDEX "Recommendation_recommenderId_recommendedId_key" ON "Recommendation"("recommenderId", "recommendedId");
    
    -- CreateIndex
    CREATE INDEX "Tier_creatorId_idx" ON "Tier"("creatorId");
    
    -- CreateIndex
    CREATE UNIQUE INDEX "MutedWord_userId_word_key" ON "MutedWord"("userId", "word");
    
    -- CreateIndex
    CREATE UNIQUE INDEX "BlockedUser_creatorId_readerId_key" ON "BlockedUser"("creatorId", "readerId");
    
    -- CreateIndex
    CREATE INDEX "WalletTransaction_userId_createdAt_idx" ON "WalletTransaction"("userId", "createdAt");
    
    -- CreateIndex
    CREATE UNIQUE INDEX "Subscriber_stripeSubscriptionId_key" ON "Subscriber"("stripeSubscriptionId");
    
    -- CreateIndex
    CREATE INDEX "Subscriber_creatorId_email_status_idx" ON "Subscriber"("creatorId", "email", "status");
    
    -- CreateIndex
    CREATE INDEX "Subscriber_userId_creatorId_idx" ON "Subscriber"("userId", "creatorId");
    
    -- CreateIndex
    CREATE INDEX "Subscriber_stripeSubscriptionId_idx" ON "Subscriber"("stripeSubscriptionId");
    
    -- CreateIndex
    CREATE UNIQUE INDEX "Subscriber_email_creatorId_key" ON "Subscriber"("email", "creatorId");
    
    -- CreateIndex
    CREATE INDEX "Follows_creatorId_idx" ON "Follows"("creatorId");
    
    -- CreateIndex
    CREATE UNIQUE INDEX "Follows_readerId_creatorId_key" ON "Follows"("readerId", "creatorId");
    
    -- CreateIndex
    CREATE INDEX "Bookmark_articleId_idx" ON "Bookmark"("articleId");
    
    -- CreateIndex
    CREATE UNIQUE INDEX "Bookmark_readerId_articleId_key" ON "Bookmark"("readerId", "articleId");
    
    -- CreateIndex
    CREATE INDEX "Highlight_articleId_isPublic_idx" ON "Highlight"("articleId", "isPublic");
    
    -- CreateIndex
    CREATE INDEX "Highlight_articleId_isOfficial_idx" ON "Highlight"("articleId", "isOfficial");
    
    -- CreateIndex
    CREATE INDEX "Highlight_articleId_readerId_idx" ON "Highlight"("articleId", "readerId");
    
    -- CreateIndex
    CREATE INDEX "Highlight_readerId_idx" ON "Highlight"("readerId");
    
    -- CreateIndex
    CREATE INDEX "AnnotationComment_highlightId_createdAt_idx" ON "AnnotationComment"("highlightId", "createdAt");
    
    -- CreateIndex
    CREATE INDEX "AnnotationComment_authorId_idx" ON "AnnotationComment"("authorId");
    
    -- CreateIndex
    CREATE INDEX "AnnotationUpvote_userId_idx" ON "AnnotationUpvote"("userId");
    
    -- CreateIndex
    CREATE UNIQUE INDEX "AnnotationUpvote_highlightId_userId_key" ON "AnnotationUpvote"("highlightId", "userId");
    
    -- CreateIndex
    CREATE INDEX "Letter_recipientId_idx" ON "Letter"("recipientId");
    
    -- CreateIndex
    CREATE INDEX "Letter_senderId_idx" ON "Letter"("senderId");
    
    -- CreateIndex
    CREATE UNIQUE INDEX "Category_slug_userId_key" ON "Category"("slug", "userId");
    
    -- CreateIndex
    CREATE UNIQUE INDEX "Media_slug_key" ON "Media"("slug");
    
    -- CreateIndex
    CREATE UNIQUE INDEX "Media_subdomain_key" ON "Media"("subdomain");
    
    -- CreateIndex
    CREATE UNIQUE INDEX "Media_customDomain_key" ON "Media"("customDomain");
    
    -- CreateIndex
    CREATE INDEX "MediaMember_userId_idx" ON "MediaMember"("userId");
    
    -- CreateIndex
    CREATE INDEX "MediaMember_mediaId_idx" ON "MediaMember"("mediaId");
    
    -- CreateIndex
    CREATE UNIQUE INDEX "MediaMember_mediaId_userId_key" ON "MediaMember"("mediaId", "userId");
    
    -- CreateIndex
    CREATE INDEX "CollaborationRequest_inviteeId_status_idx" ON "CollaborationRequest"("inviteeId", "status");
    
    -- CreateIndex
    CREATE INDEX "CollaborationRequest_articleId_idx" ON "CollaborationRequest"("articleId");
    
    -- CreateIndex
    CREATE UNIQUE INDEX "CollaborationRequest_articleId_inviteeId_key" ON "CollaborationRequest"("articleId", "inviteeId");
    
    -- CreateIndex
    CREATE INDEX "Post_authorId_createdAt_idx" ON "Post"("authorId", "createdAt");
    
    -- CreateIndex
    CREATE INDEX "Post_deletedAt_isDraft_authorId_createdAt_idx" ON "Post"("deletedAt", "isDraft", "authorId", "createdAt");
    
    -- CreateIndex
    CREATE INDEX "Post_authorId_isDraft_updatedAt_idx" ON "Post"("authorId", "isDraft", "updatedAt");
    
    -- CreateIndex
    CREATE INDEX "Post_parentId_idx" ON "Post"("parentId");
    
    -- CreateIndex
    CREATE INDEX "Post_rootId_idx" ON "Post"("rootId");
    
    -- CreateIndex
    CREATE INDEX "Post_repostId_idx" ON "Post"("repostId");
    
    -- CreateIndex
    CREATE INDEX "Post_deletedAt_isDraft_idx" ON "Post"("deletedAt", "isDraft");
    
    -- CreateIndex
    CREATE INDEX "Like_userId_idx" ON "Like"("userId");
    
    -- CreateIndex
    CREATE UNIQUE INDEX "Like_postId_userId_key" ON "Like"("postId", "userId");
    
    -- CreateIndex
    CREATE UNIQUE INDEX "Trend_hashtag_key" ON "Trend"("hashtag");
    
    -- CreateIndex
    CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");
    
    -- CreateIndex
    CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");
    
    -- CreateIndex
    CREATE INDEX "ApiKey_keyHash_idx" ON "ApiKey"("keyHash");
    
    -- CreateIndex
    CREATE INDEX "ArticleComment_articleId_createdAt_idx" ON "ArticleComment"("articleId", "createdAt");
    
    -- CreateIndex
    CREATE INDEX "ArticleComment_articleId_parentId_createdAt_idx" ON "ArticleComment"("articleId", "parentId", "createdAt");
    
    -- CreateIndex
    CREATE INDEX "ArticleComment_authorId_idx" ON "ArticleComment"("authorId");
    
    -- CreateIndex
    CREATE INDEX "ArticleComment_parentId_idx" ON "ArticleComment"("parentId");
    
    -- CreateIndex
    CREATE INDEX "Notification_recipientId_isRead_createdAt_idx" ON "Notification"("recipientId", "isRead", "createdAt");
    
    -- CreateIndex
    CREATE INDEX "Notification_thoughtId_idx" ON "Notification"("thoughtId");
    
    -- CreateIndex
    CREATE INDEX "Notification_senderId_idx" ON "Notification"("senderId");
    
    -- CreateIndex
    CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");
    
    -- CreateIndex
    CREATE INDEX "MediaAttachment_thoughtId_order_idx" ON "MediaAttachment"("thoughtId", "order");
    
    -- CreateIndex
    CREATE INDEX "StarterPack_creatorId_idx" ON "StarterPack"("creatorId");
    
    -- CreateIndex
    CREATE INDEX "StarterPackItem_starterPackId_idx" ON "StarterPackItem"("starterPackId");
    
    -- CreateIndex
    CREATE INDEX "StarterPackItem_userId_idx" ON "StarterPackItem"("userId");
    
    -- CreateIndex
    CREATE UNIQUE INDEX "StarterPackItem_starterPackId_userId_key" ON "StarterPackItem"("starterPackId", "userId");
    
    -- CreateIndex
    CREATE UNIQUE INDEX "Poll_thoughtId_key" ON "Poll"("thoughtId");
    
    -- CreateIndex
    CREATE INDEX "PollOption_pollId_order_idx" ON "PollOption"("pollId", "order");
    
    -- CreateIndex
    CREATE INDEX "PollVote_optionId_idx" ON "PollVote"("optionId");
    
    -- CreateIndex
    CREATE INDEX "PollVote_userId_idx" ON "PollVote"("userId");
    
    -- CreateIndex
    CREATE UNIQUE INDEX "PollVote_pollId_userId_key" ON "PollVote"("pollId", "userId");
    
    -- CreateIndex
    CREATE INDEX "ModerationReport_targetId_targetType_idx" ON "ModerationReport"("targetId", "targetType");
    
    -- CreateIndex
    CREATE INDEX "ModerationReport_reporterId_idx" ON "ModerationReport"("reporterId");
    
    -- CreateIndex
    CREATE INDEX "ModerationReport_status_idx" ON "ModerationReport"("status");
    
    -- CreateIndex
    CREATE INDEX "_CoAuthors_B_index" ON "_CoAuthors"("B");
    
    -- CreateIndex
    CREATE INDEX "Article_slug_idx" ON "Article"("slug");
    
    -- CreateIndex
    CREATE INDEX "Article_authorId_published_createdAt_idx" ON "Article"("authorId", "published", "createdAt");
    
    -- CreateIndex
    CREATE INDEX "Article_authorId_createdAt_idx" ON "Article"("authorId", "createdAt");
    
    -- CreateIndex
    CREATE INDEX "Article_published_createdAt_idx" ON "Article"("published", "createdAt");
    
    -- CreateIndex
    CREATE INDEX "Article_categoryId_idx" ON "Article"("categoryId");
    
    -- CreateIndex
    CREATE INDEX "Article_mediaId_idx" ON "Article"("mediaId");
    
    -- CreateIndex
    CREATE INDEX "Article_status_scheduledAt_idx" ON "Article"("status", "scheduledAt");
    
    -- CreateIndex
    CREATE UNIQUE INDEX "Article_authorId_slug_key" ON "Article"("authorId", "slug");
    
    -- CreateIndex
    CREATE UNIQUE INDEX "User_subdomain_key" ON "User"("subdomain");
    
    -- CreateIndex
    CREATE UNIQUE INDEX "User_customDomain_key" ON "User"("customDomain");
    
    -- AddForeignKey
    ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_recommenderId_fkey" FOREIGN KEY ("recommenderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_recommendedId_fkey" FOREIGN KEY ("recommendedId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "Tier" ADD CONSTRAINT "Tier_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "MutedWord" ADD CONSTRAINT "MutedWord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "BlockedUser" ADD CONSTRAINT "BlockedUser_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "BlockedUser" ADD CONSTRAINT "BlockedUser_readerId_fkey" FOREIGN KEY ("readerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "Subscriber" ADD CONSTRAINT "Subscriber_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "Subscriber" ADD CONSTRAINT "Subscriber_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "Subscriber" ADD CONSTRAINT "Subscriber_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "Tier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "Follows" ADD CONSTRAINT "Follows_readerId_fkey" FOREIGN KEY ("readerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "Follows" ADD CONSTRAINT "Follows_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_readerId_fkey" FOREIGN KEY ("readerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "Bookmark" ADD CONSTRAINT "Bookmark_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_readerId_fkey" FOREIGN KEY ("readerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "Highlight" ADD CONSTRAINT "Highlight_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "AnnotationComment" ADD CONSTRAINT "AnnotationComment_highlightId_fkey" FOREIGN KEY ("highlightId") REFERENCES "Highlight"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "AnnotationComment" ADD CONSTRAINT "AnnotationComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "AnnotationUpvote" ADD CONSTRAINT "AnnotationUpvote_highlightId_fkey" FOREIGN KEY ("highlightId") REFERENCES "Highlight"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "AnnotationUpvote" ADD CONSTRAINT "AnnotationUpvote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "Letter" ADD CONSTRAINT "Letter_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "Letter" ADD CONSTRAINT "Letter_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "Letter" ADD CONSTRAINT "Letter_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "SocialLink" ADD CONSTRAINT "SocialLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "NavigationItem" ADD CONSTRAINT "NavigationItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "NavigationItem" ADD CONSTRAINT "NavigationItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "NavigationItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "Article" ADD CONSTRAINT "Article_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "Article" ADD CONSTRAINT "Article_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "Article" ADD CONSTRAINT "Article_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "Article" ADD CONSTRAINT "Article_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "Tier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "MediaMember" ADD CONSTRAINT "MediaMember_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "MediaMember" ADD CONSTRAINT "MediaMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "CollaborationRequest" ADD CONSTRAINT "CollaborationRequest_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "CollaborationRequest" ADD CONSTRAINT "CollaborationRequest_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "CollaborationRequest" ADD CONSTRAINT "CollaborationRequest_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "Post" ADD CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "Post" ADD CONSTRAINT "Post_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "Tier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "Post" ADD CONSTRAINT "Post_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "Post" ADD CONSTRAINT "Post_rootId_fkey" FOREIGN KEY ("rootId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "Post" ADD CONSTRAINT "Post_repostId_fkey" FOREIGN KEY ("repostId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "Like" ADD CONSTRAINT "Like_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "Like" ADD CONSTRAINT "Like_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "TranslationAuditLog" ADD CONSTRAINT "TranslationAuditLog_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "ArticleComment" ADD CONSTRAINT "ArticleComment_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "ArticleComment" ADD CONSTRAINT "ArticleComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "ArticleComment" ADD CONSTRAINT "ArticleComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ArticleComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "Notification" ADD CONSTRAINT "Notification_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "Notification" ADD CONSTRAINT "Notification_thoughtId_fkey" FOREIGN KEY ("thoughtId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "Notification" ADD CONSTRAINT "Notification_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "Notification" ADD CONSTRAINT "Notification_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "ArticleComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "MediaAttachment" ADD CONSTRAINT "MediaAttachment_thoughtId_fkey" FOREIGN KEY ("thoughtId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "StarterPack" ADD CONSTRAINT "StarterPack_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "StarterPackItem" ADD CONSTRAINT "StarterPackItem_starterPackId_fkey" FOREIGN KEY ("starterPackId") REFERENCES "StarterPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "StarterPackItem" ADD CONSTRAINT "StarterPackItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "Poll" ADD CONSTRAINT "Poll_thoughtId_fkey" FOREIGN KEY ("thoughtId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "PollOption" ADD CONSTRAINT "PollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "Poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "PollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "ModerationReport" ADD CONSTRAINT "ModerationReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "_CoAuthors" ADD CONSTRAINT "_CoAuthors_A_fkey" FOREIGN KEY ("A") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
    -- AddForeignKey
    ALTER TABLE "_CoAuthors" ADD CONSTRAINT "_CoAuthors_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    
  END IF;
END $$;
