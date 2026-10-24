-- Catégorie par défaut « Non classé » (slug public stable : uncategorized).
-- Invariants :
--   * une seule catégorie par défaut par publication ;
--   * elle ne peut être ni supprimée ni renommée (nom/slug/parent figés) ;
--   * les articles sans catégorie lui sont rattachés ;
--   * elle n'apparaît pas dans la navigation publique des catégories.
--
-- ⚠️ Les annotations goose sont obligatoires : la très grande majorité des
-- migrations du projet en portent, et goose refuse de parser un fichier qui
-- n'en a pas dans ce cas. Sans elles, la chaîne s'arrêtait ici et les
-- migrations 64 à 66 n'étaient jamais appliquées.

-- +goose Up
ALTER TABLE "Category"
    ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "Category_publicationId_default_key"
    ON "Category" ("publicationId")
    WHERE "isDefault" = true;

INSERT INTO "Category" (id, name, slug, description, "publicationId", "parentId", "isDefault")
SELECT gen_random_uuid()::text, 'Non classé', 'uncategorized', NULL, p.id, NULL, true
FROM "Publication" p
WHERE NOT EXISTS (
    SELECT 1 FROM "Category" c
    WHERE c."publicationId" = p.id AND c."isDefault" = true
);

UPDATE "Article" a
SET "categoryId" = c.id
FROM "Category" c
WHERE c."publicationId" = a."publicationId"
  AND c."isDefault" = true
  AND a."categoryId" IS NULL;

-- +goose Down
DROP INDEX IF EXISTS "Category_publicationId_default_key";
ALTER TABLE "Category" DROP COLUMN IF EXISTS "isDefault";
