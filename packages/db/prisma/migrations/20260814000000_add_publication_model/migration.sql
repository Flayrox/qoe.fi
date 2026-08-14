-- CreateEnum
CREATE TYPE "PublicationType" AS ENUM ('PERSONAL', 'MEDIA');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'MEDIA_INVITE';
ALTER TYPE "NotificationType" ADD VALUE 'MEDIA_MEMBER_JOINED';
ALTER TYPE "NotificationType" ADD VALUE 'MEDIA_ARTICLE_PUBLISHED';
ALTER TYPE "NotificationType" ADD VALUE 'MEDIA_MENTION';

-- DropForeignKey
ALTER TABLE "Article" DROP CONSTRAINT "Article_mediaId_fkey";
ALTER TABLE "Category" DROP CONSTRAINT "Category_userId_fkey";
ALTER TABLE "Follows" DROP CONSTRAINT "Follows_creatorId_fkey";
ALTER TABLE "NavigationItem" DROP CONSTRAINT "NavigationItem_userId_fkey";
ALTER TABLE "Recommendation" DROP CONSTRAINT "Recommendation_recommendedId_fkey";
ALTER TABLE "Recommendation" DROP CONSTRAINT "Recommendation_recommenderId_fkey";
ALTER TABLE "SocialLink" DROP CONSTRAINT "SocialLink_userId_fkey";
ALTER TABLE "StarterPack" DROP CONSTRAINT "StarterPack_creatorId_fkey";
ALTER TABLE "Subscriber" DROP CONSTRAINT "Subscriber_creatorId_fkey";
ALTER TABLE "Tier" DROP CONSTRAINT "Tier_creatorId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "Article_authorId_slug_key";
DROP INDEX IF EXISTS "Article_mediaId_idx";
DROP INDEX IF EXISTS "Category_slug_userId_key";
DROP INDEX IF EXISTS "Follows_creatorId_idx";
DROP INDEX IF EXISTS "Follows_readerId_creatorId_key";
DROP INDEX IF EXISTS "Media_customDomain_key";
DROP INDEX IF EXISTS "Media_slug_key";
DROP INDEX IF EXISTS "Media_subdomain_key";
DROP INDEX IF EXISTS "StarterPack_creatorId_idx";
DROP INDEX IF EXISTS "Subscriber_creatorId_email_status_idx";
DROP INDEX IF EXISTS "Subscriber_email_creatorId_key";
DROP INDEX IF EXISTS "Subscriber_userId_creatorId_idx";
DROP INDEX IF EXISTS "Tier_creatorId_idx";
DROP INDEX IF EXISTS "User_customDomain_key";
DROP INDEX IF EXISTS "User_subdomain_key";

-- CreateTable
CREATE TABLE "Publication" (
    "id" TEXT NOT NULL,
    "type" "PublicationType" NOT NULL DEFAULT 'PERSONAL',
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "bio" TEXT,
    "logoUrl" TEXT,
    "isCertified" BOOLEAN NOT NULL DEFAULT false,
    "subdomain" TEXT,
    "customDomain" TEXT,
    "umamiWebsiteId" TEXT,
    "accentColor" TEXT,
    "fontFamily" TEXT,
    "heroText" TEXT,
    "headerImageUrl" TEXT,
    "footerText" TEXT,
    "themeMode" TEXT DEFAULT 'system',
    "layoutStyle" TEXT DEFAULT 'minimal',
    "allowIndexing" BOOLEAN NOT NULL DEFAULT true,
    "allowPublicAnnotations" BOOLEAN NOT NULL DEFAULT true,
    "allowComments" BOOLEAN NOT NULL DEFAULT true,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "supportUrl" TEXT,
    "stripeAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Publication_pkey" PRIMARY KEY ("id")
);

