-- =====================================================================
-- 00072_ops_scope.sql — `ops` est un rôle de plateforme, pas un attrape-tout
-- =====================================================================
-- Le seed 00053 donnait à `ops` des capacités de quatre domaines différents :
-- imports d'abonnés, campagnes, incidents et conformité. Un rôle qui peut
-- modérer, communiquer, répondre à un incident et lire la conformité n'est plus
-- un rôle : c'est un second superadmin déguisé.
--
-- Cette migration additive retire ces capacités du rôle `ops` sans toucher aux
-- attributions de rôles (`AdminUserRole`) ni aux autres rôles :
--   - imports / campagnes / incidents restent à `support`, `moderation`,
--     `content`, `analyst` ou `superadmin` selon leur matrice ;
--   - `legal` conserve la conformité et l'écriture juridique.
--
-- Le miroir Go (`RoleOps`) et le test de parité sont mis à jour dans le même
-- changement : une base ne peut pas accorder ce que le Go refuse, ni l'inverse.
-- =====================================================================

-- +goose Up
-- +goose StatementBegin
DELETE FROM "AdminRoleCapability"
WHERE "roleKey" = 'ops' AND "capabilityKey" = 'admin.imports.read';
DELETE FROM "AdminRoleCapability"
WHERE "roleKey" = 'ops' AND "capabilityKey" = 'admin.imports.review';
DELETE FROM "AdminRoleCapability"
WHERE "roleKey" = 'ops' AND "capabilityKey" = 'admin.campaigns.read';
DELETE FROM "AdminRoleCapability"
WHERE "roleKey" = 'ops' AND "capabilityKey" = 'admin.campaigns.write';
DELETE FROM "AdminRoleCapability"
WHERE "roleKey" = 'ops' AND "capabilityKey" = 'admin.incidents.read';
DELETE FROM "AdminRoleCapability"
WHERE "roleKey" = 'ops' AND "capabilityKey" = 'admin.incidents.write';
DELETE FROM "AdminRoleCapability"
WHERE "roleKey" = 'ops' AND "capabilityKey" = 'admin.compliance.read';
DELETE FROM "AdminRoleCapability"
WHERE "roleKey" = 'ops' AND "capabilityKey" = 'admin.deliveries.read';
DELETE FROM "AdminRoleCapability"
WHERE "roleKey" = 'ops' AND "capabilityKey" = 'admin.deliveries.retry';
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
INSERT INTO "AdminRoleCapability" ("roleKey", "capabilityKey") VALUES
    ('ops', 'admin.imports.read'),
    ('ops', 'admin.imports.review'),
    ('ops', 'admin.campaigns.read'),
    ('ops', 'admin.campaigns.write'),
    ('ops', 'admin.incidents.read'),
    ('ops', 'admin.incidents.write'),
    ('ops', 'admin.compliance.read'),
    ('ops', 'admin.deliveries.read'),
    ('ops', 'admin.deliveries.retry')
ON CONFLICT ("roleKey", "capabilityKey") DO NOTHING;
-- +goose StatementEnd
