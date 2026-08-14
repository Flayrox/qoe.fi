-- 🔔 Notifications: ajout type COMMENT + préférences commentaires & média
-- Hand-written migration (prisma migrate dev inutilisable sur Supabase).

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'COMMENT';

ALTER TABLE "NotificationPreference"
  ADD COLUMN IF NOT EXISTS "emailComments" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "pushComments" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "emailMedia" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "pushMedia" BOOLEAN NOT NULL DEFAULT true;
