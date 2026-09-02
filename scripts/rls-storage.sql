-- =====================================================================
-- 🔐 RLS qoe.fi — Policies Storage (02/09)
-- =====================================================================
-- storage.objects : lecture publique des buckets publics + écriture par
-- le propriétaire (authenticated).
--
-- Le mobile uploade en DIRECT dans `articles-media` sous
-- `{avatars|banners}/{userId}/{ts}-{rand}.{ext}` (apps/mobile/src/lib/upload.ts)
-- → la policy INSERT exige que le 2e segment du dossier = auth.uid().
-- Les objets créés via l'API Storage reçoivent owner = auth.uid() → les
-- UPDATE/DELETE sont restreints au propriétaire.
-- (Le web passe par les routes Next /api/upload (service_role, bypass).
--  Le backend Go utilise service_role — non affecté par ces policies.)
-- ✅ Idempotent (DROP POLICY IF EXISTS + buckets ON CONFLICT DO NOTHING).
-- ⚠️ Le serveur storage relit la table buckets (cache court) : la création
--    via l'API (POST /storage/v1/bucket, clé service_role) est immédiate.
-- =====================================================================

-- Buckets publics (3 buckets déclarés dans supabase/config.toml).
INSERT INTO storage.buckets (id, name, public) VALUES
    ('articles-media',  'articles-media',  true),
    ('media-branding',  'media-branding',  true),
    ('user-media',      'user-media',      true)
ON CONFLICT (id) DO NOTHING;

GRANT USAGE ON SCHEMA storage TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated;

-- Les 3 buckets publics (cf. supabase/config.toml [storage.buckets]) :
-- lecture publique.
DROP POLICY IF EXISTS "Public read on public buckets" ON storage.objects;
CREATE POLICY "Public read on public buckets" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id IN ('articles-media', 'media-branding', 'user-media'));

-- Insertion réservée aux utilisateurs connectés, dans LEUR dossier.
DROP POLICY IF EXISTS "Authenticated insert into own folder" ON storage.objects;
CREATE POLICY "Authenticated insert into own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('articles-media', 'media-branding', 'user-media')
              AND (storage.foldername(name))[2] = auth.uid()::text);

-- Modification / suppression : uniquement le propriétaire de l'objet.
DROP POLICY IF EXISTS "Owner update own objects" ON storage.objects;
CREATE POLICY "Owner update own objects" ON storage.objects
  FOR UPDATE TO authenticated
  USING (owner = auth.uid());

DROP POLICY IF EXISTS "Owner delete own objects" ON storage.objects;
CREATE POLICY "Owner delete own objects" ON storage.objects
  FOR DELETE TO authenticated
  USING (owner = auth.uid());