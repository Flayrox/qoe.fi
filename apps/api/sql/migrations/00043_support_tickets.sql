-- =====================================================================
-- 🎫 Support général (tranche 6) : dossiers hors recours anti-abus
-- =====================================================================
-- Le recours (00042) conteste une mesure précise avec effet (upheld /
-- overturned). Le support couvre le RESTE : compte restreint ou perdu
-- (MFA), retrait/déclassement de contenu, API refusée, import refusé ou
-- suspendu, livraison d'e-mails, signalement, autre. Règles verrouillées :
--
--   - Ouverture accessible Y COMPRIS compte restreint (l'auth n'exclut pas
--     les suspendus) ; l'ouverture NE CHANGE RIEN (ni suspension, ni
--     permission — seule une décision staff explicite agit, par les chemins
--     existants, jamais ici).
--   - Anti-saturation : UN SEUL dossier ouvert par (ouvreur, kind) — index
--     unique partiel. Un autre problème du même type s'écrit DANS le
--     dossier ouvert (messages), pas dans un doublon.
--   - Conflit d'intérêts : le staff ne clôt JAMAIS son propre dossier
--     (openedBy == closedBy refusé en applicatif). L'assignation à soi-même
--     est tracée mais tolérée (structure solo : interdire bloquerait tout).
--   - `relatedType`/`relatedId` lient sans FK (appeal:xxx, decision:xxx,
--     import:xxx, user:xxx...) : découplé, requêtable, jamais bloquant.
--   - Statuts : open → under_review → closed. closed = clos (nouveau
--     dossier pour rouvrir, historique conservé). Pas d'outcome fermé :
--     un support ne tranche pas comme un recours (pas de upheld/overturned
--     universel) — la résolution est décrite en clair (staffNote + reply).
--
-- Périmètre assumé : messages texte 1-5000 (pas de pièces jointes : pas
-- d'infra d'upload contrôlée — résidu documenté, pas un upload sauvage).
-- Notifications : même résidu ENUM que les recours (lot à part).
--
-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS "SupportTicket" (
    "id"          TEXT NOT NULL,
    "kind"        TEXT NOT NULL,
    "subject"     TEXT NOT NULL,
    "openedBy"    TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'open',
    "assignee"    TEXT,
    "relatedType" TEXT NOT NULL DEFAULT '',
    "relatedId"   TEXT NOT NULL DEFAULT '',
    "staffNote"   TEXT NOT NULL DEFAULT '',
    "closedBy"    TEXT,
    "closedAt"    TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SupportTicket_kind_check" CHECK ("kind" IN (
        'account_restricted', 'account_lost', 'content_moderation',
        'api_access', 'import_issue', 'delivery', 'report_issue', 'other'
    )),
    CONSTRAINT "SupportTicket_status_check" CHECK ("status" IN ('open', 'under_review', 'closed')),
    CONSTRAINT "SupportTicket_subject_check" CHECK (char_length("subject") BETWEEN 5 AND 200),
    CONSTRAINT "SupportTicket_closed_check" CHECK (
        ("status" = 'closed' AND "closedBy" IS NOT NULL AND "closedAt" IS NOT NULL)
        OR ("status" <> 'closed')
    )
);

-- Un seul dossier ouvert par (ouvreur, kind) : pas de noyade du support.
CREATE UNIQUE INDEX IF NOT EXISTS "SupportTicket_open_unique_idx"
    ON "SupportTicket"("openedBy", "kind")
    WHERE "status" IN ('open', 'under_review');

-- File staff : ouverts d'abord, plus récents d'abord.
CREATE INDEX IF NOT EXISTS "SupportTicket_status_idx"
    ON "SupportTicket"("status", "createdAt" DESC);
-- Mes dossiers : les plus récents d'abord.
CREATE INDEX IF NOT EXISTS "SupportTicket_opener_idx"
    ON "SupportTicket"("openedBy", "createdAt" DESC);
-- +goose StatementEnd

-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS "SupportMessage" (
    "id"       TEXT NOT NULL,
    "ticketId" TEXT NOT NULL REFERENCES "SupportTicket"("id") ON DELETE CASCADE,
    "authorId" TEXT NOT NULL,
    "body"     TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SupportMessage_body_check" CHECK (char_length("body") BETWEEN 1 AND 5000)
);

CREATE INDEX IF NOT EXISTS "SupportMessage_ticket_idx"
    ON "SupportMessage"("ticketId", "createdAt");
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS "SupportMessage";
DROP TABLE IF EXISTS "SupportTicket";
-- +goose StatementEnd
