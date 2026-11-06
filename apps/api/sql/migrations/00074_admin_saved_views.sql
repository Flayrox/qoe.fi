-- =====================================================================
-- 00074_admin_saved_views.sql — vues sauvegardées d'équipe en base
-- =====================================================================
-- Persistance serveur des combinaisons filtres + tri + colonnes + densité.
-- Permet à un opérateur de retrouver ses vues personnalisées sur n'importe
-- quelle machine et de partager ses vues d'exploitation avec l'équipe staff.
-- =====================================================================

-- +goose Up
CREATE TABLE IF NOT EXISTS "AdminSavedView" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
    "resource" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isShared" BOOLEAN NOT NULL DEFAULT FALSE,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT "AdminSavedView_user_resource_name_uniq" UNIQUE ("userId", "resource", "name")
);

CREATE INDEX IF NOT EXISTS "idx_admin_saved_view_resource" ON "AdminSavedView"("resource");
CREATE INDEX IF NOT EXISTS "idx_admin_saved_view_user" ON "AdminSavedView"("userId");
CREATE INDEX IF NOT EXISTS "idx_admin_saved_view_shared" ON "AdminSavedView"("resource", "isShared") WHERE "isShared" = TRUE;

-- +goose Down
DROP TABLE IF EXISTS "AdminSavedView";
