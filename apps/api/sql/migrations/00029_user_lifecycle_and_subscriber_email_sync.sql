-- +goose Up
-- +goose StatementBegin
-- 1. Nettoyage de la publication personnelle lors de la suppression effective du compte User
CREATE OR REPLACE FUNCTION cleanup_user_personal_publication()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD."publicationId" IS NOT NULL THEN
        DELETE FROM "Publication"
        WHERE id = OLD."publicationId"
          AND type = 'PERSONAL';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_cleanup_user_personal_publication ON "User";
CREATE TRIGGER trg_cleanup_user_personal_publication
AFTER DELETE ON "User"
FOR EACH ROW
EXECUTE FUNCTION cleanup_user_personal_publication();

-- 2. Synchronisation de l'email du compte vers ses abonnements aux newsletters
CREATE OR REPLACE FUNCTION sync_user_email_to_subscribers()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.email IS DISTINCT FROM OLD.email AND NEW.email IS NOT NULL THEN
        UPDATE "Subscriber"
        SET email = NEW.email,
            "updatedAt" = now()
        WHERE "userId" = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_user_email_to_subscribers ON "User";
CREATE TRIGGER trg_sync_user_email_to_subscribers
AFTER UPDATE OF email ON "User"
FOR EACH ROW
EXECUTE FUNCTION sync_user_email_to_subscribers();
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TRIGGER IF EXISTS trg_sync_user_email_to_subscribers ON "User";
DROP FUNCTION IF EXISTS sync_user_email_to_subscribers();
DROP TRIGGER IF EXISTS trg_cleanup_user_personal_publication ON "User";
DROP FUNCTION IF EXISTS cleanup_user_personal_publication();
-- +goose StatementEnd
