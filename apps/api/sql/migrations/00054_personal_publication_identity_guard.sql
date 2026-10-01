-- =====================================================================
-- 🛡️ Publication personnelle : ne jamais FABRIQUER une identité de compte
-- =====================================================================
-- 00028 a posé une synchronisation bidirectionnelle User ↔ Publication
-- personnelle. Le sens Publication → User a une conséquence non voulue :
-- quand un compte n'a encore ni pseudo ni nom, `GetOrCreatePersonalPublication`
-- crée sa publication avec un libellé provisoire (« Lecteur » / slug
-- « lecteur ») — et le trigger recopiait ce provisoire dans `User.username`
-- et `User.name`. Résultat : le compte gagnait un pseudo public de
-- remplacement, `lecteur`, et l'auto-réparation d'identité au login ne
-- pouvait plus le corriger (elle ne remplit que des colonnes vides).
--
-- Correctif : la propagation vers `User` n'a lieu que si le compte porte
-- DÉJÀ une identité. Un libellé de secours reste dans la publication (il faut
-- bien un nom et un slug non nuls) mais ne devient jamais l'identité publique
-- de la personne. Dès que le compte a un pseudo, la synchronisation normale
-- reprend dans les deux sens.
-- =====================================================================

-- +goose Up
-- +goose StatementBegin
CREATE OR REPLACE FUNCTION sync_personal_publication_to_user()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.type = 'PERSONAL' THEN
        UPDATE "User"
        SET username = COALESCE(NEW.slug, username),
            name = COALESCE(NULLIF(NEW.name, ''), name),
            "logoUrl" = NEW."logoUrl",
            "updatedAt" = now()
        WHERE "publicationId" = NEW.id
          -- Garde d'identité : tant que le compte n'a pas de pseudo, la
          -- publication personnelle n'est qu'un support provisoire — ce
          -- qu'elle affiche ne doit pas devenir l'identité du compte.
          AND username IS NOT NULL
          AND username <> ''
          AND (
            username IS DISTINCT FROM NEW.slug
            OR name IS DISTINCT FROM COALESCE(NULLIF(NEW.name, ''), name)
            OR "logoUrl" IS DISTINCT FROM NEW."logoUrl"
          );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
-- Retour au comportement de 00028 : propagation inconditionnelle.
CREATE OR REPLACE FUNCTION sync_personal_publication_to_user()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.type = 'PERSONAL' THEN
        UPDATE "User"
        SET username = COALESCE(NEW.slug, username),
            name = COALESCE(NULLIF(NEW.name, ''), name),
            "logoUrl" = NEW."logoUrl",
            "updatedAt" = now()
        WHERE "publicationId" = NEW.id
          AND (
            username IS DISTINCT FROM NEW.slug
            OR name IS DISTINCT FROM COALESCE(NULLIF(NEW.name, ''), name)
            OR "logoUrl" IS DISTINCT FROM NEW."logoUrl"
          );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
-- +goose StatementEnd
