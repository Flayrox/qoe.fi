-- =====================================================================
-- 🔐 RLS qoe.fi — Grants minimaux anon/authenticated (02/09)
-- =====================================================================
-- À exécuter APRÈS scripts/rls-interactions.sql (les policies filtrent les
-- lignes que ces SELECT peuvent voir).
--
-- AVANT : anon/authenticated avaient TOUS les privilèges (SELECT, INSERT,
-- UPDATE, DELETE, TRUNCATE, TRIGGER) sur les 62 tables du schéma public,
-- y compris User, ApiKey, OAuthToken, WalletTransaction, SystemConfig,
-- Webhook, Subscriber… → risque total dès qu'une porte directe s'ouvre
-- (Kong/REST public, Pooler, Realtime…).
--
-- APRÈS : seuls des SELECT ciblés (Post, Like, Follows, Highlight,
-- commentaires : contenu public ; Notification : réservé authenticated).
-- Le backend Go / Prisma (postgres, service_role — BYPASSRLS) n'est PAS
-- affecté. Le schéma storage (buckets) n'est pas touché.
-- ⚠️ Si un client direct écrit (ex: le mobile un jour) : accorder le GRANT
--    correspondant (INSERT/UPDATE/DELETE) — les policies existent déjà.
-- =====================================================================

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- Lectures légitimes (filtrées par RLS) :
GRANT SELECT ON "Post", "Like", "Follows", "Highlight",
    "AnnotationComment", "AnnotationUpvote", "ArticleComment"
    TO anon, authenticated;
GRANT SELECT ON "Notification", "NotificationPreference" TO authenticated;

-- Replication Realtime (idempotent) — le web s'abonne à Notification
-- (useRealtimeNotificationSync) et pointera sur Post pour le feed buffer
-- dès que le nom de table sera corrigé (Thought → Post).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE "Notification";
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE "Post";
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;