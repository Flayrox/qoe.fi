-- 🗑️ Retire le type mort MEDIA_MENTION de l'enum NotificationType.
-- Hand-written migration. Aucune ligne ne porte ce type en production
-- (jamais créé) ; repli défensif MEDIA_MENTION → MENTION avant le drop.
-- Postgres ne sait pas supprimer une valeur d'enum : on recrée le type.

-- 1. Repli défensif (aucune ligne attendue).
UPDATE "Notification" SET "type" = 'MENTION' WHERE "type" = 'MEDIA_MENTION';

-- 2. Nouvel enum sans la valeur morte.
CREATE TYPE "NotificationType_new" AS ENUM (
  'LIKE', 'REPOST', 'REPLY', 'COMMENT', 'MENTION', 'FOLLOW',
  'MEDIA_INVITE', 'MEDIA_MEMBER_JOINED', 'MEDIA_ARTICLE_PUBLISHED',
  'MEDIA_ARTICLE_SUBMITTED'
);

-- 3. Bascule de la colonne vers le nouvel enum.
ALTER TABLE "Notification"
  ALTER COLUMN "type" TYPE "NotificationType_new"
  USING ("type"::text::"NotificationType_new");

-- 4. Supprime l'ancien enum et renomme le nouveau.
DROP TYPE "NotificationType";
ALTER TYPE "NotificationType_new" RENAME TO "NotificationType";
