-- =====================================================================
-- 📸 Migration 00085 : Snapshots d'articles, coffre-fort invisible &
--                        souveraineté collaborative universelle
-- =====================================================================
-- 1. Table `ArticleSnapshot` : coffre-fort de contenu, traçabilité des
--    auteurs de modifications et point de restauration anti-sabotage.
-- 2. Colonne `isClaimed` sur `Article` : les copies souveraines automatiques
--    sont créées invisibles (`isClaimed = false`), éliminant les doublons
--    parasites du Studio tant que l'auteur ne les a pas réclamées.
-- 3. Extension de la souveraineté aux co-auteurs sur espace personnel et
--    conservation des droits des co-auteurs révoqués (statut REVOKED).
-- =====================================================================

-- +goose Up
-- +goose StatementBegin

-- 1. Table ArticleSnapshot
CREATE TABLE IF NOT EXISTS "ArticleSnapshot" (
    "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "articleId"   TEXT NOT NULL,
    "actorId"     UUID,
    "title"       TEXT NOT NULL,
    "content"     TEXT NOT NULL,
    "wordCount"   INTEGER NOT NULL DEFAULT 0,
    "reason"      TEXT NOT NULL DEFAULT 'AUTO',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleSnapshot_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ArticleSnapshot_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ArticleSnapshot_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ArticleSnapshot_reason_check" CHECK ("reason" IN (
        'INITIAL', 'AUTO', 'AUTHOR_SWITCH', 'SUBMITTED', 'PUBLISHED',
        'BEFORE_REVOCATION', 'BEFORE_RESTORE', 'MANUAL'
    ))
);