-- Unique indexes requis pour les backfills (ON CONFLICT)
CREATE UNIQUE INDEX "Publication_slug_key" ON "Publication"("slug");
CREATE UNIQUE INDEX "Publication_subdomain_key" ON "Publication"("subdomain");
CREATE UNIQUE INDEX "Publication_customDomain_key" ON "Publication"("customDomain");

-- Backfill: 1 publication PERSONAL par utilisateur existant
INSERT INTO "Publication" (
    "id", "type", "name", "slug", "logoUrl", "isCertified", "subdomain", "customDomain",
    "umamiWebsiteId", "accentColor", "fontFamily", "heroText", "headerImageUrl", "footerText",
    "themeMode", "layoutStyle", "allowIndexing", "allowPublicAnnotations", "allowComments",
    "seoTitle", "seoDescription", "supportUrl", "stripeAccountId", "createdAt", "updatedAt"
)
SELECT
    'pub_' || replace(u."id"::text, '-', ''),
    'PERSONAL',
    COALESCE(u."name", u."username", 'Créateur'),
    COALESCE(u."username", 'user-' || replace(u."id"::text, '-', '')),
    u."logoUrl",
    u."isCertified",
    u."subdomain",
    u."customDomain",
    u."umamiWebsiteId",
    u."accentColor",
    u."fontFamily",
    u."heroText",
    u."headerImageUrl",
    u."footerText",
    u."themeMode",
    u."layoutStyle",
    u."allowIndexing",
    u."allowPublicAnnotations",
    u."allowComments",
    u."seoTitle",
    u."seoDescription",
    u."supportUrl",
    u."stripeAccountId",
    COALESCE(u."createdAt", NOW()),
    COALESCE(u."updatedAt", NOW())
FROM "User" u
ON CONFLICT ("slug") DO NOTHING;

-- Backfill: 1 publication MEDIA par Media existant (avant suppression des colonnes)
INSERT INTO "Publication" (
    "id", "type", "name", "slug", "bio", "logoUrl", "isCertified", "subdomain", "customDomain",
    "accentColor", "allowIndexing", "createdAt", "updatedAt"
)
SELECT
    'pub_' || replace(m."id", '-', ''),
    'MEDIA',
    m."name",
    m."slug",
    m."bio",
    m."logoUrl",
    false,
    m."subdomain",
    m."customDomain",
    m."accentColor",
    m."allowIndexing",
    m."createdAt",
    m."updatedAt"
FROM "Media" m
ON CONFLICT ("slug") DO NOTHING;

-- User: relier chaque utilisateur à sa publication personnelle
ALTER TABLE "User" ADD COLUMN "publicationId" TEXT;
UPDATE "User" u
SET "publicationId" = 'pub_' || replace(u."id"::text, '-', '')
WHERE EXISTS (SELECT 1 FROM "Publication" p WHERE p.id = 'pub_' || replace(u."id"::text, '-', ''));

-- Media: relier + retirer les colonnes déplacées vers Publication
ALTER TABLE "Media" ADD COLUMN "publicationId" TEXT;
UPDATE "Media" m
SET "publicationId" = 'pub_' || replace(m."id", '-', '')
WHERE EXISTS (SELECT 1 FROM "Publication" p WHERE p.id = 'pub_' || replace(m."id", '-', ''));
ALTER TABLE "Media" ALTER COLUMN "publicationId" SET NOT NULL;
ALTER TABLE "Media" DROP COLUMN "accentColor",
    DROP COLUMN "allowIndexing",
    DROP COLUMN "bio",
    DROP COLUMN "customDomain",
    DROP COLUMN "logoUrl",
    DROP COLUMN "name",
    DROP COLUMN "slug",
    DROP COLUMN "subdomain";

-- MediaMember: RBAC + timestamps
ALTER TABLE "MediaMember" ADD COLUMN "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "permissions" TEXT[],
    ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active',
    ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "MediaMember" SET "updatedAt" = "createdAt";
ALTER TABLE "MediaMember" ALTER COLUMN "updatedAt" SET NOT NULL;

