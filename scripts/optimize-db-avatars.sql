-- =====================================================================
-- ⚡ optimize-db-avatars.sql
-- Purge les avatars Unsplash et Base64 pour laisser place
-- aux SafeAvatar génératifs et déterministes (@qoe/ui)
-- =====================================================================

DO $$
BEGIN
  -- 1. Purge des logos utilisateurs
  UPDATE "User"
  SET "logoUrl" = NULL
  WHERE "logoUrl" LIKE '%unsplash%' OR "logoUrl" LIKE 'data:%';

  -- 2. Purge des logos de publications
  UPDATE "Publication"
  SET "logoUrl" = NULL
  WHERE "logoUrl" LIKE '%unsplash%' OR "logoUrl" LIKE 'data:%';

  -- 3. Purge des bannières de publications
  UPDATE "Publication"
  SET "headerImageUrl" = NULL
  WHERE "headerImageUrl" LIKE '%unsplash%' OR "headerImageUrl" LIKE 'data:%';

  RAISE NOTICE 'Avatars et bannières Unsplash purgés avec succès !';
END $$;
