-- =====================================================================
-- ⚖️ Migration 00084 : souveraineté P1 — co-auteurs et transfert
-- =====================================================================
-- Deux règles, dérivées de l'invariant « chaque auteur possède sa copie
-- souveraine » :
--
-- 1. Co-auteurs — un co-auteur ACCEPTED reçoit la même copie que l'auteur
--    principal : DRAFT, visible dans son espace personnel, publiée seulement
--    s'il le décide. Provisionnée à la soumission/publication, et au moment
--    où son consentement passe à ACCEPTED. Un co-auteur PENDING n'a rien :
--    sans accord, pas de copie.
--
-- 2. Transfert média → personnel — un article média qui possède déjà une
--    copie souveraine ne peut pas être déplacé dans l'espace personnel de son
--    auteur : cela créerait deux vivants identiques. La copie est le lieu de
--    vie, l'archive reste au média. Hors ce cas, un article qui entre dans un
--    espace personnel n'est plus une archive : `canonicalType` redevient
--    ORIGINAL (répare aussi les transferts faits avant cette migration).
-- =====================================================================

-- +goose Up
-- +goose StatementBegin

-- 1. Le trigger de publication provisionne aussi les co-auteurs acceptés.
CREATE OR REPLACE FUNCTION provision_author_sovereign_copy()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
    v_publisher_type "PublisherType";
BEGIN
    IF NEW."status" NOT IN ('SUBMITTED', 'PUBLISHED') THEN
        RETURN NEW;
    END IF;

    -- L'auteur principal reste garanti en premier : son échec annule
    -- l'écriture, comme depuis 00083.
    PERFORM ensure_author_sovereign_copy(NEW.id, NEW."authorId");

    SELECT p.type INTO v_publisher_type
    FROM "Publisher" p
    WHERE p.id = NEW."publisherId";

    IF v_publisher_type <> 'MEDIA' THEN
        RETURN NEW;
    END IF;

    -- Un co-auteur accepté possède le même droit que l'auteur principal.
    -- Les comptes dont le publisherId pointe vers un publisher non personnel
    -- sont ignorés (comme le backfill 00083), pour ne pas bloquer une
    -- publication à cause d'un espace personnel impossible à provisionner.
    FOR r IN
        SELECT aa."userId"
        FROM "ArticleAttribution" aa
        JOIN "User" u ON u.id = aa."userId"
        LEFT JOIN "Publisher" up ON up.id = u."publisherId"
        WHERE aa."articleId" = NEW.id
          AND aa.role = 'CO_AUTHOR'
          AND aa."consentStatus" = 'ACCEPTED'
          AND aa."userId" <> NEW."authorId"
          AND (u."publisherId" IS NULL OR up.type = 'PERSONAL')
    LOOP
        PERFORM ensure_author_sovereign_copy(NEW.id, r."userId");
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. L'accord d'un co-auteur déclenche sa copie, même après publication.
CREATE OR REPLACE FUNCTION provision_coauthor_sovereign_copy()
RETURNS TRIGGER AS $$
DECLARE
    v_article RECORD;
BEGIN
    IF NEW."consentStatus" <> 'ACCEPTED' OR NEW.role <> 'CO_AUTHOR' THEN
        RETURN NEW;
    END IF;

    SELECT a.id, a."authorId", a.status, p.type
    INTO v_article
    FROM "Article" a
    JOIN "Publisher" p ON p.id = a."publisherId"
    WHERE a.id = NEW."articleId";

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;
    IF v_article.type <> 'MEDIA'
       OR v_article.status NOT IN ('SUBMITTED', 'PUBLISHED')
       OR NEW."userId" = v_article."authorId" THEN
        RETURN NEW;
    END IF;

    PERFORM ensure_author_sovereign_copy(NEW."articleId", NEW."userId");
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_provision_coauthor_sovereign_copy ON "ArticleAttribution";
CREATE TRIGGER trg_provision_coauthor_sovereign_copy
AFTER INSERT OR UPDATE OF "consentStatus", role ON "ArticleAttribution"
FOR EACH ROW
WHEN (NEW."consentStatus" = 'ACCEPTED' AND NEW.role = 'CO_AUTHOR')
EXECUTE FUNCTION provision_coauthor_sovereign_copy();

-- 3. Backfill : co-auteurs déjà acceptés sur des articles média vivants.
DO $$
DECLARE
    r RECORD;
    v_processed INTEGER := 0;
    v_skipped INTEGER := 0;
