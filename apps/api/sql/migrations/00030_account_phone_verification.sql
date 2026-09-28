-- =====================================================================
-- ☎️ Compte — vérification du téléphone (fiche 05)
-- =====================================================================
-- Objectif : rendre la séparation `phone_verified` / `strong_auth_verified`
-- explicite en base plutôt que d'en déduire une preuve depuis un code SMS.
--
-- Le numéro vérifié est une **friction anti-abus** (import de listes, demande
-- d'accès API, augmentation de quota) et un moyen de contact. Il ne remplace
-- jamais la MFA forte : la preuve forte (passkey/TOTP réellement utilisée) est
-- portée par la **session**, donc par les claims du JWT, jamais par une colonne
-- `User` modifiable par erreur applicative.
--
-- On stocke le numéro complet parce que la revalidation après changement de
-- numéro en a besoin, mais son accès reste minimal : il ne doit pas être
-- exposé aux créateurs, aux membres d'un média ni dans les interfaces
-- publiques (cf. fiche 05 §2).

-- +goose Up
-- +goose StatementBegin
ALTER TABLE "User"
    ADD COLUMN "phoneNumber" TEXT,
    ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);

-- Un même numéro ne doit pas servir à plusieurs comptes pour obtenir les
-- capacités qui en dépendent. Index partiel : les comptes sans numéro ne
-- consomment rien et rien n'est ajouté au chemin d'écriture courant.
CREATE UNIQUE INDEX "User_phoneNumber_key" ON "User"("phoneNumber")
    WHERE "phoneNumber" IS NOT NULL;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP INDEX IF EXISTS "User_phoneNumber_key";
ALTER TABLE "User"
    DROP COLUMN IF EXISTS "phoneVerifiedAt",
    DROP COLUMN IF EXISTS "phoneNumber";
-- +goose StatementEnd
