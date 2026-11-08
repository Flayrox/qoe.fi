-- =====================================================================
-- 00079_mute_and_visibility_predicates.sql — prédicats SQL de masquage
-- =====================================================================
-- Centralisation en base des prédicats de masquage d'utilisateurs et de mots.
-- =====================================================================

-- +goose Up
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION is_muted_by(viewer_id UUID, target_user_id UUID)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN viewer_id IS NULL OR target_user_id IS NULL THEN false
    ELSE EXISTS (
      SELECT 1 FROM "MutedUser"
      WHERE "muterId" = viewer_id AND "mutedId" = target_user_id
    )
  END;
$$;
-- +goose StatementEnd

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION contains_muted_word(viewer_id UUID, text_content TEXT)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN viewer_id IS NULL OR text_content IS NULL OR text_content = '' THEN false
    ELSE EXISTS (
      SELECT 1 FROM "MutedWord"
      WHERE "userId" = viewer_id AND lower(text_content) LIKE '%' || lower(word) || '%'
    )
  END;
$$;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP FUNCTION IF EXISTS contains_muted_word(UUID, TEXT);
DROP FUNCTION IF EXISTS is_muted_by(UUID, UUID);
-- +goose StatementEnd