BEGIN
    FOR r IN
        SELECT a.id, aa."userId"
        FROM "Article" a
        JOIN "Publisher" p ON p.id = a."publisherId"
        JOIN "ArticleAttribution" aa ON aa."articleId" = a.id
        JOIN "User" u ON u.id = aa."userId"
        LEFT JOIN "Publisher" up ON up.id = u."publisherId"
        WHERE p.type = 'MEDIA'
          AND a."status" IN ('SUBMITTED', 'PUBLISHED')
          AND aa.role = 'CO_AUTHOR'
          AND aa."consentStatus" = 'ACCEPTED'
          AND aa."userId" <> a."authorId"
          AND (u."publisherId" IS NULL OR up.type = 'PERSONAL')
    LOOP
        PERFORM ensure_author_sovereign_copy(r.id, r."userId");
        v_processed := v_processed + 1;
    END LOOP;

    FOR r IN
        SELECT a.id
        FROM "Article" a
        JOIN "Publisher" p ON p.id = a."publisherId"
        JOIN "ArticleAttribution" aa ON aa."articleId" = a.id
        JOIN "User" u ON u.id = aa."userId"
        JOIN "Publisher" up ON up.id = u."publisherId"
        WHERE p.type = 'MEDIA'
          AND a."status" IN ('SUBMITTED', 'PUBLISHED')
          AND aa.role = 'CO_AUTHOR'
          AND aa."consentStatus" = 'ACCEPTED'
          AND aa."userId" <> a."authorId"
          AND up.type <> 'PERSONAL'
    LOOP
        v_skipped := v_skipped + 1;
        RAISE NOTICE 'copie co-auteur ignorée (publisher non personnel): article %', r.id;
    END LOOP;

    RAISE NOTICE 'backfill copies co-auteurs: % traitées, % ignorées', v_processed, v_skipped;
END;
$$;

-- 4. Réparation des transferts média → personnel antérieurs : une archive de
--    média qui vit désormais dans un espace personnel redevient un original.
--    Aucune ligne n'est supprimée.
UPDATE "Article" a
SET "canonicalType" = 'ORIGINAL',
    "updatedAt" = now()
WHERE a."canonicalType" = 'MEDIA_ARCHIVE'
  AND EXISTS (
      SELECT 1 FROM "Publisher" p
      WHERE p.id = a."publisherId" AND p.type = 'PERSONAL'
  )
  AND NOT EXISTS (
      SELECT 1 FROM "Article" c
      WHERE c."originArticleId" = a.id AND c."isAuthorSovereignCopy" = true
  );

-- 5. Un article média qui possède déjà une copie souveraine ne peut pas être
--    déplacé dans l'espace personnel de son auteur par un transfert direct
--    en SQL : le service le refuse avant, cette garde couvre le reste.
CREATE OR REPLACE FUNCTION guard_sovereign_transfer()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."publisherId" IS DISTINCT FROM OLD."publisherId"
       AND EXISTS (
           SELECT 1 FROM "Publisher" p
           WHERE p.id = NEW."publisherId" AND p.type = 'PERSONAL'
       )
       AND EXISTS (
           SELECT 1 FROM "Article" c
           WHERE c."originArticleId" = NEW.id
             AND c."authorId" = NEW."authorId"
             AND c."isAuthorSovereignCopy" = true
       ) THEN
        RAISE EXCEPTION 'transfert refusé: la copie souveraine de l''article % vit déjà dans un espace personnel', NEW.id
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guard_sovereign_transfer ON "Article";
CREATE TRIGGER trg_guard_sovereign_transfer
BEFORE UPDATE OF "publisherId" ON "Article"
FOR EACH ROW
EXECUTE FUNCTION guard_sovereign_transfer();

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TRIGGER IF EXISTS trg_guard_sovereign_transfer ON "Article";
DROP FUNCTION IF EXISTS guard_sovereign_transfer();
DROP TRIGGER IF EXISTS trg_provision_coauthor_sovereign_copy ON "ArticleAttribution";
DROP FUNCTION IF EXISTS provision_coauthor_sovereign_copy();

-- Retour au comportement 00083 : seul l'auteur principal est provisionné.
CREATE OR REPLACE FUNCTION provision_author_sovereign_copy()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."status" IN ('SUBMITTED', 'PUBLISHED') THEN
        PERFORM ensure_author_sovereign_copy(NEW.id, NEW."authorId");
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd
