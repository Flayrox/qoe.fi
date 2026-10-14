-- =====================================================================
-- ⚡ optimize-db-images.sql
-- Purge les URLs Unsplash et Base64 lourdes pour laisser place
-- aux couvertures vectorielles déterministes SVG natives (@qoe/theme)
-- =====================================================================

DO $$
BEGIN
  -- 1. Purge des couvertures d'articles
  UPDATE "Article"
  SET "imageUrl" = NULL
  WHERE "imageUrl" LIKE '%unsplash%' OR "imageUrl" LIKE 'data:%';

  -- 2. Purge des images de pensées / posts
  UPDATE "Post"
  SET "imageUrl" = NULL
  WHERE "imageUrl" LIKE '%unsplash%' OR "imageUrl" LIKE 'data:%';

  RAISE NOTICE 'Images Unsplash et Base64 purgées avec succès !';
END $$;