CREATE INDEX IF NOT EXISTS "ArticleSnapshot_articleId_createdAt_idx"
    ON "ArticleSnapshot" ("articleId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "ArticleSnapshot_articleId_actorId_createdAt_idx"
    ON "ArticleSnapshot" ("articleId", "actorId", "createdAt" DESC);

-- 2. Colonne isClaimed sur Article
ALTER TABLE "Article" ADD COLUMN IF NOT EXISTS "isClaimed" BOOLEAN NOT NULL DEFAULT true;

-- Nettoyage rétroactif : les copies souveraines automatiques encore brouillon
-- et vierges de draftContent deviennent non-réclamées pour nettoyer immédiatement
-- la liste d'articles de Studio sans perdre le contenu.
UPDATE "Article"
SET "isClaimed" = false
WHERE "isAuthorSovereignCopy" = true
  AND "status" = 'DRAFT'
  AND ("draftContent" IS NULL OR "draftContent" = '')
  AND "published" = false;

-- 3. Mise à jour de ensure_author_sovereign_copy pour gérer isClaimed et
--    permettre aux co-auteurs d'espaces personnels de forker leur exemplaire.
CREATE OR REPLACE FUNCTION ensure_author_sovereign_copy(
    media_article_id TEXT,
    target_author_id UUID DEFAULT NULL,
    claim_now BOOLEAN DEFAULT false,
    override_content TEXT DEFAULT NULL,
    override_title TEXT DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
    v_article RECORD;
    v_target_author UUID;
    v_personal_publisher_id TEXT;
    v_existing_id TEXT;
    v_new_id TEXT;
    v_base_slug TEXT;
    v_slug TEXT;
    v_suffix INTEGER := 0;
    v_category_id TEXT;
    v_content TEXT;
    v_title TEXT;
    v_canonical_url TEXT;
    v_attempt INTEGER;
BEGIN
    SELECT a.*, p.type AS publisher_type
    INTO v_article
    FROM "Article" a
    JOIN "Publisher" p ON p.id = a."publisherId"
    WHERE a.id = media_article_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'article d''origine introuvable: %', media_article_id;
    END IF;

    v_target_author := COALESCE(target_author_id, v_article."authorId");

    -- L'auteur principal d'un article personnel possède déjà l'original :
    -- il ne peut pas forker vers son propre espace.
    IF v_article.publisher_type <> 'MEDIA' AND v_article."authorId" = v_target_author THEN
        RETURN NULL;
    END IF;

    -- L'article média devient MEDIA_ARCHIVE une seule fois
    IF v_article.publisher_type = 'MEDIA' THEN
        UPDATE "Article"
        SET "canonicalType" = 'MEDIA_ARCHIVE', "updatedAt" = now()
        WHERE id = media_article_id
          AND "canonicalType" = 'ORIGINAL';
    END IF;

    -- Vérifie si une copie existe déjà
    SELECT a.id INTO v_existing_id
    FROM "Article" a
    WHERE a."originArticleId" = media_article_id
      AND a."authorId" = v_target_author
      AND a."isAuthorSovereignCopy" = true
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        IF claim_now THEN
            UPDATE "Article"
            SET "isClaimed" = true,
                "title" = COALESCE(override_title, "title"),
                "content" = COALESCE(override_content, "content"),
                "updatedAt" = now()
            WHERE id = v_existing_id;
        END IF;
        RETURN v_existing_id;
    END IF;

    v_personal_publisher_id := ensure_personal_publisher(v_target_author);

    IF v_personal_publisher_id = v_article."publisherId" THEN
        RAISE EXCEPTION 'publisher personnel identique au publisher d''origine pour article %', media_article_id;
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

    v_content := COALESCE(override_content, NULLIF(v_article."draftContent", ''), v_article.content, '');
    v_title := COALESCE(override_title, v_article.title);
    v_canonical_url := article_public_url(media_article_id);

    FOR v_attempt IN 1..10 LOOP
        BEGIN
            v_new_id := NULL;
            INSERT INTO "Article" (
                id, title, slug, content, published, "isPremium", visibility,
                "readingTime", "allowPublicAnnotations", "allowComments", "allowDownload",
                status, "publisherId", "authorId", "categoryId", "seoTitle", "seoDescription",
                "imageUrl", "showOnPersonalProfile", "originArticleId", "canonicalType",
                "isAuthorSovereignCopy", "isClaimed", "canonicalUrl", "updatedAt", "tierId"
            ) VALUES (
                gen_random_uuid()::text, v_title, v_slug, v_content, false,
                v_article."isPremium", v_article.visibility,
                v_article."readingTime", v_article."allowPublicAnnotations",
                v_article."allowComments", v_article."allowDownload",
                'DRAFT', v_personal_publisher_id, v_target_author, v_category_id,
                v_article."seoTitle", v_article."seoDescription",
                v_article."imageUrl", true, media_article_id, 'PERSONAL_FORK',
                true, claim_now, v_canonical_url, now(), v_article."tierId"
            )
            ON CONFLICT DO NOTHING
            RETURNING id INTO v_new_id;

            IF v_new_id IS NOT NULL THEN
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
                    RAISE WARNING 'effets de bord de la copie % ignorés: %', v_new_id, SQLERRM;
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
                IF claim_now THEN
                    UPDATE "Article" SET "isClaimed" = true WHERE id = v_existing_id;
                END IF;
                RETURN v_existing_id;
            END IF;

            v_suffix := v_suffix + 1;
            v_slug := v_base_slug || '-' || v_suffix;
        END;
    END LOOP;

    RAISE EXCEPTION 'impossible de provisionner la copie pour article % et utilisateur %', media_article_id, v_target_author;
END;
$$ LANGUAGE plpgsql;

-- 4. Triggers de provisionnement mis à jour (créent avec isClaimed = false par défaut)
CREATE OR REPLACE FUNCTION provision_author_sovereign_copy()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
    v_publisher_type "PublisherType";
BEGIN
    IF NEW."status" NOT IN ('SUBMITTED', 'PUBLISHED') THEN
        RETURN NEW;
    END IF;

    -- Création d'un snapshot à la soumission / publication
    INSERT INTO "ArticleSnapshot" ("articleId", "actorId", "title", "content", "reason", "createdAt")
    VALUES (
        NEW.id, NEW."authorId", NEW.title,
        COALESCE(NULLIF(NEW."draftContent", ''), NEW.content, ''),
        CASE WHEN NEW."status" = 'PUBLISHED' THEN 'PUBLISHED' ELSE 'SUBMITTED' END,
        now()
    );

    SELECT p.type INTO v_publisher_type
    FROM "Publisher" p
    WHERE p.id = NEW."publisherId";

    IF v_publisher_type = 'MEDIA' THEN
        PERFORM ensure_author_sovereign_copy(NEW.id, NEW."authorId", false);
    END IF;

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
        PERFORM ensure_author_sovereign_copy(NEW.id, r."userId", false);
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

    IF NEW."userId" = v_article."authorId" THEN
        RETURN NEW;
    END IF;

    -- Pour un article média soumis ou publié
    IF v_article.type = 'MEDIA' AND v_article.status IN ('SUBMITTED', 'PUBLISHED') THEN
        PERFORM ensure_author_sovereign_copy(NEW."articleId", NEW."userId", false);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Backfill d'un snapshot initial pour les articles existants non pourvus
INSERT INTO "ArticleSnapshot" ("articleId", "actorId", "title", "content", "reason", "createdAt")
SELECT a.id, a."authorId", a.title, a.content, 'INITIAL', a."createdAt"
FROM "Article" a
WHERE NOT EXISTS (SELECT 1 FROM "ArticleSnapshot" s WHERE s."articleId" = a.id)
  AND a."isAuthorSovereignCopy" = false
ON CONFLICT DO NOTHING;

-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS "ArticleSnapshot";
ALTER TABLE "Article" DROP COLUMN IF EXISTS "isClaimed";
-- +goose StatementEnd
