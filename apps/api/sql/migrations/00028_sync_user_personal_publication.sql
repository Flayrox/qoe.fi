-- +goose Up
-- 🛡️ Synchronisation bidirectionnelle stricte entre User et sa Publication personnelle.
-- Résout le bug où Publication.slug reste sur l'ancien identifiant lors d'un changement de pseudo.

-- 1. Réconciliation immédiate des données existantes
UPDATE "Publication" p
SET slug = u.username,
    name = COALESCE(NULLIF(u.name, ''), u.username, p.name),
    "logoUrl" = COALESCE(u."logoUrl", p."logoUrl"),
    "updatedAt" = now()
FROM "User" u
WHERE u."publicationId" = p.id
  AND p.type = 'PERSONAL'
  AND u.username IS NOT NULL
  AND (
    p.slug IS DISTINCT FROM u.username
    OR (u.name IS NOT NULL AND p.name IS DISTINCT FROM u.name)
    OR (u."logoUrl" IS NOT NULL AND p."logoUrl" IS DISTINCT FROM u."logoUrl")
  );

-- 2. Fonction trigger pour synchroniser User -> Publication
CREATE OR REPLACE FUNCTION sync_user_to_personal_publication()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW."publicationId" IS NOT NULL THEN
        UPDATE "Publication"
        SET slug = COALESCE(NEW.username, slug),
            name = COALESCE(NULLIF(NEW.name, ''), NEW.username, name),
            "logoUrl" = NEW."logoUrl",
            "updatedAt" = now()
        WHERE id = NEW."publicationId"
          AND type = 'PERSONAL'
          AND (
            slug IS DISTINCT FROM NEW.username
            OR name IS DISTINCT FROM COALESCE(NULLIF(NEW.name, ''), NEW.username, name)
            OR "logoUrl" IS DISTINCT FROM NEW."logoUrl"
          );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_user_to_personal_publication ON "User";
CREATE TRIGGER trg_sync_user_to_personal_publication
AFTER INSERT OR UPDATE OF username, name, "logoUrl", "publicationId" ON "User"
FOR EACH ROW
EXECUTE FUNCTION sync_user_to_personal_publication();

-- 3. Fonction trigger pour synchroniser Publication -> User (quand la publication personnelle est modifiée)
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

DROP TRIGGER IF EXISTS trg_sync_personal_publication_to_user ON "Publication";
CREATE TRIGGER trg_sync_personal_publication_to_user
AFTER UPDATE OF slug, name, "logoUrl" ON "Publication"
FOR EACH ROW
EXECUTE FUNCTION sync_personal_publication_to_user();

-- +goose Down
DROP TRIGGER IF EXISTS trg_sync_personal_publication_to_user ON "Publication";
DROP FUNCTION IF EXISTS sync_personal_publication_to_user();
DROP TRIGGER IF EXISTS trg_sync_user_to_personal_publication ON "User";
DROP FUNCTION IF EXISTS sync_user_to_personal_publication();
