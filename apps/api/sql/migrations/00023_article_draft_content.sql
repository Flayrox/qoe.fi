-- +goose Up
-- Brouillons de travail pour les articles déjà publiés.
-- Permet de modifier un article en ligne sans écraser son contenu public avant publication explicite.
ALTER TABLE "Article" ADD COLUMN IF NOT EXISTS "draftContent" TEXT;

-- +goose Down
ALTER TABLE "Article" DROP COLUMN IF EXISTS "draftContent";
