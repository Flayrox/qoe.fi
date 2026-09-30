-- =====================================================================
-- 🛡️ Console admin : rôles et capacités (fin du superadmin binaire)
-- =====================================================================
-- La console était binaire : `User."role" = 'superadmin'` ou rien. Un agent
-- support, un juriste ou un analyste n'existaient pas — soit on donnait les
-- pleins pouvoirs, soit on bricolait des exceptions dans le code.
--
-- Modèle retenu : un vocabulaire FERMÉ de capacités (une action vérifiable),
-- des rôles nommés qui les agrègent, et une attribution par personne avec
-- échéance. L'autorité reste le serveur : le Go lit ces tables et refuse par
-- défaut (internal/adminauthz). L'interface ne fait que masquer.
--
-- Règle de sûreté : `User."role" = 'superadmin'` reste la promotion
-- historique et continue de valoir TOUTES les capacités — jamais de
-- verrouillage d'un superadmin existant. Le backfill ci-dessous rend cette
-- vérité explicite dans les nouvelles tables (l'état dérivé est matérialisé
-- pour être lisible et attribuable, pas pour remplacer la source).
-- =====================================================================

-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS "AdminCapability" (
    "key"         TEXT NOT NULL,
    "label"       TEXT NOT NULL,
    "domain"      TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "AdminCapability_pkey" PRIMARY KEY ("key"),
    -- Vocabulaire fermé : une capacité hors domaine ne peut pas être semée.
    CONSTRAINT "AdminCapability_domain_check" CHECK (
        "domain" IN ('pilotage', 'moderation', 'communaute', 'produit', 'plateforme')
    )
);

