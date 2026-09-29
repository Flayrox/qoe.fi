-- =====================================================================
-- 🎧 File d'écoute (fiche Plus P1) : lectures à écouter plus tard
-- =====================================================================
-- Une file ordonnée d'articles par utilisateur (le TTS lit dans l'ordre).
-- Un seul enregistrement par (utilisateur, article) — ajouter deux fois =
-- no-op (idempotent, pas de doublon). position = ordre explicite (0, 1,
-- 2… — le client réordonne par suppressions/réajouts, pas de PATCH
-- reorder : YAGNI pour l'amorce). Supprimer un article ou un compte
-- cascade (pas d'entrée orpheline).
-- L'ajout VÉRIFIE le droit de téléchargement (comme le pack) : la file
-- sert le hors-ligne et le TTS — jamais de contenu interdit dedans.
--
-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS "ListenLater" (
    "id"        TEXT NOT NULL,
    "userId"    UUID NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
    "articleId" TEXT NOT NULL REFERENCES "Article"(id) ON DELETE CASCADE,
    "position"  INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListenLater_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ListenLater_unique" UNIQUE ("userId", "articleId")
);

CREATE INDEX IF NOT EXISTS "ListenLater_user_idx"
    ON "ListenLater"("userId", "position");
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS "ListenLater";
-- +goose StatementEnd
