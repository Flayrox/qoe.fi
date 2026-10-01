-- =====================================================================
-- 🚪 Console admin : capacités d'accès staff (nommer un rôle sans SQL)
-- =====================================================================
-- La console savait DÉCRIRE les rôles (00053 : capacités, rôles, matrice,
-- attributions datées) mais pas les ATTRIBUER : nommer un modérateur demandait
-- un INSERT à la main dans "AdminUserRole". Ce lot ajoute les deux capacités
-- qui manquaient et leur place dans la matrice.
--
-- Doctrine inchangée :
--   - `admin.access.read` est une LECTURE : le rôle « analyst » la détient
--     comme toute capacité sans écriture (un test l'exige) ;
--   - `admin.access.grant` n'est donnée qu'au superadmin par défaut. Distribuer
--     les droits de la console est l'acte qu'on ne délègue pas implicitement :
--     l'accorder, c'est décider qui peut décider.
--
-- Idempotente : rejouable sur une base déjà à jour (ON CONFLICT).
-- =====================================================================

-- +goose Up
-- +goose StatementBegin
INSERT INTO "AdminCapability" ("key", "label", "domain", "description") VALUES
    ('admin.access.read',  'Accès staff (lecture)', 'plateforme', 'Lister les attributions de rôles, la matrice rôle → capacité et expliquer un accès.'),
    ('admin.access.grant', 'Accès staff (attribution)', 'plateforme', 'Attribuer un rôle à une personne (avec échéance), le révoquer, et lire l''historique.')
ON CONFLICT ("key") DO UPDATE SET
    "label" = EXCLUDED."label",
    "domain" = EXCLUDED."domain",
    "description" = EXCLUDED."description";
-- +goose StatementEnd

-- ── Matrice : qui détient les nouvelles capacités ──────────────────────────
-- superadmin : les deux (comme tout, mais la ligne est écrite pour que la
-- matrice en base soit lisible sans interpréter `Capabilities()`).
-- analyst : la lecture seule uniquement.
-- +goose StatementBegin
INSERT INTO "AdminRoleCapability" ("roleKey", "capabilityKey") VALUES
    ('superadmin', 'admin.access.read'),
    ('superadmin', 'admin.access.grant'),
    ('analyst',    'admin.access.read')
ON CONFLICT ("roleKey", "capabilityKey") DO NOTHING;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- La matrice part avec les capacités (CASCADE de "AdminRoleCapability") ; la
-- ligne explicite la rend lisible et ne dépend pas de l'ordre des FK.
-- Les ATTRIBUTIONS de rôles ("AdminUserRole") ne sont PAS touchées : elles
-- portent sur des rôles (superadmin, analyst), pas sur ces capacités — les
-- emporter ferait perdre à des personnes un accès qui n'a rien à voir.
DELETE FROM "AdminRoleCapability" WHERE "capabilityKey" IN ('admin.access.read', 'admin.access.grant');
DELETE FROM "AdminCapability" WHERE "key" IN ('admin.access.read', 'admin.access.grant');
-- +goose StatementEnd
