-- =====================================================================
-- ⚖️ Migration 00083 : Garantie atomique de la copie souveraine
-- =====================================================================
-- Le lot 2 (00082) créait la copie personnelle en Go, en best-effort
-- (`_, _, _ =`), et seulement sur certains chemins de publication.
-- Cette migration déplace la garantie dans PostgreSQL :
--
-- - `ensure_author_sovereign_copy()` crée (ou retrouve) la copie dans le
--   Publisher personnel de l'auteur, avec un slug unique et une catégorie
--   par défaut.
-- - `ensure_personal_publisher()` auto-provisionne l'espace personnel
--   manquant (les comptes historiques n'en ont pas tous un).
-- - Le trigger `trg_provision_author_sovereign_copy` s'exécute dans la
--   même transaction que l'INSERT/UPDATE de l'article : si la copie ne
--   peut pas être créée, la soumission/publication échoue, elle n'est
--   jamais silencieusement perdue.
-- - Un index unique partiel empêche deux copies pour le même
--   (originArticleId, authorId), y compris en concurrence.
-- - Le backfill couvre les articles média déjà soumis/publiés.
-- =====================================================================

-- +goose Up
-- +goose StatementBegin

-- 1. Nettoyage des lignes souveraines incohérentes (créées avant la
--    contrainte de cohérence). On ne supprime aucun contenu : les copies
--    en trop redeviennent de simples articles personnels détachés.
UPDATE "Article"
SET "isAuthorSovereignCopy" = false,
    "canonicalType" = 'ORIGINAL',
    "originArticleId" = NULL,
    "canonicalUrl" = NULL,
    "updatedAt" = now()
WHERE "isAuthorSovereignCopy" = true
  AND ("originArticleId" IS NULL OR "canonicalType" <> 'PERSONAL_FORK');

UPDATE "Article"
SET "canonicalType" = 'ORIGINAL',
    "updatedAt" = now()
WHERE "isAuthorSovereignCopy" = false
  AND "canonicalType" = 'PERSONAL_FORK';

-- 2. Dédoublonnage : on garde la copie la plus récemment modifiée pour
--    chaque (originArticleId, authorId) et on détache les autres sans les
--    supprimer.
WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY "originArticleId", "authorId"
               ORDER BY "updatedAt" DESC NULLS LAST, "createdAt" ASC, id
           ) AS rn
    FROM "Article"
    WHERE "isAuthorSovereignCopy" = true
      AND "originArticleId" IS NOT NULL
)
UPDATE "Article" a
SET "isAuthorSovereignCopy" = false,
    "canonicalType" = 'ORIGINAL',
    "originArticleId" = NULL,
    "canonicalUrl" = NULL,
    "updatedAt" = now()
FROM ranked r
WHERE a.id = r.id
  AND r.rn > 1;

-- 3. Cohérence : une copie souveraine est forcément un PERSONAL_FORK
--    rattaché à un article d'origine.
ALTER TABLE "Article" DROP CONSTRAINT IF EXISTS "Article_sovereign_copy_check";
ALTER TABLE "Article" ADD CONSTRAINT "Article_sovereign_copy_check"
    CHECK (
        "isAuthorSovereignCopy" = ("canonicalType" = 'PERSONAL_FORK')
        AND (NOT "isAuthorSovereignCopy" OR "originArticleId" IS NOT NULL)
    );

-- 4. Un seul fork souverain par (article média, auteur), même en concurrence.
CREATE UNIQUE INDEX IF NOT EXISTS "Article_origin_author_sovereign_key"
    ON "Article"("originArticleId", "authorId")
    WHERE "isAuthorSovereignCopy" = true;

-- 5. URL publique réelle d'un article (catégorie + domaine / username),
--    utilisée pour la mention canonique de filiation.
CREATE OR REPLACE FUNCTION article_public_url(article_id TEXT)
RETURNS TEXT AS $$
DECLARE
    v_article RECORD;
    v_category_path TEXT;
