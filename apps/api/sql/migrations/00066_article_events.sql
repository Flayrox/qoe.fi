-- Historique de publication d'un article.
--
-- Journal append-only des transitions qui comptent pour un créateur :
-- publication, mise à jour en ligne, dépublication, programmation,
-- reprogrammation, annulation de programmation, publication automatique par
-- le planificateur, et cycle de relecture média (soumission/approbation/rejet).
--
-- Volontairement séparé de "ArticleReviewLog" (qui porte un commentaire de
-- relecture et un reviewer) : ici on garde la trace de TOUT ce qui a changé
-- l'état public, avec l'acteur et les états avant/après.

-- +goose Up
CREATE TABLE IF NOT EXISTS "ArticleEvent" (
    "id"            TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "articleId"     TEXT NOT NULL,
    "publicationId" TEXT,
    "actorId"       UUID,
    "type"          TEXT NOT NULL,
    "fromStatus"    TEXT,
    "toStatus"      TEXT,
    "scheduledAt"   TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleEvent_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ArticleEvent_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ArticleEvent_type_check" CHECK ("type" IN (
        'CREATED',
        'PUBLISHED',
        'LIVE_UPDATED',
        'UNPUBLISHED',
        'SCHEDULED',
        'RESCHEDULED',
        'SCHEDULE_CANCELLED',
        'SCHEDULED_PUBLISHED',
        'SUBMITTED',
        'APPROVED',
        'REJECTED'
    ))
);

CREATE INDEX IF NOT EXISTS "ArticleEvent_articleId_createdAt_idx"
    ON "ArticleEvent" ("articleId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "ArticleEvent_publicationId_createdAt_idx"
    ON "ArticleEvent" ("publicationId", "createdAt" DESC);

-- +goose Down
DROP TABLE IF EXISTS "ArticleEvent";
