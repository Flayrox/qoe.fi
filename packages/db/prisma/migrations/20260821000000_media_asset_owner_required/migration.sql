-- CreateEnum
CREATE TYPE "MediaAssetStatus" AS ENUM ('DRAFT_ORPHAN', 'ATTACHED', 'SOFT_DELETED', 'PURGED');

-- CreateEnum
CREATE TYPE "MediaAssetTargetType" AS ENUM ('ARTICLE_COVER', 'ARTICLE_BODY', 'THOUGHT_ATTACHMENT', 'USER_AVATAR', 'USER_BANNER', 'PUBLICATION_LOGO', 'PUBLICATION_BANNER', 'SHARED');

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "bucket" TEXT NOT NULL DEFAULT 'articles-media',
    "mimeType" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sizeBytes" INTEGER NOT NULL,
    "blurhash" TEXT,
    "isNsfw" BOOLEAN NOT NULL DEFAULT false,
    "isSensitive" BOOLEAN NOT NULL DEFAULT false,
    "safetyScores" JSONB,
    "moderatedAt" TIMESTAMP(3),
    "status" "MediaAssetStatus" NOT NULL DEFAULT 'DRAFT_ORPHAN',
    "targetType" "MediaAssetTargetType" NOT NULL DEFAULT 'SHARED',
    -- Un media a TOUJOURS un propriétaire (userId ou publicationId).
    "ownerId" TEXT NOT NULL,
    "attachedToId" TEXT,
    "purgeDueAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MediaAsset_sha256_idx" ON "MediaAsset"("sha256");

-- CreateIndex
CREATE INDEX "MediaAsset_status_purgeDueAt_idx" ON "MediaAsset"("status", "purgeDueAt");

-- CreateIndex
CREATE INDEX "MediaAsset_ownerId_idx" ON "MediaAsset"("ownerId");

-- CreateIndex
CREATE INDEX "MediaAsset_attachedToId_idx" ON "MediaAsset"("attachedToId");
