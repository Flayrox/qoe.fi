-- +goose Up
-- 🧹 Suppression complète des starter-packs (fonctionnalité retirée).
-- Les follows créés via les packs restent acquis (lignes Follow intactes).
DROP TABLE IF EXISTS "StarterPackItem" CASCADE;
DROP TABLE IF EXISTS "StarterPack" CASCADE;

-- +goose Down
CREATE TABLE IF NOT EXISTS "StarterPack" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT DEFAULT '🚀',
    "publicationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StarterPack_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "StarterPackItem" (
    "id" TEXT NOT NULL,
    "starterPackId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StarterPackItem_pkey" PRIMARY KEY ("id")
);
