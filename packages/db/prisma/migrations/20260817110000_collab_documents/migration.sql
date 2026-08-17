-- =====================================================================
-- 🧵 Table collab_documents — Persistance des documents Yjs (Hocuspocus)
-- =====================================================================
-- Stocke l'état binaire (update Yjs) de chaque document de collaboration.
-- document_name suit le format `article:{uuid}`.
-- =====================================================================

-- Créer la table
CREATE TABLE "collab_documents" (
    "document_name" TEXT NOT NULL,
    "state" BYTEA NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "collab_documents_pkey" PRIMARY KEY ("document_name")
);

-- Index sur la fraîcheur (nettoyage / monitoring)
CREATE INDEX "collab_documents_updated_at_idx" ON "collab_documents" ("updated_at");
