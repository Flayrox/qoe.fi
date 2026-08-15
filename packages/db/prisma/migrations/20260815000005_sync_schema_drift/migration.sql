-- =====================================================================
-- 🧹 Sync dérive schéma ↔ historique
-- =====================================================================
-- Découvert en validant le baseline from-scratch (20260519000000) :
-- le schéma produit par l'historique diffère du schéma déclaré.
--
--   1. User : 16 colonnes legacy (accentColor, subdomain, ...) déplacées
--      vers Publication en 20260814000000, mais JAMAIS droppées par une
--      migration. Le schéma actuel ne les déclare plus — le prod et le
--      dev les portent encore. Aucune référence dans le code (vérifié).
--
--   2. Webhook : DEFAULT résiduels (updatedAt, events) retirés du schéma.
--
-- Idempotent : DROP COLUMN IF EXISTS / DROP DEFAULT (safe sur une base
-- déjà conforme).
-- =====================================================================

ALTER TABLE "User"
  DROP COLUMN IF EXISTS "accentColor",
  DROP COLUMN IF EXISTS "allowComments",
  DROP COLUMN IF EXISTS "allowIndexing",
  DROP COLUMN IF EXISTS "allowPublicAnnotations",
  DROP COLUMN IF EXISTS "customDomain",
  DROP COLUMN IF EXISTS "fontFamily",
  DROP COLUMN IF EXISTS "footerText",
  DROP COLUMN IF EXISTS "headerImageUrl",
  DROP COLUMN IF EXISTS "heroText",
  DROP COLUMN IF EXISTS "layoutStyle",
  DROP COLUMN IF EXISTS "seoDescription",
  DROP COLUMN IF EXISTS "seoTitle",
  DROP COLUMN IF EXISTS "stripeAccountId",
  DROP COLUMN IF EXISTS "subdomain",
  DROP COLUMN IF EXISTS "supportUrl",
  DROP COLUMN IF EXISTS "themeMode",
  DROP COLUMN IF EXISTS "umamiWebsiteId";

ALTER TABLE "Webhook" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "Webhook" ALTER COLUMN "events" DROP DEFAULT;
