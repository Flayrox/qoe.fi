-- =====================================================================
-- 🐘 init.sql — Script d'initialisation PostgreSQL pour qoe.fi
-- =====================================================================
-- Ce script s'exécute AUTOMATIQUEMENT au premier démarrage du container
-- Postgres (uniquement si le volume de données est vide).
-- C'est l'endroit parfait pour :
--   - Activer les extensions nécessaires (pgvector, etc.)
--   - Créer des rôles/permissions custom
--   - Insérer des données de seed minimales
--
-- 📖 Docker exécute tous les fichiers .sql / .sh dans
--    /docker-entrypoint-initdb.d/ par ordre alphabétique au premier boot.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 🔌 Activation des extensions PostgreSQL
-- ---------------------------------------------------------------------
-- L'image pgvector/pgvector inclut déjà l'extension vector, on l'active.
-- Cette extension est utilisée par Prisma (cf. schema.prisma:10)
-- CREATE EXTENSION IF NOT EXISTS vector;
-- ⚠️ Note : avec pgvector, l'extension est déjà activée par défaut,
--          donc ce n'est pas nécessaire de le refaire ici.

-- ---------------------------------------------------------------------
-- 📊 Base dédiée à Umami (analytics)
-- ---------------------------------------------------------------------
-- Umami a besoin de sa PROPRE base : sa migration Prisma refuse une base
-- non vide (P3005), il ne doit pas partager la base de l'application.
SELECT 'CREATE DATABASE umami'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'umami')\gexec

-- ---------------------------------------------------------------------
-- ⚙️ Configuration des performances (optionnel)
-- ---------------------------------------------------------------------
-- Tu peux ajuster ces valeurs selon la RAM de ton VPS.
-- Décommente si tu veux les appliquer au démarrage de chaque session.

-- ALTER SYSTEM SET shared_buffers = '256MB';            -- 25% de la RAM
-- ALTER SYSTEM SET effective_cache_size = '1GB';        -- 70% de la RAM
-- ALTER SYSTEM SET work_mem = '16MB';                   -- Pour les sorts
-- ALTER SYSTEM SET maintenance_work_mem = '128MB';      -- Pour VACUUM, index
-- ALTER SYSTEM SET random_page_cost = 1.1;              -- Optimisé pour SSD
-- ALTER SYSTEM SET max_connections = 200;               -- Connexions max

-- SELECT pg_reload_conf();  -- Applique la nouvelle config

-- ---------------------------------------------------------------------
-- 📊 Index utiles pour la recherche (à activer selon les besoins)
-- ---------------------------------------------------------------------
-- Ces index accéléreront les requêtes courantes de qoe.fi.
-- ⚠️ À décommenter UNIQUEMENT quand les tables existent (après migrations Prisma)
--      car sinon ça échouera.

-- CREATE INDEX IF NOT EXISTS idx_articles_author_id ON "Article"("authorId");
-- CREATE INDEX IF NOT EXISTS idx_articles_status ON "Article"("status");
-- CREATE INDEX IF NOT EXISTS idx_articles_published_at ON "Article"("publishedAt" DESC);
-- CREATE INDEX IF NOT EXISTS idx_subscribers_creator_id ON "Subscriber"("creatorId");
-- CREATE INDEX IF NOT EXISTS idx_highlights_user_id ON "Highlight"("userId");
-- CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON "Bookmark"("userId");

-- =====================================================================
-- ✅ Fin du script
-- =====================================================================
-- Ce script est idempotent (peut être exécuté plusieurs fois sans danger).
-- Pour vérifier que pgvector est bien installé :
--   docker compose exec db psql -U qoe -d qoe -c "SELECT * FROM pg_extension WHERE extname = 'vector';"
-- =====================================================================
