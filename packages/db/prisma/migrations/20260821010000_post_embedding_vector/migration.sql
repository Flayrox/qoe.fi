-- La colonne "Post".embedding (vector(512)) était déclarée dans schema.prisma
-- mais n'a jamais été créée par une migration : l'indexation des pensées
-- échouait avec `column "embedding" of relation "Post" does not exist`.
-- On l'ajoute, alignée sur Article/User (MRL jina-embeddings-v3, 512 dims).

ALTER TABLE "Post" ADD COLUMN "embedding" vector(512);

CREATE INDEX "Post_embedding_idx" ON "Post" USING hnsw ("embedding" vector_cosine_ops);