BEGIN
    SELECT a.slug,
           a."categoryId",
           p.type,
           p."customDomain",
           p.subdomain,
           p.slug AS publisher_slug
    INTO v_article
    FROM "Article" a
    JOIN "Publisher" p ON p.id = a."publisherId"
    WHERE a.id = article_id;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    IF v_article."categoryId" IS NOT NULL THEN
        WITH RECURSIVE chain AS (
            SELECT c.id, c.slug, c."parentId", 1 AS depth
            FROM "Category" c
            WHERE c.id = v_article."categoryId"
            UNION ALL
            SELECT parent.id, parent.slug, parent."parentId", child.depth + 1
            FROM "Category" parent
            JOIN chain child ON child."parentId" = parent.id
        )
        SELECT string_agg(slug, '/' ORDER BY depth DESC)
        INTO v_category_path
        FROM chain;
    END IF;

    IF v_article."customDomain" IS NOT NULL AND v_article."customDomain" <> '' THEN
        RETURN 'https://' || v_article."customDomain" || '/'
            || COALESCE(v_category_path || '/', '') || v_article.slug;
    ELSIF v_article.subdomain IS NOT NULL AND v_article.subdomain <> '' THEN
        RETURN 'https://' || v_article.subdomain || '.qoe.fi/'
            || COALESCE(v_category_path || '/', '') || v_article.slug;
    ELSIF v_article.type = 'PERSONAL' THEN
        RETURN 'https://qoe.fi/' || v_article.publisher_slug || '/a/' || v_article.slug;
    ELSE
        RETURN 'https://qoe.fi/' || COALESCE(v_category_path || '/', '') || v_article.slug;
    END IF;
END;
$$ LANGUAGE plpgsql STABLE;

-- 6. Le provisioning d'un espace personnel choisit déjà un slug unique.
--    Le trigger de synchronisation User → Publisher ne doit pas le réécrire
--    avec le username (collision) ni renommer le compte via le trigger inverse.
CREATE OR REPLACE FUNCTION sync_user_to_personal_publisher()
RETURNS TRIGGER AS $$
BEGIN
    IF current_setting('qoe.personal_publisher_provisioning', true) = 'on' THEN
        RETURN NEW;
    END IF;
    IF NEW."publisherId" IS NOT NULL THEN
        UPDATE "Publisher"
        SET slug = COALESCE(NEW.username, slug),
            name = COALESCE(NULLIF(NEW.name, ''), NEW.username, name),
            "logoUrl" = NEW."logoUrl",
            "updatedAt" = now()
        WHERE id = NEW."publisherId"
          AND type = 'PERSONAL'
          AND (
            slug IS DISTINCT FROM NEW.username
            OR name IS DISTINCT FROM COALESCE(NULLIF(NEW.name, ''), NEW.username, name)
            OR "logoUrl" IS DISTINCT FROM NEW."logoUrl"
          );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6b. Espace personnel de l'auteur, créé à la demande s'il manque.
