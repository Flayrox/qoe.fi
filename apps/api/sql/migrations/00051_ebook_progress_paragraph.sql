-- =====================================================================
-- 📖 Reprise de lecture au paragraphe visible (fiche Plus P1)
-- =====================================================================
-- La progression ne disait que « chapitre 3 à 42 % » : rouvrir un livre de
-- 300 pages reposait donc au début du chapitre. On ajoute l'index du
-- premier paragraphe VISIBLE du chapitre courant — granularité assumée
-- (paragraphe, pas caractère) : un offset de caractères donnerait une
-- fausse précision, il dériverait dès que le rendu change (police, thème,
-- largeur), alors qu'un index d'élément rendu est stable et suffit à
-- retrouver exactement où on en était.
-- Reste de la doctrine : last-write-wins assumé (pas de fusion
-- vectorielle à cette échelle), valeurs bornées par CHECK, et un livre
-- jamais ouvert reste à 0 (aucune reprise inventée).
--
-- +goose Up
-- +goose StatementBegin
ALTER TABLE "Ebook" ADD COLUMN IF NOT EXISTS "progressParagraph" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Ebook" ADD CONSTRAINT "Ebook_paragraph_check" CHECK ("progressParagraph" >= 0);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE "Ebook" DROP CONSTRAINT IF EXISTS "Ebook_paragraph_check";
ALTER TABLE "Ebook" DROP COLUMN IF EXISTS "progressParagraph";
-- +goose StatementEnd
