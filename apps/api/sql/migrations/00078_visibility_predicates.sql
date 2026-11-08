-- =====================================================================
-- 00078_visibility_predicates.sql — prédicats SQL de visibilité & blocage
-- =====================================================================
-- Centralisation en base des prédicats de blocage symétrique et de visibilité
-- des profils utilisateur (comptes publics vs privés/followers).
-- =====================================================================

-- +goose Up
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION is_blocked_bidirectional(user_a UUID, user_b UUID)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN user_a IS NULL OR user_b IS NULL OR user_a = user_b THEN false
    ELSE EXISTS (
      SELECT 1 FROM "BlockedUser"
      WHERE ("creatorId" = user_a AND "readerId" = user_b)
         OR ("creatorId" = user_b AND "readerId" = user_a)
    )
  END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION can_view_profile(viewer_id UUID, target_user_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    -- Cible invalide ou inexistante
    WHEN target_user_id IS NULL THEN false
    WHEN NOT EXISTS (SELECT 1 FROM "User" WHERE id = target_user_id) THEN false

    -- L'utilisateur peut toujours voir son propre profil
    WHEN viewer_id IS NOT NULL AND viewer_id = target_user_id THEN true

    -- Blocage bidirectionnel entre le viewer et la cible
    WHEN viewer_id IS NOT NULL AND is_blocked_bidirectional(viewer_id, target_user_id) THEN false

    -- Profil public accessible à tous (connecté ou anonyme)
    WHEN COALESCE((SELECT us."profileVisibility" FROM "UserSettings" us WHERE us."userId" = target_user_id), 'PUBLIC') = 'PUBLIC' THEN true

    -- Compte privé / followers-only : accessible uniquement aux abonnés authentifiés
    WHEN viewer_id IS NULL THEN false
    ELSE EXISTS (
      SELECT 1 FROM "Follows" f
      JOIN "User" u ON u."publicationId" = f."publicationId"
      WHERE f."readerId" = viewer_id AND u.id = target_user_id
    )
  END;
$$;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP FUNCTION IF EXISTS can_view_profile(UUID, UUID);
DROP FUNCTION IF EXISTS is_blocked_bidirectional(UUID, UUID);
-- +goose StatementEnd