--     Parité avec users.GetOrCreatePersonalPublisher : nom et slug depuis
--     le compte, suffixe en cas de collision.
CREATE OR REPLACE FUNCTION ensure_personal_publisher(target_user_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_publisher_id TEXT;
    v_publisher_type "PublisherType";
    v_username TEXT;
    v_name TEXT;
    v_logo_url TEXT;
    v_base_slug TEXT;
    v_slug TEXT;
    v_suffix INTEGER := 0;
BEGIN
    -- Sérialise les provisioning concurrents pour le même compte.
    PERFORM pg_advisory_xact_lock(hashtext(target_user_id::text)::bigint);

    SELECT u."publisherId", p.type, u.username, u.name, u."logoUrl"
    INTO v_publisher_id, v_publisher_type, v_username, v_name, v_logo_url
    FROM "User" u
    LEFT JOIN "Publisher" p ON p.id = u."publisherId"
    WHERE u.id = target_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'utilisateur introuvable: %', target_user_id;
    END IF;

    IF v_publisher_id IS NOT NULL AND v_publisher_type = 'PERSONAL' THEN
        RETURN v_publisher_id;
    END IF;

    IF v_publisher_id IS NOT NULL AND v_publisher_type IS DISTINCT FROM 'PERSONAL' THEN
        RAISE EXCEPTION 'publisher non personnel pour utilisateur %', target_user_id;
    END IF;

    v_base_slug := COALESCE(NULLIF(v_username, ''), 'auteur-' || left(target_user_id::text, 8));
    v_slug := v_base_slug;

    WHILE EXISTS (
        SELECT 1 FROM "Publisher" p
        WHERE lower(p.slug) = lower(v_slug)
    ) LOOP
        v_suffix := v_suffix + 1;
        v_slug := v_base_slug || '-' || v_suffix;
    END LOOP;

    PERFORM set_config('qoe.personal_publisher_provisioning', 'on', true);

    INSERT INTO "Publisher" (
        id, type, name, slug, "logoUrl", "layoutStyle", "updatedAt"
    ) VALUES (
        gen_random_uuid()::text,
        'PERSONAL',
        COALESCE(NULLIF(v_name, ''), NULLIF(v_username, ''), 'Auteur'),
        v_slug,
        NULLIF(v_logo_url, ''),
        'default',
        now()
    )
    RETURNING id INTO v_publisher_id;

    UPDATE "User"
    SET "publisherId" = v_publisher_id, "updatedAt" = now()
    WHERE id = target_user_id;

    PERFORM set_config('qoe.personal_publisher_provisioning', '', true);

    RETURN v_publisher_id;
END;
$$ LANGUAGE plpgsql;

-- 7. Création idempotente de la copie souveraine. Utilisée à la fois par
--    le trigger automatique et par le fork manuel (bouton Studio).
CREATE OR REPLACE FUNCTION ensure_author_sovereign_copy(
    media_article_id TEXT,
    target_author_id UUID DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
    v_article RECORD;
    v_publisher_type "PublisherType";
    v_target_author UUID;
    v_personal_publisher_id TEXT;
    v_existing_id TEXT;
    v_new_id TEXT;
    v_base_slug TEXT;
    v_slug TEXT;
    v_suffix INTEGER := 0;
    v_category_id TEXT;
    v_content TEXT;
    v_canonical_url TEXT;
    v_attempt INTEGER;
BEGIN
    SELECT a.*, p.type AS publisher_type
    INTO v_article
    FROM "Article" a
    JOIN "Publisher" p ON p.id = a."publisherId"
    WHERE a.id = media_article_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'article média introuvable: %', media_article_id;
    END IF;

    IF v_article.publisher_type <> 'MEDIA' THEN
        RETURN NULL;
    END IF;

    v_target_author := COALESCE(target_author_id, v_article."authorId");

    -- L'article d'origine devient l'archive média (une seule fois).
    UPDATE "Article"
    SET "canonicalType" = 'MEDIA_ARCHIVE', "updatedAt" = now()
    WHERE id = media_article_id
      AND "canonicalType" = 'ORIGINAL';

    SELECT a.id INTO v_existing_id
    FROM "Article" a
    WHERE a."originArticleId" = media_article_id
      AND a."authorId" = v_target_author
      AND a."isAuthorSovereignCopy" = true
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        RETURN v_existing_id;
    END IF;

    v_personal_publisher_id := ensure_personal_publisher(v_target_author);

    IF v_personal_publisher_id = v_article."publisherId" THEN
        RAISE EXCEPTION 'publisher personnel identique au média pour article %', media_article_id;
    END IF;

    v_base_slug := COALESCE(NULLIF(v_article.slug, ''), 'article-' || left(v_article.id, 8));
    v_slug := v_base_slug;

    WHILE EXISTS (
        SELECT 1 FROM "Article" a
        WHERE a."publisherId" = v_personal_publisher_id
          AND a.slug = v_slug
    ) LOOP
        v_suffix := v_suffix + 1;
        v_slug := v_base_slug || '-' || v_suffix;
    END LOOP;

    SELECT c.id INTO v_category_id
    FROM "Category" c
    WHERE c."publisherId" = v_personal_publisher_id
      AND c."isDefault" = true
    LIMIT 1;

    v_content := COALESCE(NULLIF(v_article."draftContent", ''), v_article.content, '');
    v_canonical_url := article_public_url(media_article_id);

    FOR v_attempt IN 1..10 LOOP
        BEGIN
            v_new_id := NULL;
            INSERT INTO "Article" (
                id, title, slug, content, published, "isPremium", visibility,
                "readingTime", "allowPublicAnnotations", "allowComments", "allowDownload",
                status, "publisherId", "authorId", "categoryId", "seoTitle", "seoDescription",
                "imageUrl", "showOnPersonalProfile", "originArticleId", "canonicalType",
                "isAuthorSovereignCopy", "canonicalUrl", "updatedAt", "tierId"
            ) VALUES (
                gen_random_uuid()::text, v_article.title, v_slug, v_content, false,
                v_article."isPremium", v_article.visibility,
                v_article."readingTime", v_article."allowPublicAnnotations",
                v_article."allowComments", v_article."allowDownload",
                'DRAFT', v_personal_publisher_id, v_target_author, v_category_id,
                v_article."seoTitle", v_article."seoDescription",
                v_article."imageUrl", true, media_article_id, 'PERSONAL_FORK',
                true, v_canonical_url, now(), v_article."tierId"
            )
            ON CONFLICT DO NOTHING
            RETURNING id INTO v_new_id;

            IF v_new_id IS NOT NULL THEN
                -- Parité avec l'ancien chemin Go : l'attribution principale
                -- et l'événement CREATED accompagnent la copie. L'audit ne
                -- doit jamais faire échouer la soumission/publication.
                BEGIN
                    INSERT INTO "ArticleAttribution" (
                        id, "articleId", "userId", role, "order", "isVisible",
                        "consentStatus", "consentUpdatedAt", "updatedAt"
                    ) VALUES (
                        gen_random_uuid()::text, v_new_id, v_target_author,
                        'PRIMARY_AUTHOR', 0, true, 'ACCEPTED', now(), now()
                    )
                    ON CONFLICT ("articleId", "userId") DO UPDATE SET
                        role = 'PRIMARY_AUTHOR', "order" = 0, "isVisible" = true,
                        "consentStatus" = 'ACCEPTED', "updatedAt" = now();

                    INSERT INTO "ArticleEvent" ("articleId", "publisherId", "actorId", "type", "toStatus")
                    VALUES (v_new_id, v_personal_publisher_id, v_target_author, 'CREATED', 'DRAFT');
                EXCEPTION WHEN OTHERS THEN
                    RAISE WARNING 'effets de bord de la copie souveraine % ignorés: %', v_new_id, SQLERRM;
                END;

                RETURN v_new_id;
            END IF;

            SELECT a.id INTO v_existing_id
            FROM "Article" a
            WHERE a."originArticleId" = media_article_id
              AND a."authorId" = v_target_author
              AND a."isAuthorSovereignCopy" = true
            LIMIT 1;

            IF v_existing_id IS NOT NULL THEN
                RETURN v_existing_id;
            END IF;

            -- Conflit de slug (pas de copie souveraine concurrente) :
            -- on essaie le suffixe suivant.
            v_suffix := v_suffix + 1;
            v_slug := v_base_slug || '-' || v_suffix;
        EXCEPTION WHEN unique_violation THEN
            SELECT a.id INTO v_existing_id
            FROM "Article" a
            WHERE a."originArticleId" = media_article_id
              AND a."authorId" = v_target_author
              AND a."isAuthorSovereignCopy" = true
            LIMIT 1;

            IF v_existing_id IS NOT NULL THEN
                RETURN v_existing_id;
            END IF;

            v_suffix := v_suffix + 1;
            v_slug := v_base_slug || '-' || v_suffix;
        END;
    END LOOP;

    RAISE EXCEPTION 'copie souveraine impossible pour article %', media_article_id;
END;
$$ LANGUAGE plpgsql;

-- 8. Trigger : toute entrée en média (soumission ou publication) provisionne
--    la copie dans la même transaction. Un échec annule l'écriture.
CREATE OR REPLACE FUNCTION provision_author_sovereign_copy()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."status" IN ('SUBMITTED', 'PUBLISHED') THEN
        PERFORM ensure_author_sovereign_copy(NEW.id, NEW."authorId");
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_provision_author_sovereign_copy ON "Article";
CREATE TRIGGER trg_provision_author_sovereign_copy
AFTER INSERT OR UPDATE OF status, published, "publisherId" ON "Article"
FOR EACH ROW
WHEN (NEW."status" IN ('SUBMITTED', 'PUBLISHED'))
EXECUTE FUNCTION provision_author_sovereign_copy();

-- 9. Backfill des articles média déjà soumis/publiés. La fonction est
--    idempotente : on l'appelle aussi quand une copie existe déjà, afin de
--    corriger le canonicalType de l'origine (ORIGINAL -> MEDIA_ARCHIVE).
--    `ensure_personal_publisher` crée l'espace personnel manquant ; les
--    comptes dont le publisherId pointe vers un publisher non personnel sont
--    signalés et ignorés.
DO $$
DECLARE
    r RECORD;
    v_processed INTEGER := 0;
    v_skipped INTEGER := 0;
BEGIN
    FOR r IN
        SELECT a.id, a."authorId"
        FROM "Article" a
        JOIN "Publisher" p ON p.id = a."publisherId"
        JOIN "User" u ON u.id = a."authorId"
        LEFT JOIN "Publisher" up ON up.id = u."publisherId"
        WHERE p.type = 'MEDIA'
          AND a."status" IN ('SUBMITTED', 'PUBLISHED')
          AND (u."publisherId" IS NULL OR up.type = 'PERSONAL')
    LOOP
        PERFORM ensure_author_sovereign_copy(r.id, r."authorId");
        v_processed := v_processed + 1;
    END LOOP;

    FOR r IN
        SELECT a.id
        FROM "Article" a
        JOIN "Publisher" p ON p.id = a."publisherId"
        JOIN "User" u ON u.id = a."authorId"
        JOIN "Publisher" up ON up.id = u."publisherId"
        WHERE p.type = 'MEDIA'
          AND a."status" IN ('SUBMITTED', 'PUBLISHED')
          AND up.type <> 'PERSONAL'
    LOOP
        v_skipped := v_skipped + 1;
        RAISE NOTICE 'copie souveraine ignorée (publisher non personnel): article %', r.id;
    END LOOP;

    RAISE NOTICE 'backfill copies souveraines: % traitées, % ignorées', v_processed, v_skipped;
END;
$$;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TRIGGER IF EXISTS trg_provision_author_sovereign_copy ON "Article";
DROP FUNCTION IF EXISTS provision_author_sovereign_copy();
DROP FUNCTION IF EXISTS ensure_author_sovereign_copy(TEXT, UUID);
DROP FUNCTION IF EXISTS ensure_personal_publisher(UUID);
DROP FUNCTION IF EXISTS article_public_url(TEXT);
DROP INDEX IF EXISTS "Article_origin_author_sovereign_key";
ALTER TABLE "Article" DROP CONSTRAINT IF EXISTS "Article_sovereign_copy_check";
-- +goose StatementEnd
