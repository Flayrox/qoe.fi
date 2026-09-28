-- =====================================================================
-- ⚖️ Avis légaux — refus explicite tracé (fiche 04 §11)
-- =====================================================================
-- Exiger une acceptation sans permettre un refus, c'est un consentement
-- forcé : le silence ou l'absence ne valent ni acceptation ni refus. Cette
-- table enregistre le refus explicite d'une version, distinct de l'absence
-- d'acceptation — avec auteur, version exacte et date, comme les acceptations.
--
-- Effets : un document refusé reste « sans acceptation » (pas de contournement
-- des parcours qui exigent un accord), mais le refus est visible (plus de
-- relances aveugles), contestable et auditable. Refuser n'efface rien et ne
-- bloque ni l'export de données ni la suppression de compte, accessibles sans
-- accepter les nouvelles conditions.
--
-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS "legal_refusal" (
    "id"          TEXT NOT NULL,
    "user_id"     UUID NOT NULL,
    "document_id" TEXT NOT NULL,
    "version_id"  TEXT NOT NULL,
    "version"     TEXT NOT NULL,
    "locale"      TEXT NOT NULL DEFAULT 'fr',
    "source"      TEXT NOT NULL DEFAULT 'web',
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_refusal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "legal_refusal_unique" UNIQUE ("user_id", "version_id")
);

CREATE INDEX IF NOT EXISTS "legal_refusal_user_idx"
    ON "legal_refusal" ("user_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "legal_refusal_document_idx"
    ON "legal_refusal" ("document_id", "created_at" DESC);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS "legal_refusal";
-- +goose StatementEnd
