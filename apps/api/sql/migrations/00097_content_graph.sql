-- =====================================================================
-- 🕸️ Graphe de contenu — un commentaire d'article est un post (lot L41)
-- =====================================================================
-- 1. "Post"."rootArticleId" : un post peut être un commentaire d'article, à
--    n'importe quelle profondeur. L'article est la racine du CONTEXTE ; la
--    racine du FIL reste un post ("rootId"), sinon toutes les discussions
--    d'un article ne formeraient qu'un seul arbre géant.
-- 2. Backfill de "ArticleComment" vers "Post" en CONSERVANT les ids : la FK
--    "Notification"."commentId" est repointée sans réécrire une seule valeur.
-- 3. La table "ArticleComment" n'est pas encore supprimée : elle est gelée
--    (plus aucun écrivain après L41) et disparaîtra dans une migration
--    ultérieure, après un cycle de déploiement.
--
-- 🔒 Invariant posé : un post est soit un commentaire d'article, soit une
--    citation d'article, jamais les deux.
-- =====================================================================

-- +goose Up
SET lock_timeout = '3s';

ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "rootArticleId" TEXT;

DO $$
BEGIN
    ALTER TABLE "Post"
        ADD CONSTRAINT "Post_rootArticleId_fkey"
        FOREIGN KEY ("rootArticleId") REFERENCES "Article"(id)
        ON UPDATE CASCADE ON DELETE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Index partiel : la colonne est nulle pour l'immense majorité des posts.
CREATE INDEX IF NOT EXISTS "Post_rootArticleId_createdAt_idx"
    ON "Post" ("rootArticleId", "createdAt")
    WHERE "rootArticleId" IS NOT NULL;

-- 2. Copie des commentaires, ids conservés (les notifications suivent).
INSERT INTO "Post" (id, "content", "authorId", "createdAt", "updatedAt", "rootArticleId", "replyRestriction")
SELECT c.id, c."content", c."authorId", c."createdAt", c."updatedAt", c."articleId", 'everyone'
FROM "ArticleComment" c
ON CONFLICT (id) DO NOTHING;

-- Les parents ne sont posés qu'après la copie : la FK "Post_parentId_fkey"
-- est immédiate, une insertion mêlant parent et enfant dans la même requête
-- dépendrait de l'ordre des lignes.
UPDATE "Post" p
SET "parentId" = c."parentId"
FROM "ArticleComment" c
WHERE p.id = c.id
  AND p."rootArticleId" IS NOT NULL
  AND c."parentId" IS NOT NULL;

-- "rootId" = commentaire de niveau 1 du fil (l'article reste porté par
-- "rootArticleId"). La récursion est bornée : une donnée cyclique ne doit
-- jamais bloquer la migration.
WITH RECURSIVE chain AS (
    SELECT c.id AS leaf, c.id AS node, c."parentId" AS parent, 0 AS depth
    FROM "ArticleComment" c
    WHERE c."parentId" IS NOT NULL
    UNION ALL
    SELECT chain.leaf, p.id, p."parentId", chain.depth + 1
    FROM chain
    JOIN "ArticleComment" p ON p.id = chain.parent
    WHERE chain.parent IS NOT NULL
      AND chain.depth < 100
), roots AS (
    SELECT leaf, node AS root_id FROM chain WHERE parent IS NULL
)
UPDATE "Post" p
SET "rootId" = roots.root_id
FROM roots
WHERE p.id = roots.leaf
  AND p."rootArticleId" IS NOT NULL;

-- Compteurs de réponses directes, comme le fait le service pour les pensées.
UPDATE "Post" p
SET "replyCount" = s.n
FROM (
    SELECT "parentId" AS parent_id, count(*)::int AS n
    FROM "Post"
    WHERE "rootArticleId" IS NOT NULL AND "parentId" IS NOT NULL AND "deletedAt" IS NULL
    GROUP BY "parentId"
) s
WHERE p.id = s.parent_id;

-- 3. La FK de notification change de table, pas de valeurs.
ALTER TABLE "Notification" DROP CONSTRAINT IF EXISTS "Notification_commentId_fkey";
ALTER TABLE "Notification"
    ADD CONSTRAINT "Notification_commentId_fkey"
    FOREIGN KEY ("commentId") REFERENCES "Post"(id)
    ON UPDATE CASCADE ON DELETE CASCADE;

-- Invariant : commentaire d'article XOR citation d'article.
ALTER TABLE "Post" DROP CONSTRAINT IF EXISTS "Post_content_root_exclusive";
ALTER TABLE "Post"
    ADD CONSTRAINT "Post_content_root_exclusive"
    CHECK ("rootArticleId" IS NULL OR "quotedArticleId" IS NULL);

-- +goose Down
-- ⚠️ Rollback sûr uniquement pendant la fenêtre L41 (avant que la nouvelle
-- surface n'écrive des commentaires). Après, ce down supprime des posts
-- légitimes : il est là pour revenir d'un déploiement raté, pas pour un usage
-- courant.
SET lock_timeout = '3s';

ALTER TABLE "Notification" DROP CONSTRAINT IF EXISTS "Notification_commentId_fkey";
DELETE FROM "Notification"
WHERE "commentId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "ArticleComment" c WHERE c.id = "Notification"."commentId");
ALTER TABLE "Notification"
    ADD CONSTRAINT "Notification_commentId_fkey"
    FOREIGN KEY ("commentId") REFERENCES "ArticleComment"(id)
    ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE "Post" DROP CONSTRAINT IF EXISTS "Post_content_root_exclusive";
DELETE FROM "Post" WHERE "rootArticleId" IS NOT NULL;
ALTER TABLE "Post" DROP CONSTRAINT IF EXISTS "Post_rootArticleId_fkey";
DROP INDEX IF EXISTS "Post_rootArticleId_createdAt_idx";
ALTER TABLE "Post" DROP COLUMN IF EXISTS "rootArticleId";
