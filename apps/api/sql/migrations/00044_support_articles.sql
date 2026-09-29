-- =====================================================================
-- 📝 Articles d'aide gérables (tranche 6) : le centre d'aide sans redéployer
-- =====================================================================
-- La FAQ statique de la vitrine couvre le démarrage, mais le staff doit
-- pouvoir publier, corriger et réordonner les articles SANS déploiement —
-- et SURCHARGER une entrée par défaut (même slug : la version console gagne,
-- le statique reste le repli si l'API est injoignable).
-- Body en texte brut (pas de markdown : rendu whitespace-pre-wrap, zéro
-- dépendance, pas d'injection HTML — le staff écrit, il ne code pas).
--
-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS "SupportArticle" (
    "id"        TEXT NOT NULL,
    "slug"      TEXT NOT NULL,
    "titleFr"   TEXT NOT NULL,
    "titleEn"   TEXT NOT NULL,
    "bodyFr"    TEXT NOT NULL,
    "bodyEn"    TEXT NOT NULL,
    "position"  INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportArticle_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SupportArticle_slug_unique" UNIQUE ("slug"),
    CONSTRAINT "SupportArticle_slug_check" CHECK ("slug" ~ '^[a-z0-9-]{3,80}$'),
    CONSTRAINT "SupportArticle_title_check" CHECK (
        char_length("titleFr") BETWEEN 5 AND 200 AND char_length("titleEn") BETWEEN 5 AND 200),
    CONSTRAINT "SupportArticle_body_check" CHECK (
        char_length("bodyFr") BETWEEN 1 AND 10000 AND char_length("bodyEn") BETWEEN 1 AND 10000)
);

-- Liste publique : publiés, ordre voulu puis récents.
CREATE INDEX IF NOT EXISTS "SupportArticle_published_idx"
    ON "SupportArticle"("published", "position", "createdAt" DESC);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS "SupportArticle";
-- +goose StatementEnd
