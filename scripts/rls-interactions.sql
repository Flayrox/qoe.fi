-- =====================================================================
-- 🔐 RLS qoe.fi — Tables d'interaction (idempotent — 02/09)
-- =====================================================================
-- Couche de sécurité défensive pour les lectures/écritures DIRECTES des
-- clients Supabase (mobile, realtime, web client) sur les tables publiques.
--
-- ⚠️ BYPASSRLS : postgres, service_role, supabase_admin (backend Go, Prisma,
-- workers) contournent ces policies — l'API reste la source de vérité.
-- Seuls anon / authenticated sont soumis à RLS.
--
-- ⚠️ auth.uid() = UUID Supabase du lecteur connecté (JWT). Les colonnes
-- uuid sont comparées directement.
--
-- ✅ IDEMPOTENT depuis le 02/09 : DROP POLICY IF EXISTS avant chaque
--    CREATE POLICY → le script peut être rejoué sans erreur.
--    À exécuter AVANT scripts/rls-grants.sql (REVOKE/GRANT minimal).
-- =====================================================================

-- ─────────────────────────────────────────────────────────────────────
-- 🧵 Post (Thoughts / pensées)
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE "Post" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read public posts" ON "Post";
DROP POLICY IF EXISTS "Read own posts" ON "Post";
DROP POLICY IF EXISTS "Create own posts" ON "Post";
DROP POLICY IF EXISTS "Update own posts" ON "Post";
DROP POLICY IF EXISTS "Delete own posts" ON "Post";

-- Lecture publique : posts publiés (non-brouillon), non supprimés,
-- visibilité 'public'.
CREATE POLICY "Read public posts" ON "Post"
  FOR SELECT TO anon, authenticated
  USING (("isDraft" = false) AND ("deletedAt" IS NULL) AND (visibility = 'public'));

-- L'auteur lit tout (brouillons, visibilité restreinte, etc.)
CREATE POLICY "Read own posts" ON "Post"
  FOR SELECT TO authenticated
  USING ("authorId" = auth.uid());

CREATE POLICY "Create own posts" ON "Post"
  FOR INSERT TO authenticated
  WITH CHECK ("authorId" = auth.uid());

CREATE POLICY "Update own posts" ON "Post"
  FOR UPDATE TO authenticated
  USING ("authorId" = auth.uid())
  WITH CHECK ("authorId" = auth.uid());

CREATE POLICY "Delete own posts" ON "Post"
  FOR DELETE TO authenticated
  USING ("authorId" = auth.uid());

-- ─────────────────────────────────────────────────────────────────────
-- ❤️ Like
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE "Like" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read likes" ON "Like";
DROP POLICY IF EXISTS "Users create their own likes" ON "Like";
DROP POLICY IF EXISTS "Users delete their own likes" ON "Like";

CREATE POLICY "Anyone can read likes" ON "Like"
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Users create their own likes" ON "Like"
  FOR INSERT TO authenticated WITH CHECK ("userId" = auth.uid());

CREATE POLICY "Users delete their own likes" ON "Like"
  FOR DELETE TO authenticated USING ("userId" = auth.uid());

-- ─────────────────────────────────────────────────────────────────────
-- 🔖 Bookmark (bibliothèque privée)
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE "Bookmark" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own bookmarks" ON "Bookmark";
DROP POLICY IF EXISTS "Users create own bookmarks" ON "Bookmark";
DROP POLICY IF EXISTS "Users delete own bookmarks" ON "Bookmark";

CREATE POLICY "Users read own bookmarks" ON "Bookmark"
  FOR SELECT TO authenticated USING ("readerId" = auth.uid());

CREATE POLICY "Users create own bookmarks" ON "Bookmark"
  FOR INSERT TO authenticated WITH CHECK ("readerId" = auth.uid());

CREATE POLICY "Users delete own bookmarks" ON "Bookmark"
  FOR DELETE TO authenticated USING ("readerId" = auth.uid());

-- ─────────────────────────────────────────────────────────────────────
-- 👥 Follows (abonnements)
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE "Follows" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read follows" ON "Follows";
DROP POLICY IF EXISTS "Users create their own follows" ON "Follows";
DROP POLICY IF EXISTS "Users delete their own follows" ON "Follows";

-- Les listes d'abonnés/abonnements sont publiques (profils).
CREATE POLICY "Anyone can read follows" ON "Follows"
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Users create their own follows" ON "Follows"
  FOR INSERT TO authenticated WITH CHECK ("readerId" = auth.uid());

CREATE POLICY "Users delete their own follows" ON "Follows"
  FOR DELETE TO authenticated USING ("readerId" = auth.uid());

-- ─────────────────────────────────────────────────────────────────────
-- 🖍️ Highlight (surlignages + annotations)
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE "Highlight" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read public highlights" ON "Highlight";
DROP POLICY IF EXISTS "Users read own highlights" ON "Highlight";
DROP POLICY IF EXISTS "Users create own highlights" ON "Highlight";
DROP POLICY IF EXISTS "Users update own highlights" ON "Highlight";
DROP POLICY IF EXISTS "Users delete own highlights" ON "Highlight";

