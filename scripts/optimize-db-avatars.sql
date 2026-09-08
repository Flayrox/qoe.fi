-- =====================================================================
-- ⚡ optimize-db-avatars.sql
-- Remplace les avatars Base64 par des CDN URLs Unsplash Portrait HD
-- =====================================================================

DO $$
DECLARE
  unsplash_avatars text[] := ARRAY[
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&h=256&q=80&crop=face',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=256&h=256&q=80&crop=face',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=256&h=256&q=80&crop=face',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=256&h=256&q=80&crop=face',
    'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=256&h=256&q=80&crop=face',
    'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=256&h=256&q=80&crop=face',
    'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=256&h=256&q=80&crop=face',
    'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=256&h=256&q=80&crop=face',
    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=256&h=256&q=80&crop=face',
    'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?auto=format&fit=crop&w=256&h=256&q=80&crop=face',
    'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=256&h=256&q=80&crop=face',
    'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=256&h=256&q=80&crop=face',
    'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=256&h=256&q=80&crop=face',
    'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=256&h=256&q=80&crop=face',
    'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=256&h=256&q=80&crop=face'
  ];
  n integer := array_length(unsplash_avatars, 1);
BEGIN
  -- 1. Remplacement des logos utilisateurs Base64
  UPDATE "User"
  SET "logoUrl" = unsplash_avatars[1 + abs(hashtext(id::text)) % n]
  WHERE "logoUrl" LIKE 'data:%';

  -- 2. Remplacement des logos de publications Base64
  UPDATE "Publication"
  SET "logoUrl" = unsplash_avatars[1 + abs(hashtext(id::text)) % n]
  WHERE "logoUrl" LIKE 'data:%';

  RAISE NOTICE 'Avatars Base64 migrés vers CDN Unsplash avec succès !';
END $$;
