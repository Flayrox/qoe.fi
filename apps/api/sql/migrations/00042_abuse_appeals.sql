-- =====================================================================
-- ⚖️ Recours contre les mesures anti-abus (tranche 6, amorce — fiche 06 §8)
-- =====================================================================
-- Toute mesure contre un compte (limitation, suspension — humaine ou
-- automatique) est contestable par l'intéressé, Y COMPRIS suspendu : le
-- middleware n'exclut pas les suspendus de l'auth, le recours leur reste
-- ouvert (fiche tranche 6 : « ouverture accessible quand un compte est
-- restreint »). Exigences verrouillées ici :
--
--   - L'ouverture d'un recours NE LÈVE RIEN à elle seule (ni suspension, ni
--     limitation) : seule une décision humaine overturned clôt (tranche 6).
--   - On ne conteste que POUR SOI (sujet user:<soi>) : pas de recours pour
--     autrui, pas de recours sans verdict non-allow à contester.
--   - Anti-saturation : UN SEUL recours ouvert par (sujet, ouvreur) — index
--     unique partiel (tranche 6 : politique anti-saturation). Rouvrir après
--     clôture = nouveau dossier (l'historique reste).
--   - `Appeal` porte le dossier (statut, outcome, décision liée) ;
--     `AppealMessage` la messagerie utilisateur/staff (le staff écrit via la
--     console, l'utilisateur via ses routes — même table, auteur tracé).
--   - Le verdict humain qui tranche le recours porte `appealRef` (la colonne
--     attendait ce système depuis la 00039) : décision ↔ recours liés dans
--     les deux sens.
--
-- Périmètre assumé : les mesures contre un COMPTE uniquement (sujet user:).
-- Les retraits/déclassements de CONTENU attendront le système support
-- complet (tranche 6 pleine : pièces jointes, SLA, séparation
-- agent/réviseur). Documenté, pas oublié.
--
-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS "Appeal" (
    "id"          TEXT NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId"   TEXT NOT NULL,
    "decisionId"  TEXT,
    "openedBy"    TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'open',
    "outcome"     TEXT,
    "staffNote"   TEXT NOT NULL DEFAULT '',
    "decidedBy"   TEXT,
    "decidedAt"   TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Appeal_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Appeal_status_check" CHECK ("status" IN ('open', 'under_review', 'decided')),
    CONSTRAINT "Appeal_outcome_check" CHECK ("outcome" IS NULL OR "outcome" IN ('upheld', 'overturned')),
    CONSTRAINT "Appeal_decided_check" CHECK (
        ("status" = 'decided' AND "outcome" IS NOT NULL AND "decidedBy" IS NOT NULL AND "decidedAt" IS NOT NULL)
        OR ("status" <> 'decided')
    )
);

-- Un seul recours ouvert par (sujet, ouvreur) : pas de noyade du support.
CREATE UNIQUE INDEX IF NOT EXISTS "Appeal_open_unique_idx"
    ON "Appeal"("subjectType", "subjectId", "openedBy")
    WHERE "status" IN ('open', 'under_review');

-- File staff : ouverts d'abord, plus récents d'abord.
CREATE INDEX IF NOT EXISTS "Appeal_status_idx"
    ON "Appeal"("status", "createdAt" DESC);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS "AppealMessage" (
    "id"        TEXT NOT NULL,
    "appealId"  TEXT NOT NULL REFERENCES "Appeal"("id") ON DELETE CASCADE,
    "authorId"  TEXT NOT NULL,
    "body"      TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppealMessage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AppealMessage_body_check" CHECK (char_length("body") BETWEEN 1 AND 5000)
);

CREATE INDEX IF NOT EXISTS "AppealMessage_appeal_idx"
    ON "AppealMessage"("appealId", "createdAt");
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS "AppealMessage";
DROP TABLE IF EXISTS "Appeal";
-- +goose StatementEnd
