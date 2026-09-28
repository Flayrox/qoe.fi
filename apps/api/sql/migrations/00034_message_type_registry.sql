-- =====================================================================
-- 📬 Communications — registre des types de messages (fiche 04 §2)
-- =====================================================================
-- Chaque type de message est enregistré avec : propriétaire métier, famille,
-- destinataires permis, règle de base, priorité, identité d'envoi, tracking
-- autorisé ou interdit, et approbation requise. Le moteur de politique
-- (internal/comms) lit ce registre : un message dit « obligatoire » ne peut
-- pas servir à envoyer des promotions, parce que le registre et les contrôles
-- du backend — pas une étiquette choisie dans l'interface — déterminent son
-- traitement (fiche 04 §2, règle anti-détournement).
--
-- Sont exclus du registre les envois déjà régis ailleurs : campagnes
-- créateur (NewsletterIssue + garde bulk_campaign_send), reconfirmations et
-- envois encadrés d'imports (quarantaine + décisions + budgets propres).
-- Le registre couvre les messages qoe.fi et transactionnels ; il ne duplique
-- aucun de ces dispositifs, il les rend explicites et interrogeables.
--
-- +goose Up
-- +goose StatementBegin
CREATE TABLE "MessageTypePolicy" (
    "key"             TEXT NOT NULL,
    -- Famille : security | service | legal | newsletter | product | event | staff.
    "family"          TEXT NOT NULL,
    -- Module propriétaire métier : auth, newsletters, legal, support, ...
    "owner"           TEXT NOT NULL,
    -- Règle de base : always (sécurité), opt_in, opt_out, approval.
    "baseRule"        TEXT NOT NULL,
    -- Priorité de file : 0 = maximale (sécurité), 100 = bulk.
    "priority"        INTEGER NOT NULL DEFAULT 100,
    -- Tracking autorisé : none | deliverability | editorial.
    -- `none` par défaut : aucun pixel sans décision explicite (fiche 04 §8,
    -- revue juridique requise avant toute activation).
    "tracking"        TEXT NOT NULL DEFAULT 'none',
    -- Approbation staff requise avant envoi (campagnes officielles, légal).
    "staffApproval"   BOOLEAN NOT NULL DEFAULT false,
    "description"     TEXT NOT NULL DEFAULT '',
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTypePolicy_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "MessageTypePolicy_family_check" CHECK ("family" IN (
        'security', 'service', 'legal', 'newsletter', 'product', 'event', 'staff'
    )),
    CONSTRAINT "MessageTypePolicy_base_rule_check" CHECK ("baseRule" IN (
        'always', 'opt_in', 'opt_out', 'approval'
    )),
    CONSTRAINT "MessageTypePolicy_tracking_check" CHECK ("tracking" IN (
        'none', 'deliverability', 'editorial'
    ))
);

-- Seed : les types réellement émis aujourd'hui. La règle inscrite ici doit
-- correspondre au comportement du code, pas l'inverse — tout écart est un
-- ticket, pas une tolérance.
INSERT INTO "MessageTypePolicy" ("key", "family", "owner", "baseRule", "priority", "tracking", "staffApproval", "description", "updatedAt") VALUES
    ('auth.code', 'security', 'auth', 'always', 0, 'none', false,
     'Code de connexion / OTP : priorité maximale, pas de pixel, pas de désinscription neutralisante.', now()),
    ('auth.recovery', 'security', 'auth', 'always', 0, 'none', false,
     'Récupération de compte et alertes de sécurité.', now()),
    ('subscriber.confirm', 'service', 'newsletters', 'opt_in', 10, 'none', false,
     'Demande de confirmation double opt-in : ciblée sur la personne et son action, sans contenu promotionnel ajouté.', now()),
    ('subscriber.welcome', 'service', 'newsletters', 'opt_in', 10, 'none', false,
     'Bienvenue après confirmation effective uniquement, jamais avant le clic.', now()),
    ('creator.newsletter', 'newsletter', 'newsletters', 'opt_in', 100, 'none', false,
     'Campagne d''une publication : abonnement vérifié ou import approuvé, désinscription, quotas. Pixel : none tant que la revue juridique (fiche 04 §8) n''a pas statué.', now()),
    ('legal.version_notice', 'legal', 'legal', 'approval', 20, 'none', true,
     'Avis de modification des conditions : audience justifiée, validation staff, miroir in-app. Une ouverture ne vaut jamais acceptation.', now()),
    ('staff.direct', 'staff', 'admin', 'approval', 30, 'none', true,
     'Message individuel ou groupe ciblé du staff : permissions, audience figée, audit. Pas de voie d''envoi libre.', now()),
    ('product.announcement', 'product', 'product', 'opt_in', 90, 'none', false,
     'Nouveauté et newsletter plateforme : préférence propre, jamais déduite d''un abonnement créateur.', now()),
    ('event.invitation', 'event', 'events', 'opt_in', 80, 'none', false,
     'Invitation facultative (distincte des messages liés à une inscription existante).', now()),
    ('event.ticket', 'service', 'events', 'opt_in', 10, 'none', false,
     'Billet et rappel après inscription : message lié à une action existante.', now()),
    ('support.reply', 'service', 'support', 'opt_in', 10, 'none', false,
     'Réponse support et décision de recours : ciblée sur le dossier.', now())
ON CONFLICT ("key") DO NOTHING;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS "MessageTypePolicy";
-- +goose StatementEnd