CREATE TABLE IF NOT EXISTS "AdminRole" (
    "key"         TEXT NOT NULL,
    "label"       TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    -- Rôle fourni par la plateforme (non supprimable par l'interface).
    "isSystem"    BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AdminRole_pkey" PRIMARY KEY ("key")
);

CREATE TABLE IF NOT EXISTS "AdminRoleCapability" (
    "roleKey"       TEXT NOT NULL,
    "capabilityKey" TEXT NOT NULL,

    CONSTRAINT "AdminRoleCapability_pkey" PRIMARY KEY ("roleKey", "capabilityKey"),
    CONSTRAINT "AdminRoleCapability_role_fkey" FOREIGN KEY ("roleKey")
        REFERENCES "AdminRole" ("key") ON DELETE CASCADE,
    CONSTRAINT "AdminRoleCapability_capability_fkey" FOREIGN KEY ("capabilityKey")
        REFERENCES "AdminCapability" ("key") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "AdminUserRole" (
    "userId"    UUID NOT NULL,
    "roleKey"   TEXT NOT NULL,
    -- Qui a accordé le rôle (NULL = backfill système / promotion historique).
    "grantedBy" UUID,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- NULL = sans fin. Une attribution échue n'accorde plus rien (l'échéance
    -- est une condition de lecture, pas un job de purge — même doctrine que
    -- les octrois d'abonnement).
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "AdminUserRole_pkey" PRIMARY KEY ("userId", "roleKey"),
    CONSTRAINT "AdminUserRole_user_fkey" FOREIGN KEY ("userId")
        REFERENCES "User" ("id") ON DELETE CASCADE,
    CONSTRAINT "AdminUserRole_role_fkey" FOREIGN KEY ("roleKey")
        REFERENCES "AdminRole" ("key") ON DELETE CASCADE,
    CONSTRAINT "AdminUserRole_granter_fkey" FOREIGN KEY ("grantedBy")
        REFERENCES "User" ("id") ON DELETE SET NULL,
    CONSTRAINT "AdminUserRole_expiry_check" CHECK ("expiresAt" IS NULL OR "expiresAt" > "grantedAt")
);
-- +goose StatementEnd

CREATE INDEX IF NOT EXISTS "AdminUserRole_user_idx" ON "AdminUserRole" ("userId");
CREATE INDEX IF NOT EXISTS "AdminRoleCapability_capability_idx" ON "AdminRoleCapability" ("capabilityKey");

-- ── Vocabulaire des capacités (fermé, miroir de internal/adminauthz) ────────
-- Miroir Go↔SQL verrouillé par un test de parité : ajouter une capacité ici
-- sans l'ajouter dans capability.go (ou l'inverse) fait échouer la CI.
-- +goose StatementBegin
INSERT INTO "AdminCapability" ("key", "label", "domain", "description") VALUES
    -- Pilotage
    ('admin.self.read',                'Consulter son propre accès',      'pilotage',   'Rôles et capacités de la personne connectée (page /admin/me).'),
    ('admin.dashboard.read',           'Tableau de bord',                 'pilotage',   'Compteurs globaux et supervision du stockage.'),
    ('admin.audit.read',               'Journal d''audit',                'pilotage',   'Lire le journal des actions sensibles de la console.'),
    -- Modération
    ('admin.users.read',               'Comptes (lecture)',               'moderation', 'Liste et fiche détaillée des comptes.'),
    ('admin.users.moderate',           'Comptes (modération)',            'moderation', 'Certifier, suspendre, shadowban un compte.'),
    ('admin.users.sessions.revoke',    'Révoquer les sessions',           'moderation', 'Couper toutes les sessions d''un compte compromis.'),
    ('admin.reports.read',             'Signalements (lecture)',          'moderation', 'Lire la file de signalements.'),
    ('admin.reports.write',            'Signalements (traitement)',       'moderation', 'Clore un signalement et appliquer la mesure.'),
    ('admin.abuse.read',               'Anti-abus (lecture)',             'moderation', 'Lire les dossiers et métriques du noyau anti-abus.'),
    ('admin.abuse.decide',             'Anti-abus (décision)',            'moderation', 'Clore humainement un verdict automatique.'),
    ('admin.incidents.read',           'Incidents (lecture)',             'moderation', 'Lire le registre des incidents.'),
    ('admin.incidents.write',          'Incidents (tenue du dossier)',    'moderation', 'Ouvrir et faire avancer un dossier d''incident.'),
    ('admin.appeals.read',             'Recours (lecture)',               'moderation', 'Lire les recours et leurs messages.'),
    ('admin.appeals.decide',           'Recours (décision)',              'moderation', 'Confirmer ou lever la mesure contestée.'),
    -- Communauté
    ('admin.support.read',             'Support (lecture)',               'communaute', 'Lire la file support, les dossiers et la charge.'),
    ('admin.support.write',            'Support (traitement)',            'communaute', 'Assigner, répondre, clore un dossier support.'),
    ('admin.subscriptions.read',       'Abonnements (lecture)',           'communaute', 'Lire les octrois manuels de paliers.'),
    ('admin.subscriptions.write',      'Abonnements (octroi)',            'communaute', 'Octroyer, révoquer un palier et basculer l''email Pro.'),
    ('admin.imports.read',             'Imports (lecture)',               'communaute', 'Lire les lots d''import d''abonnés et leurs vagues.'),
    ('admin.imports.review',           'Imports (revue)',                 'communaute', 'Instruire un lot, ouvrir une vague, l''annuler.'),
    -- Produit
    ('admin.content.read',             'Contenu d''aide (lecture)',       'produit',    'Lire les articles du centre d''aide.'),
    ('admin.content.write',            'Contenu d''aide (édition)',       'produit',    'Créer, corriger, publier un article d''aide.'),
    ('admin.widgets.read',             'Widgets (lecture)',               'produit',    'Lire les articles à la une, tendances et promos.'),
    ('admin.widgets.write',            'Widgets (édition)',               'produit',    'Mettre à la une, ordonner les tendances, gérer les promos.'),
    ('admin.deliveries.read',          'Livraisons (lecture)',            'produit',    'Lire les compteurs et la file des livraisons de notifications.'),
    ('admin.deliveries.retry',         'Livraisons (relance)',            'produit',    'Relancer une livraison en échec.'),
    ('admin.campaigns.read',           'Campagnes (lecture)',             'produit',    'Lire les campagnes staff.'),
    ('admin.campaigns.write',          'Campagnes (pilotage)',            'produit',    'Créer, soumettre, approuver, lancer, suspendre une campagne.'),
    -- Plateforme
    ('admin.config.read',              'Configuration (lecture)',         'plateforme', 'Lire la configuration système et l''allowlist d''inscription.'),
    ('admin.config.write',             'Configuration (écriture)',        'plateforme', 'Écrire une config, gérer l''allowlist et les identifiants réservés.'),
    ('admin.flags.write',              'Feature flags',                   'plateforme', 'Basculer un feature flag de plateforme.'),
    ('admin.oauth.read',               'OAuth (lecture)',                 'plateforme', 'Lire les applications OAuth.'),
    ('admin.oauth.approve',            'OAuth (décision)',                'plateforme', 'Approuver, rejeter ou révoquer une application OAuth.'),
    ('admin.api.read',                 'Accès API (lecture)',             'plateforme', 'Lire les demandes d''accès et le registre des modules.'),
    ('admin.api.grants.write',         'Accès API (octroi)',              'plateforme', 'Décider d''un accès API et ajuster ses permissions.'),
    ('admin.legal.read',               'Contenu juridique (lecture)',     'plateforme', 'Lire les documents et versions juridiques.'),
    ('admin.legal.write',              'Contenu juridique (édition)',     'plateforme', 'Rédiger et publier une version juridique.'),
    ('admin.compliance.read',          'Conformité (lecture)',            'plateforme', 'Lire la photographie de conformité.'),
    ('admin.compliance.export',        'Conformité (export)',             'plateforme', 'Exporter le registre signé des consentements.')
ON CONFLICT ("key") DO UPDATE SET
    "label" = EXCLUDED."label",
    "domain" = EXCLUDED."domain",
    "description" = EXCLUDED."description";
-- +goose StatementEnd

-- ── Rôles nommés ───────────────────────────────────────────────────────────
-- +goose StatementBegin
INSERT INTO "AdminRole" ("key", "label", "description", "isSystem") VALUES
    ('superadmin', 'Superadmin',            'Tous les pouvoirs — promotion historique conservée.', true),
    ('support',    'Support',               'Accueille les demandes et lit le contexte ; n''engage aucune mesure.', true),
    ('moderation', 'Modération',            'Traite les signalements, l''anti-abus, les recours et les incidents.', true),
    ('content',    'Contenu',               'Édite le centre d''aide, les widgets, le contenu juridique.', true),
    ('ops',        'Opérations',            'Plateforme : configuration, flags, OAuth, accès API, livraisons, campagnes.', true),
    ('legal',      'Juridique',             'Contenu juridique, conformité et preuves de consentement.', true),
    ('analyst',    'Analyste (lecture)',    'Lecture seule sur toute la console — aucun acte.', true)
ON CONFLICT ("key") DO UPDATE SET
    "label" = EXCLUDED."label",
    "description" = EXCLUDED."description",
    "isSystem" = EXCLUDED."isSystem";
-- +goose StatementEnd

-- ── Matrice rôle → capacité ────────────────────────────────────────────────
-- Une INSERT par rôle : la matrice est lisible et diff-able, et le test de
-- parité Go↔SQL la compare telle quelle à internal/adminauthz/roles.go.
-- +goose StatementBegin
INSERT INTO "AdminRoleCapability" ("roleKey", "capabilityKey") VALUES
    ('superadmin', 'admin.self.read'),
    ('superadmin', 'admin.dashboard.read'),
    ('superadmin', 'admin.audit.read'),
    ('superadmin', 'admin.users.read'),
    ('superadmin', 'admin.users.moderate'),
    ('superadmin', 'admin.users.sessions.revoke'),
    ('superadmin', 'admin.reports.read'),
    ('superadmin', 'admin.reports.write'),
    ('superadmin', 'admin.abuse.read'),
    ('superadmin', 'admin.abuse.decide'),
    ('superadmin', 'admin.incidents.read'),
    ('superadmin', 'admin.incidents.write'),
    ('superadmin', 'admin.appeals.read'),
    ('superadmin', 'admin.appeals.decide'),
    ('superadmin', 'admin.support.read'),
    ('superadmin', 'admin.support.write'),
    ('superadmin', 'admin.subscriptions.read'),
    ('superadmin', 'admin.subscriptions.write'),
    ('superadmin', 'admin.imports.read'),
    ('superadmin', 'admin.imports.review'),
    ('superadmin', 'admin.content.read'),
    ('superadmin', 'admin.content.write'),
    ('superadmin', 'admin.widgets.read'),
    ('superadmin', 'admin.widgets.write'),
    ('superadmin', 'admin.deliveries.read'),
    ('superadmin', 'admin.deliveries.retry'),
    ('superadmin', 'admin.campaigns.read'),
    ('superadmin', 'admin.campaigns.write'),
    ('superadmin', 'admin.config.read'),
    ('superadmin', 'admin.config.write'),
    ('superadmin', 'admin.flags.write'),
    ('superadmin', 'admin.oauth.read'),
    ('superadmin', 'admin.oauth.approve'),
    ('superadmin', 'admin.api.read'),
    ('superadmin', 'admin.api.grants.write'),
    ('superadmin', 'admin.legal.read'),
    ('superadmin', 'admin.legal.write'),
    ('superadmin', 'admin.compliance.read'),
    ('superadmin', 'admin.compliance.export'),

    ('support', 'admin.self.read'),
    ('support', 'admin.dashboard.read'),
    ('support', 'admin.users.read'),
    ('support', 'admin.reports.read'),
    ('support', 'admin.abuse.read'),
    ('support', 'admin.incidents.read'),
    ('support', 'admin.appeals.read'),
    ('support', 'admin.support.read'),
    ('support', 'admin.support.write'),
    ('support', 'admin.subscriptions.read'),
    ('support', 'admin.imports.read'),
    ('support', 'admin.content.read'),
    ('support', 'admin.widgets.read'),
    ('support', 'admin.deliveries.read'),
    ('support', 'admin.campaigns.read'),
    ('support', 'admin.config.read'),
    ('support', 'admin.oauth.read'),
    ('support', 'admin.api.read'),
    ('support', 'admin.legal.read'),
    ('support', 'admin.compliance.read'),
    ('support', 'admin.audit.read'),

    ('moderation', 'admin.self.read'),
    ('moderation', 'admin.dashboard.read'),
    ('moderation', 'admin.users.read'),
    ('moderation', 'admin.users.moderate'),
    ('moderation', 'admin.users.sessions.revoke'),
    ('moderation', 'admin.reports.read'),
    ('moderation', 'admin.reports.write'),
    ('moderation', 'admin.abuse.read'),
    ('moderation', 'admin.abuse.decide'),
    ('moderation', 'admin.incidents.read'),
    ('moderation', 'admin.incidents.write'),
    ('moderation', 'admin.appeals.read'),
    ('moderation', 'admin.appeals.decide'),
    ('moderation', 'admin.support.read'),
    ('moderation', 'admin.audit.read'),

    ('content', 'admin.self.read'),
    ('content', 'admin.dashboard.read'),
    ('content', 'admin.content.read'),
    ('content', 'admin.content.write'),
    ('content', 'admin.widgets.read'),
    ('content', 'admin.widgets.write'),
    ('content', 'admin.legal.read'),
    ('content', 'admin.legal.write'),
    ('content', 'admin.compliance.read'),
    ('content', 'admin.support.read'),

    ('ops', 'admin.self.read'),
    ('ops', 'admin.dashboard.read'),
    ('ops', 'admin.config.read'),
    ('ops', 'admin.config.write'),
    ('ops', 'admin.flags.write'),
    ('ops', 'admin.oauth.read'),
    ('ops', 'admin.oauth.approve'),
    ('ops', 'admin.api.read'),
    ('ops', 'admin.api.grants.write'),
    ('ops', 'admin.imports.read'),
    ('ops', 'admin.imports.review'),
    ('ops', 'admin.deliveries.read'),
    ('ops', 'admin.deliveries.retry'),
    ('ops', 'admin.campaigns.read'),
    ('ops', 'admin.campaigns.write'),
    ('ops', 'admin.incidents.read'),
    ('ops', 'admin.incidents.write'),
    ('ops', 'admin.compliance.read'),
    ('ops', 'admin.audit.read'),

    ('legal', 'admin.self.read'),
    ('legal', 'admin.dashboard.read'),
    ('legal', 'admin.users.read'),
    ('legal', 'admin.legal.read'),
    ('legal', 'admin.legal.write'),
    ('legal', 'admin.compliance.read'),
    ('legal', 'admin.compliance.export'),
    ('legal', 'admin.audit.read'),

    ('analyst', 'admin.self.read'),
    ('analyst', 'admin.dashboard.read'),
    ('analyst', 'admin.users.read'),
    ('analyst', 'admin.reports.read'),
    ('analyst', 'admin.abuse.read'),
    ('analyst', 'admin.incidents.read'),
    ('analyst', 'admin.appeals.read'),
    ('analyst', 'admin.support.read'),
    ('analyst', 'admin.subscriptions.read'),
    ('analyst', 'admin.imports.read'),
    ('analyst', 'admin.content.read'),
    ('analyst', 'admin.widgets.read'),
    ('analyst', 'admin.deliveries.read'),
    ('analyst', 'admin.campaigns.read'),
    ('analyst', 'admin.config.read'),
    ('analyst', 'admin.oauth.read'),
    ('analyst', 'admin.api.read'),
    ('analyst', 'admin.legal.read'),
    ('analyst', 'admin.compliance.read'),
    ('analyst', 'admin.audit.read')
ON CONFLICT ("roleKey", "capabilityKey") DO NOTHING;
-- +goose StatementEnd

-- ── Backfill : aucune perte d'accès au déploiement ─────────────────────────
-- Tout compte déjà promu superadmin reçoit le rôle correspondant (sans fin).
-- Idempotent : rejouer la migration ne duplique rien. Le Go accorde de toute
-- façon TOUTES les capacités à `User."role" = 'superadmin'` — ce backfill rend
-- la vérité lisible dans "AdminUserRole", il ne la remplace pas.
-- +goose StatementBegin
INSERT INTO "AdminUserRole" ("userId", "roleKey", "grantedBy", "grantedAt", "expiresAt")
SELECT u."id", 'superadmin', NULL, CURRENT_TIMESTAMP, NULL
FROM "User" u
WHERE u."role" = 'superadmin'
ON CONFLICT ("userId", "roleKey") DO NOTHING;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS "AdminUserRole";
DROP TABLE IF EXISTS "AdminRoleCapability";
DROP TABLE IF EXISTS "AdminRole";
DROP TABLE IF EXISTS "AdminCapability";
-- +goose StatementEnd
