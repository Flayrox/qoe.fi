-- =====================================================================
-- 📝 Notes de lecture dans un EPUB personnel (fiche Plus P1)
-- =====================================================================
-- Une note = un passage (extrait sélectionné) et/ou un mot à soi, ancrés
-- à un CHAPITRE d'un livre personnel. Table DÉDIÉE (décision produit) :
-- les surlignages d'articles restent dans "Highlight" (accrochés à un
-- article publié, avec vote et visibilité publique) — rien n'est mélangé,
-- une note de livre n'a ni public ni upvotes, elle ne sort jamais du
-- compte qui l'a écrite.
--   - excerpt ≤ 1000 (tronqué au parse de l'entrée), note ≤ 4000 (refusée
--     si plus longue : on ne coupe jamais ce que quelqu'un a écrit).
--   - CHECK « pas les deux vides » : une ligne doit dire quelque chose.
--   - PAS de position d'ancrage : le rendu est un texte reconstruit
--     (HTML allowlist), un offset survivrait mal aux rééditions — on
--     assume une note par chapitre, honnêtement, plutôt qu'un faux
--     ancrage qui dériverait en silence.
--   - ON DELETE CASCADE sur le livre : supprimer un livre emporte ses
--     notes (elles n'ont aucun sens hors de leur chapitre).
--
-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS "EbookNote" (
    "id"           TEXT NOT NULL,
    "ebookId"      TEXT NOT NULL REFERENCES "Ebook"(id) ON DELETE CASCADE,
    "ownerId"      UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    "chapterIndex" INTEGER NOT NULL,
    "chapterTitle" TEXT NOT NULL DEFAULT '',
    "excerpt"      TEXT NOT NULL DEFAULT '',
    "note"         TEXT NOT NULL DEFAULT '',
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EbookNote_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "EbookNote_chapter_check" CHECK ("chapterIndex" >= 0),
    CONSTRAINT "EbookNote_excerpt_check" CHECK (char_length("excerpt") <= 1000),
    CONSTRAINT "EbookNote_note_check" CHECK (char_length("note") <= 4000),
    CONSTRAINT "EbookNote_not_empty_check" CHECK (char_length("excerpt") > 0 OR char_length("note") > 0)
);

CREATE INDEX IF NOT EXISTS "EbookNote_ebook_idx"
    ON "EbookNote"("ebookId", "chapterIndex", "createdAt");

CREATE INDEX IF NOT EXISTS "EbookNote_owner_idx"
    ON "EbookNote"("ownerId", "createdAt" DESC);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS "EbookNote";
-- +goose StatementEnd
