-- =====================================================================
-- 📚 EPUBs personnels (fiche Plus P1 : bibliothèque)
-- =====================================================================
-- Import personnel (pas de diffusion : CE SONT les fichiers du lecteur —
-- jamais publiés, jamais partagés). Quota : 5 gratuits, illimités en Plus
-- (vérifié à l'upload, pas au stockage : un quota dépassé après coup ne
-- supprime rien — on n'efface jamais la bibliothèque de quelqu'un pour
-- une limite).
--   - chapters JSONB [{title, html}] : HTML STRICT (allowlist p/h1-h6/
--     blockquote/li/em/strong/br + texte — scripts, styles, iframes,
--     images et handlers purgés au parse, jamais stockés).
--   - cover BYTEA (≤2 Mo) + coverMime : extraite du manifest, servie par
--     endpoint dédié (pas de blob dans les listes).
--   - fileSha : déduplication par contenu+propriétaire (réimporter le
--     même = 409 explicite, pas de doublon silencieux).
--   - progressChapter/progressPct : progression synchronisée (base du
--     multi-appareils P1 — le client la pousse, le serveur la garde).
--
-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS "Ebook" (
    "id"              TEXT NOT NULL,
    "ownerId"         UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    "title"           TEXT NOT NULL,
    "author"          TEXT NOT NULL DEFAULT '',
    "language"        TEXT NOT NULL DEFAULT '',
    "chapters"        JSONB NOT NULL DEFAULT '[]'::jsonb,
    "chapterCount"    INTEGER NOT NULL DEFAULT 0,
    "cover"           BYTEA,
    "coverMime"       TEXT,
    "fileSha"         TEXT NOT NULL,
    "sizeBytes"       INTEGER NOT NULL DEFAULT 0,
    "progressChapter" INTEGER NOT NULL DEFAULT 0,
    "progressPct"     SMALLINT NOT NULL DEFAULT 0,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ebook_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Ebook_title_check" CHECK (char_length("title") BETWEEN 1 AND 300),
    CONSTRAINT "Ebook_progress_check" CHECK ("progressChapter" >= 0 AND "progressPct" BETWEEN 0 AND 100),
    CONSTRAINT "Ebook_owner_file_unique" UNIQUE ("ownerId", "fileSha")
);

CREATE INDEX IF NOT EXISTS "Ebook_owner_idx"
    ON "Ebook"("ownerId", "createdAt" DESC);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS "Ebook";
-- +goose StatementEnd
