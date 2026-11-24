-- +goose Up
-- ─────────────────────────────────────────────────────────────────────────────
-- Interaction — le registre unique des réactions (L45).
--
-- Une interaction est enregistrée sur sa CIBLE RÉELLE (un post, un commentaire
-- — qui est un post depuis L41 — ou un article). Règle de rollup, unique et
-- explicite : AUCUN. Un like/repost sur un commentaire n'incrémente jamais le
-- post racine ni l'article ; les compteurs d'une cible ne parlent que d'elle.
-- C'est réversible sans perte : si un rollup devient souhaité, il se calcule
-- en lecture (SUM over targetId/rootId), la donnée par cible est déjà là.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "Interaction" (
    "id"         TEXT NOT NULL,
    "userId"     UUID NOT NULL,
    "kind"       TEXT NOT NULL,
    "targetType" TEXT NOT NULL DEFAULT 'POST',
    "targetId"   TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Interaction_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Interaction_kind_check" CHECK ("kind" IN ('LIKE', 'REPOST')),
    CONSTRAINT "Interaction_target_type_check" CHECK ("targetType" IN ('POST', 'ARTICLE')),
    CONSTRAINT "Interaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

-- Une seule réaction par (utilisateur, nature, cible) : l'idempotence est
-- portée par la base, pas par une lecture préalable (qui perd les races).
CREATE UNIQUE INDEX "Interaction_user_kind_target_key"
    ON "Interaction" ("userId", "kind", "targetType", "targetId");
CREATE INDEX "Interaction_target_idx"
    ON "Interaction" ("targetType", "targetId", "kind", "createdAt" DESC);

-- Backfill des likes existants : les ids sont conservés (aucune rupture de
-- pagination côté acteurs, aucun like perdu).
INSERT INTO "Interaction" ("id", "userId", "kind", "targetType", "targetId", "createdAt")
SELECT "id", "userId", 'LIKE', 'POST', "postId", "createdAt"
FROM "Like"
ON CONFLICT DO NOTHING;

-- Backfill des reposts purs : le post-repost reste l'arête de contenu, mais
-- l'interaction est désormais lisible dans le même registre.
INSERT INTO "Interaction" ("id", "userId", "kind", "targetType", "targetId", "createdAt")
SELECT p."id", p."authorId", 'REPOST', 'POST', p."repostId", p."createdAt"
FROM "Post" p
WHERE p."repostId" IS NOT NULL
  AND (p.content = '' OR p.content = ' ')
  AND p."deletedAt" IS NULL
ON CONFLICT DO NOTHING;

-- +goose Down
DROP TABLE "Interaction";
