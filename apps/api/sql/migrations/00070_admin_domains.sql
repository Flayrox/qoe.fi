-- =====================================================================
-- 🧭 Domaines de la console : six domaines orientés métier
-- =====================================================================
-- Les domaines ne sont qu'un regroupement de NAVIGATION, pas une frontière
-- de sécurité : chaque capacité garde son garde, son domaine ne fait que
-- décider de la section où l'écran apparaît. Ce ne sont donc pas les
-- attributions qui bougent, seulement l'étiquette affichée.
--
-- Le passage de cinq à six domaines sépare ce qui relève de la croissance et
-- de la communication (campagnes, livraisons, abonnements) de ce qui relève
-- du produit et du contenu (registre des features, flags, widgets), et range
-- l'audit avec la conformité. L'écriture juridique reste hors du rôle
-- `content` (déjà retirée par 00069).
-- =====================================================================

-- +goose Up
-- +goose StatementBegin
ALTER TABLE "AdminCapability" DROP CONSTRAINT "AdminCapability_domain_check";
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE "AdminCapability"
    ADD CONSTRAINT "AdminCapability_domain_check" CHECK (
        "domain" IN ('pilotage', 'moderation', 'communaute', 'croissance', 'produit', 'plateforme')
    );
-- +goose StatementEnd

-- Audit → Conformité & plateforme (lire qui a fait quoi est un acte d'audit).
-- +goose StatementBegin
UPDATE "AdminCapability" SET "domain" = 'plateforme'
 WHERE "key" IN ('admin.audit.read');
-- +goose StatementEnd

-- Articles d'aide → Support & communauté (le contenu éditorial d'aide vit avec
-- la file support dont il est l'annexe documentaire).
-- +goose StatementBegin
UPDATE "AdminCapability" SET "domain" = 'communaute'
 WHERE "key" IN ('admin.content.read', 'admin.content.write');
-- +goose StatementEnd

-- Campagnes, livraisons et abonnements → Croissance & communication.
-- +goose StatementBegin
UPDATE "AdminCapability" SET "domain" = 'croissance'
 WHERE "key" IN (
    'admin.subscriptions.read', 'admin.subscriptions.write',
    'admin.campaigns.read', 'admin.campaigns.write',
    'admin.deliveries.read', 'admin.deliveries.retry'
 );
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
UPDATE "AdminCapability" SET "domain" = 'pilotage'
 WHERE "key" IN ('admin.audit.read');
-- +goose StatementEnd

-- +goose StatementBegin
UPDATE "AdminCapability" SET "domain" = 'produit'
 WHERE "key" IN ('admin.content.read', 'admin.content.write', 'admin.deliveries.read', 'admin.deliveries.retry', 'admin.campaigns.read', 'admin.campaigns.write');
-- +goose StatementEnd

-- +goose StatementBegin
UPDATE "AdminCapability" SET "domain" = 'communaute'
 WHERE "key" IN ('admin.subscriptions.read', 'admin.subscriptions.write');
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE "AdminCapability" DROP CONSTRAINT "AdminCapability_domain_check";
-- +goose StatementEnd

-- +goose StatementBegin
ALTER TABLE "AdminCapability"
    ADD CONSTRAINT "AdminCapability_domain_check" CHECK (
        "domain" IN ('pilotage', 'moderation', 'communaute', 'produit', 'plateforme')
    );
-- +goose StatementEnd
