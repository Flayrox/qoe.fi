-- Citation d'une annotation (et non d'un simple passage).
--
-- Le post cite une annotation : sa note, le passage qu'elle annote, son
-- auteur et les ancres canoniques. Le snapshot est écrit par le serveur au
-- moment de la publication (jamais fourni par le client) : une citation est
-- une COPIE datée. Si la note change ou si l'annotation est supprimée, la
-- citation reste lisible et attribuée à son auteur.
--
-- NULL = pensée ordinaire (ou citation d'article classique via
-- quotedArticleId/quotedExcerpt, inchangée).

-- +goose Up
ALTER TABLE "Post" ADD COLUMN IF NOT EXISTS "quotedAnnotation" JSONB;

-- +goose Down
ALTER TABLE "Post" DROP COLUMN IF EXISTS "quotedAnnotation";
