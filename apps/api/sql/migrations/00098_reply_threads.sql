-- =====================================================================
-- 🧵 Fils de réponses paginés + tombstones (lot L42)
-- =====================================================================
-- La pagination par curseur stable s'appuie sur un ordre total
-- ("createdAt", id) : deux posts créés dans la même milliseconde gardent un
-- ordre déterministe, donc une page ne peut ni répéter ni sauter une ligne.
--
-- Aucune colonne nouvelle : le tombstone est un "deletedAt" non nul. La
-- structure du fil reste lisible parce que les enfants pointent toujours leur
-- parent ("parentId") et que la racine de conversation est dénormalisée
-- ("rootId").
-- =====================================================================

-- +goose Up
SET lock_timeout = '3s';

-- Réponses directes d'un post (ou commentaire) : l'index couvre le filtre ET
-- l'ordre de pagination, donc la page se lit sans tri.
CREATE INDEX IF NOT EXISTS "Post_parentId_createdAt_id_idx"
    ON "Post" ("parentId", "createdAt", "id")
    WHERE "parentId" IS NOT NULL;

-- Tous les descendants d'un fil (onglet « réponses » d'une pensée, fil d'un
-- article), dans l'ordre de pagination.
CREATE INDEX IF NOT EXISTS "Post_rootId_createdAt_id_idx"
    ON "Post" ("rootId", "createdAt", "id")
    WHERE "rootId" IS NOT NULL;

-- Commentaires de niveau 1 d'un article.
CREATE INDEX IF NOT EXISTS "Post_rootArticleId_parentId_createdAt_id_idx"
    ON "Post" ("rootArticleId", "createdAt", "id")
    WHERE "rootArticleId" IS NOT NULL AND "parentId" IS NULL;

-- Onglet « réponses » d'un profil : les réponses d'un auteur, du plus récent
-- au plus ancien.
CREATE INDEX IF NOT EXISTS "Post_authorId_parentId_createdAt_id_idx"
    ON "Post" ("authorId", "createdAt", "id")
    WHERE "parentId" IS NOT NULL;

-- +goose Down
SET lock_timeout = '3s';

DROP INDEX IF EXISTS "Post_authorId_parentId_createdAt_id_idx";
DROP INDEX IF EXISTS "Post_rootArticleId_parentId_createdAt_id_idx";
DROP INDEX IF EXISTS "Post_rootId_createdAt_id_idx";
DROP INDEX IF EXISTS "Post_parentId_createdAt_id_idx";
