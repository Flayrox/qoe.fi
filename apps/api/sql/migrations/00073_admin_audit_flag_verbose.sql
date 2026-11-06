-- =====================================================================
-- 00073_admin_audit_flag_verbose.sql — le flag d'audit ne coupe plus la trace
-- =====================================================================
-- `admin-audit-log` a longtemps signifié « écrire ou ne pas écrire » le
-- journal. Ce n'est plus vrai : toute mutation admin écrit une ligne, même
-- flag éteint. Le flag ne doit plus promettre l'inverse dans l'interface.
--
-- On conserve la clé (des configurations et des scripts la citent) et on
-- corrige son libellé pour qu'il décrive le seul comportement restant : le
-- mode verbeux.
-- =====================================================================

-- +goose Up
UPDATE feature_flags
SET description = 'Mode verbeux du journal d''audit (les mutations sont toujours tracées)'
WHERE key = 'admin-audit-log';

-- +goose Down
UPDATE feature_flags
SET description = 'Journal d''audit détaillé des actions admin'
WHERE key = 'admin-audit-log';
