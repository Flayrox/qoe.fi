-- 🔔 Notification Realtime (Supabase) : publication + RLS + replica identity
-- Hand-written migration. No-op sur Postgres standard (dev local) :
--   - la publication `supabase_realtime` n'existe que sur Supabase ;
--   - `auth.uid()` / rôle `authenticated` n'existent que sur Supabase.
-- Permet au hook useRealtimeNotificationSync de filtrer `recipientId=eq.<uid>`
-- côté serveur, sans casser l'accès backend (propriétaire de table = bypass RLS).

-- 1 ── Publication Realtime : ajoute "Notification" si la publication existe ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'Notification'
     ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public."Notification"';
  END IF;
END
$$;

-- 2 ── RLS : active et restreint la lecture à ses propres notifications ──
ALTER TABLE public."Notification" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notifications" ON public."Notification";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid'
  ) AND EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'authenticated'
  ) THEN
    EXECUTE 'CREATE POLICY "Users read own notifications" ON public."Notification" FOR SELECT TO authenticated USING (auth.uid() = "recipientId")';
  END IF;
END
$$;

-- 3 ── REPLICA IDENTITY FULL : ligne complète dans le flux WAL ──
--     (sinon les UPDATE isRead n'incluent pas recipientId → filtre inopérant)
ALTER TABLE public."Notification" REPLICA IDENTITY FULL;
