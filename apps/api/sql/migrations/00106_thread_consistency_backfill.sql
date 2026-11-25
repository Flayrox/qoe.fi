-- =====================================================================
-- 🧵 Réparation des fils legacy de L42 (backfill réel)
-- =====================================================================
-- 00098 est une migration d'INDEX seulement. La preuve sur base vierge a
-- révélé trois incohérences que les données d'avant L42 peuvent porter :
--   1. une réponse dont "rootId" est nul (créée avant que le champ ne soit
--      systématiquement rempli) n'apparaît jamais dans `scope=thread` ;
--   2. une réponse cross-article ("rootArticleId" A, parent dans B) viole
--      l'invariant « le parent partage le même article » ;
--   3. "replyCount" peut compter une réponse supprimée ou ignorer un enfant.
--
-- La migration répare les trois, puis un trigger empêche qu'une écriture
-- future réintroduise (1) ou (2). Les migrations déjà appliquées ne sont pas
-- réécrites : 00106 est la réparation forward-only de 00098.
-- =====================================================================

-- +goose Up
SET lock_timeout = '3s';

-- 1. "rootId" = racine réelle du fil, en remontant les parents. La borne
--    protège d'une éventuelle donnée cyclique ; la FK interdit déjà un parent
--    absent. Les racines (parentId NULL) ne sont pas touchées.
WITH RECURSIVE chain AS (
    SELECT p.id AS leaf, p.id AS node, p."parentId" AS parent, 0 AS depth
    FROM "Post" p
    WHERE p."parentId" IS NOT NULL
    UNION ALL
    SELECT chain.leaf, parent.id, parent."parentId", chain.depth + 1
    FROM chain
    JOIN "Post" parent ON parent.id = chain.parent
    WHERE chain.parent IS NOT NULL
      AND chain.depth < 1000
), roots AS (
    SELECT leaf, node AS root_id FROM chain WHERE parent IS NULL
)
UPDATE "Post" p
SET "rootId" = roots.root_id
FROM roots
WHERE p.id = roots.leaf
  AND p."rootId" IS DISTINCT FROM roots.root_id;

-- 2. Le contexte article suit le parent : une réponse cross-article est
--    rattachée au fil de son parent, jamais à un article qu'elle ne peut pas
--    atteindre par la racine. Les pensées (parent sans article) restent NULL.
UPDATE "Post" child
SET "rootArticleId" = parent."rootArticleId"
FROM "Post" parent
WHERE child."parentId" = parent.id
  AND child."rootArticleId" IS DISTINCT FROM parent."rootArticleId";

-- 3. "replyCount" = enfants directs vivants, pour tous les nœuds (pas
--    seulement les commentaires d'article comme 00097). Un tombstone garde sa
--    place mais n'est pas compté, conformément à L42.
WITH live AS (
    SELECT p.id,
           count(c.id)::int AS n
    FROM "Post" p
    LEFT JOIN "Post" c
           ON c."parentId" = p.id
          AND c."deletedAt" IS NULL
    GROUP BY p.id
)
UPDATE "Post" p
SET "replyCount" = live.n
FROM live
WHERE p.id = live.id
  AND p."replyCount" IS DISTINCT FROM live.n;

-- 4. Garde-fou : une réponse hérite toujours de la racine et de l'article de
--    son parent. Le service le fait déjà ; le trigger couvre les imports,
--    scripts et tests qui écrivent directement en SQL.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION "enforce_post_thread_root"() RETURNS trigger AS $$
DECLARE
    parent "Post"%ROWTYPE;
BEGIN
    IF NEW."parentId" IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT * INTO parent FROM "Post" WHERE id = NEW."parentId";
    IF NOT FOUND THEN
        -- La FK "Post_parentId_fkey" produira l'erreur, plus lisible ici.
        RETURN NEW;
    END IF;
    IF NEW."rootArticleId" IS DISTINCT FROM parent."rootArticleId" THEN
        NEW."rootArticleId" := parent."rootArticleId";
    END IF;
    IF NEW."rootId" IS NULL
       OR NEW."rootId" IS DISTINCT FROM COALESCE(parent."rootId", parent.id) THEN
        NEW."rootId" := COALESCE(parent."rootId", parent.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

DROP TRIGGER IF EXISTS "Post_thread_root_guard" ON "Post";
CREATE TRIGGER "Post_thread_root_guard"
    BEFORE INSERT OR UPDATE OF "parentId", "rootId", "rootArticleId" ON "Post"
    FOR EACH ROW EXECUTE FUNCTION "enforce_post_thread_root"();

-- +goose Down
-- Réparation irréversible : le down ne réintroduit pas les incohérences.
DROP TRIGGER IF EXISTS "Post_thread_root_guard" ON "Post";
DROP FUNCTION IF EXISTS "enforce_post_thread_root"();