CREATE POLICY "Anyone can read public highlights" ON "Highlight"
  FOR SELECT TO anon, authenticated
  USING ("isPublic" = true OR "isOfficial" = true);

CREATE POLICY "Users read own highlights" ON "Highlight"
  FOR SELECT TO authenticated USING ("readerId" = auth.uid());

CREATE POLICY "Users create own highlights" ON "Highlight"
  FOR INSERT TO authenticated WITH CHECK ("readerId" = auth.uid());

CREATE POLICY "Users update own highlights" ON "Highlight"
  FOR UPDATE TO authenticated
  USING ("readerId" = auth.uid())
  WITH CHECK ("readerId" = auth.uid());

CREATE POLICY "Users delete own highlights" ON "Highlight"
  FOR DELETE TO authenticated USING ("readerId" = auth.uid());

-- ─────────────────────────────────────────────────────────────────────
-- 💬 AnnotationComment
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE "AnnotationComment" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read annotation comments" ON "AnnotationComment";
DROP POLICY IF EXISTS "Users create annotation comments" ON "AnnotationComment";
DROP POLICY IF EXISTS "Users update own annotation comments" ON "AnnotationComment";
DROP POLICY IF EXISTS "Users delete own annotation comments" ON "AnnotationComment";

CREATE POLICY "Anyone can read annotation comments" ON "AnnotationComment"
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Users create annotation comments" ON "AnnotationComment"
  FOR INSERT TO authenticated WITH CHECK ("authorId" = auth.uid());

CREATE POLICY "Users update own annotation comments" ON "AnnotationComment"
  FOR UPDATE TO authenticated
  USING ("authorId" = auth.uid())
  WITH CHECK ("authorId" = auth.uid());

CREATE POLICY "Users delete own annotation comments" ON "AnnotationComment"
  FOR DELETE TO authenticated USING ("authorId" = auth.uid());

-- ─────────────────────────────────────────────────────────────────────
-- ⬆️ AnnotationUpvote
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE "AnnotationUpvote" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read annotation upvotes" ON "AnnotationUpvote";
DROP POLICY IF EXISTS "Users create own annotation upvotes" ON "AnnotationUpvote";
DROP POLICY IF EXISTS "Users delete own annotation upvotes" ON "AnnotationUpvote";

CREATE POLICY "Anyone can read annotation upvotes" ON "AnnotationUpvote"
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Users create own annotation upvotes" ON "AnnotationUpvote"
  FOR INSERT TO authenticated WITH CHECK ("userId" = auth.uid());

CREATE POLICY "Users delete own annotation upvotes" ON "AnnotationUpvote"
  FOR DELETE TO authenticated USING ("userId" = auth.uid());

-- ─────────────────────────────────────────────────────────────────────
-- 💬 ArticleComment
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE "ArticleComment" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read article comments" ON "ArticleComment";
DROP POLICY IF EXISTS "Users create article comments" ON "ArticleComment";
DROP POLICY IF EXISTS "Users update own article comments" ON "ArticleComment";
DROP POLICY IF EXISTS "Users delete own article comments" ON "ArticleComment";

CREATE POLICY "Anyone can read article comments" ON "ArticleComment"
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Users create article comments" ON "ArticleComment"
  FOR INSERT TO authenticated WITH CHECK ("authorId" = auth.uid());

CREATE POLICY "Users update own article comments" ON "ArticleComment"
  FOR UPDATE TO authenticated
  USING ("authorId" = auth.uid())
  WITH CHECK ("authorId" = auth.uid());

CREATE POLICY "Users delete own article comments" ON "ArticleComment"
  FOR DELETE TO authenticated USING ("authorId" = auth.uid());

-- ─────────────────────────────────────────────────────────────────────
-- 🔔 Notification — le realtime web (hook useRealtimeNotificationSync)
--    filtre côté serveur `recipientId=eq.<uid>` : il FAUT la policy SELECT
--    ci-dessous (lecture de SES lignes uniquement) + RLS activée + la table
--    dans la publication supabase_realtime (voir scripts/rls-grants.sql).
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notifications" ON "Notification";
DROP POLICY IF EXISTS "Users update own notifications" ON "Notification";
DROP POLICY IF EXISTS "Users delete own notifications" ON "Notification";

CREATE POLICY "Users read own notifications" ON "Notification"
  FOR SELECT TO authenticated USING ("recipientId" = auth.uid());

CREATE POLICY "Users update own notifications" ON "Notification"
  FOR UPDATE TO authenticated
  USING ("recipientId" = auth.uid())
  WITH CHECK ("recipientId" = auth.uid());

CREATE POLICY "Users delete own notifications" ON "Notification"
  FOR DELETE TO authenticated USING ("recipientId" = auth.uid());

-- ─────────────────────────────────────────────────────────────────────
-- ⚙️ NotificationPreference (privé)
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE "NotificationPreference" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own notification preferences" ON "NotificationPreference";

CREATE POLICY "Users manage own notification preferences" ON "NotificationPreference"
  FOR ALL TO authenticated
  USING ("userId" = auth.uid())
  WITH CHECK ("userId" = auth.uid());