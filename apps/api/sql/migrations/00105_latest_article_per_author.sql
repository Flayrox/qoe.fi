-- +goose Up
-- Autorité unique du « dernier article publié par auteur » : les suggestions
-- home recopiaient un ROW_NUMBER() sur (createdAt DESC, title) dans leurs deux
-- branches (vecteur / cold start), avec un départage qui n'était pas l'id.
CREATE VIEW "LatestArticlePerAuthor" AS
SELECT DISTINCT ON ("authorId")
    "authorId", id, title, embedding, "publisherId"
FROM "Article"
WHERE published = true
ORDER BY "authorId", "createdAt" DESC, id DESC;

-- +goose Down
DROP VIEW IF EXISTS "LatestArticlePerAuthor";
