-- Passages des embeddings à 1024 dimensions (jina-embeddings-v3, auto-hébergé).
-- Les colonnes sont vides (aucun pipeline ne les a jamais remplies), le
-- redimensionnement est donc sans perte de données.

ALTER TABLE "User"    ALTER COLUMN "embedding" TYPE vector(1024);
ALTER TABLE "Article" ALTER COLUMN "embedding" TYPE vector(1024);

-- Index HNSW (approximate nearest neighbor, cosine) pour la recherche
-- sémantique et les « articles similaires ».
CREATE INDEX IF NOT EXISTS "Article_embedding_idx" ON "Article" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX IF NOT EXISTS "User_embedding_idx"    ON "User"    USING hnsw ("embedding" vector_cosine_ops);
