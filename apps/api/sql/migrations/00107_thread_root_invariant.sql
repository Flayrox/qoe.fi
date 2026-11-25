-- =====================================================================
-- 🌱 Invariant des racines : une racine n'a jamais de rootId
-- =====================================================================
-- 00106 répare les enfants, mais laissait passer une racine
-- (parentId NULL) avec un rootId résiduel : le plan L42 exige rootId NULL
-- pour une racine. 00106 peut déjà être appliquée, donc cette correction est
-- une migration forward-only distincte.
-- =====================================================================

-- +goose Up
SET lock_timeout = '3s';

UPDATE "Post"
SET "rootId" = NULL
WHERE "parentId" IS NULL
  AND "rootId" IS NOT NULL;

-- Même garde que 00106, avec la branche racine explicite et sans conditions
-- redondantes : le trigger écrit toujours la valeur canonique.
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION "enforce_post_thread_root"() RETURNS trigger AS $$
DECLARE
    parent "Post"%ROWTYPE;
BEGIN
    IF NEW."parentId" IS NULL THEN
        NEW."rootId" := NULL;
        RETURN NEW;
    END IF;

    SELECT * INTO parent FROM "Post" WHERE id = NEW."parentId";
    IF NOT FOUND THEN
        -- La FK "Post_parentId_fkey" produira l'erreur, plus lisible ici.
        RETURN NEW;
    END IF;

    NEW."rootArticleId" := parent."rootArticleId";
    NEW."rootId" := COALESCE(parent."rootId", parent.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

-- +goose Down
-- Réparation irréversible : ne pas réintroduire une racine avec rootId.
SELECT 1;
