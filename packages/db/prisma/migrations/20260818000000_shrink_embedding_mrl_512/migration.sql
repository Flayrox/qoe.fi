-- MRL (Matryoshka) : jina-embeddings-v3 peut être tronqué à 512 dimensions
-- avec une perte de qualité négligeable. On repart de zéro (les vecteurs
-- 1024 sont recalculés par le backfill — worker + cmd/backfill).

-- 1) On retire l'index HNSW (incompatible avec le changement de dimension).
DROP INDEX IF EXISTS "Article_embedding_idx";
DROP INDEX IF EXISTS "User_embedding_idx";

-- 2) On vide les vecteurs existants (ils seront re-générés à 512 dims).
UPDATE "Article" SET "embedding" = NULL WHERE "embedding" IS NOT NULL;
UPDATE "User"    SET "embedding" = NULL WHERE "embedding" IS NOT NULL;

-- 3) Redimensionnement des colonnes.
ALTER TABLE "Article" ALTER COLUMN "embedding" TYPE vector(512);
ALTER TABLE "User"    ALTER COLUMN "embedding" TYPE vector(512);

-- 4) Recréation de l'index HNSW (approximate nearest neighbor, cosine).
CREATE INDEX "Article_embedding_idx" ON "Article" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX "User_embedding_idx"    ON "User"    USING hnsw ("embedding" vector_cosine_ops);
