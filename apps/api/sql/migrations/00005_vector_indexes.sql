-- =====================================================================
-- 📐 Index vectoriels HNSW (pgvector) pour les recherches sémantiques
-- =====================================================================
-- Les recherches « recommandations sémantiques » (home/widgets, articles
-- similaires) utilisent la distance cosinus (`<=>`). Sans index, chaque
-- requête scanne toute la table. HNSW (Approximate Nearest Neighbour)
-- rend ces requêtes rapides même à plusieurs milliers de vecteurs.
--
-- vector_cosine_ops : adéquat car les vecteurs jina-embeddings-v3 (512d)
-- sont comparés en similarité cosinus (1 - (a.embedding <=> $1::vector)).
--
-- Trois colonnes : Article.embedding, User.embedding, Post.embedding.

-- +goose Up
CREATE INDEX IF NOT EXISTS "Article_embedding_hnsw_idx"
  ON "Article" USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS "User_embedding_hnsw_idx"
  ON "User" USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS "Post_embedding_hnsw_idx"
  ON "Post" USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- +goose Down
DROP INDEX IF EXISTS "Article_embedding_hnsw_idx";
DROP INDEX IF EXISTS "User_embedding_hnsw_idx";
DROP INDEX IF EXISTS "Post_embedding_hnsw_idx";