-- Article: mediaId -> publicationId (publication personnelle de l'auteur, ou celle du media si défini)
ALTER TABLE "Article" ADD COLUMN "publicationId" TEXT;
UPDATE "Article" a
SET "publicationId" = COALESCE(
    (SELECT 'pub_' || replace(m."id", '-', '') FROM "Media" m WHERE m.id = a."mediaId"),
    'pub_' || replace(a."authorId"::text, '-', '')
)
WHERE EXISTS (SELECT 1 FROM "Publication" p WHERE p.id = COALESCE(
    (SELECT 'pub_' || replace(m."id", '-', '') FROM "Media" m WHERE m.id = a."mediaId"),
    'pub_' || replace(a."authorId"::text, '-', '')
));
ALTER TABLE "Article" ALTER COLUMN "publicationId" SET NOT NULL;
ALTER TABLE "Article" DROP COLUMN "mediaId";

-- Category / NavigationItem / SocialLink: userId -> publicationId
ALTER TABLE "Category" ADD COLUMN "publicationId" TEXT;
UPDATE "Category" c SET "publicationId" = 'pub_' || replace(c."userId"::text, '-', '');
ALTER TABLE "Category" ALTER COLUMN "publicationId" SET NOT NULL;
ALTER TABLE "Category" DROP COLUMN "userId";

ALTER TABLE "NavigationItem" ADD COLUMN "publicationId" TEXT;
UPDATE "NavigationItem" n SET "publicationId" = 'pub_' || replace(n."userId"::text, '-', '');
ALTER TABLE "NavigationItem" ALTER COLUMN "publicationId" SET NOT NULL;
ALTER TABLE "NavigationItem" DROP COLUMN "userId";

ALTER TABLE "SocialLink" ADD COLUMN "publicationId" TEXT;
UPDATE "SocialLink" s SET "publicationId" = 'pub_' || replace(s."userId"::text, '-', '');
ALTER TABLE "SocialLink" ALTER COLUMN "publicationId" SET NOT NULL;
ALTER TABLE "SocialLink" DROP COLUMN "userId";

-- Follows: creatorId -> publicationId
ALTER TABLE "Follows" ADD COLUMN "publicationId" TEXT;
UPDATE "Follows" f SET "publicationId" = 'pub_' || replace(f."creatorId"::text, '-', '');
ALTER TABLE "Follows" ALTER COLUMN "publicationId" SET NOT NULL;
ALTER TABLE "Follows" DROP COLUMN "creatorId";

-- Subscriber: creatorId -> publicationId
ALTER TABLE "Subscriber" ADD COLUMN "publicationId" TEXT;
UPDATE "Subscriber" s SET "publicationId" = 'pub_' || replace(s."creatorId"::text, '-', '');
ALTER TABLE "Subscriber" ALTER COLUMN "publicationId" SET NOT NULL;
ALTER TABLE "Subscriber" DROP COLUMN "creatorId";

-- Tier: creatorId -> publicationId
ALTER TABLE "Tier" ADD COLUMN "publicationId" TEXT;
UPDATE "Tier" t SET "publicationId" = 'pub_' || replace(t."creatorId"::text, '-', '');
ALTER TABLE "Tier" ALTER COLUMN "publicationId" SET NOT NULL;
ALTER TABLE "Tier" DROP COLUMN "creatorId";

-- StarterPack: creatorId -> publicationId
ALTER TABLE "StarterPack" ADD COLUMN "publicationId" TEXT;
UPDATE "StarterPack" s SET "publicationId" = 'pub_' || replace(s."creatorId"::text, '-', '');
ALTER TABLE "StarterPack" ALTER COLUMN "publicationId" SET NOT NULL;
ALTER TABLE "StarterPack" DROP COLUMN "creatorId";

-- Recommendation: ids User -> ids Publication
ALTER TABLE "Recommendation" ALTER COLUMN "recommenderId" SET DATA TYPE TEXT,
    ALTER COLUMN "recommendedId" SET DATA TYPE TEXT;
UPDATE "Recommendation" r
SET "recommenderId" = 'pub_' || replace(r."recommenderId", '-', ''),
    "recommendedId" = 'pub_' || replace(r."recommendedId", '-', '');

-- Notification: contexte publication optionnel
ALTER TABLE "Notification" ADD COLUMN "publicationId" TEXT;

-- CreateTable MediaInvite
CREATE TABLE "MediaInvite" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "inviterId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'writer',
    "token" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable MediaAuditLog
CREATE TABLE "MediaAuditLog" (
    "id" TEXT NOT NULL,
    "mediaId" TEXT NOT NULL,
    "actorId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Publication_type_idx" ON "Publication"("type");
CREATE UNIQUE INDEX "MediaInvite_token_key" ON "MediaInvite"("token");
CREATE INDEX "MediaInvite_mediaId_idx" ON "MediaInvite"("mediaId");
CREATE INDEX "MediaInvite_email_idx" ON "MediaInvite"("email");
CREATE INDEX "MediaInvite_token_idx" ON "MediaInvite"("token");
CREATE INDEX "MediaAuditLog_mediaId_createdAt_idx" ON "MediaAuditLog"("mediaId", "createdAt");
CREATE INDEX "Article_publicationId_published_createdAt_idx" ON "Article"("publicationId", "published", "createdAt");
CREATE UNIQUE INDEX "Article_publicationId_slug_key" ON "Article"("publicationId", "slug");
CREATE INDEX "Category_publicationId_idx" ON "Category"("publicationId");
CREATE UNIQUE INDEX "Category_slug_publicationId_key" ON "Category"("slug", "publicationId");
CREATE INDEX "Follows_publicationId_idx" ON "Follows"("publicationId");
CREATE UNIQUE INDEX "Follows_readerId_publicationId_key" ON "Follows"("readerId", "publicationId");
CREATE UNIQUE INDEX "Media_publicationId_key" ON "Media"("publicationId");
CREATE INDEX "NavigationItem_publicationId_idx" ON "NavigationItem"("publicationId");
CREATE INDEX "Notification_publicationId_idx" ON "Notification"("publicationId");
CREATE INDEX "SocialLink_publicationId_idx" ON "SocialLink"("publicationId");
CREATE INDEX "StarterPack_publicationId_idx" ON "StarterPack"("publicationId");
CREATE INDEX "Subscriber_publicationId_email_status_idx" ON "Subscriber"("publicationId", "email", "status");
CREATE INDEX "Subscriber_userId_publicationId_idx" ON "Subscriber"("userId", "publicationId");
CREATE UNIQUE INDEX "Subscriber_email_publicationId_key" ON "Subscriber"("email", "publicationId");
CREATE INDEX "Tier_publicationId_idx" ON "Tier"("publicationId");
CREATE UNIQUE INDEX "User_publicationId_key" ON "User"("publicationId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_recommenderId_fkey" FOREIGN KEY ("recommenderId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Recommendation" ADD CONSTRAINT "Recommendation_recommendedId_fkey" FOREIGN KEY ("recommendedId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Tier" ADD CONSTRAINT "Tier_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Subscriber" ADD CONSTRAINT "Subscriber_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Follows" ADD CONSTRAINT "Follows_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SocialLink" ADD CONSTRAINT "SocialLink_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Category" ADD CONSTRAINT "Category_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NavigationItem" ADD CONSTRAINT "NavigationItem_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Article" ADD CONSTRAINT "Article_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Media" ADD CONSTRAINT "Media_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaInvite" ADD CONSTRAINT "MediaInvite_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaInvite" ADD CONSTRAINT "MediaInvite_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaAuditLog" ADD CONSTRAINT "MediaAuditLog_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaAuditLog" ADD CONSTRAINT "MediaAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StarterPack" ADD CONSTRAINT "StarterPack_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
