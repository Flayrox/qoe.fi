-- =====================================================================
-- 🧵 Migration 00094 : l'état Yjs des documents collaboratifs
-- =====================================================================
-- La table était jusqu'ici créée **à l'exécution** par le serveur de
-- collaboration (`apps/collab-server/src/database.ts`, `CREATE TABLE IF NOT
-- EXISTS`). Sur une base fraîche, `pnpm db:migrate` ne la créait donc pas : le
-- serveur dépendait du droit CREATE du rôle applicatif, et la table n'avait ni
-- propriétaire de schéma ni politique de sauvegarde.
--
-- Le `CREATE TABLE IF NOT EXISTS` reste dans le code (confort de dev, base
-- mémoire exceptée) : il devient une simple ceinture, pas le propriétaire.
-- =====================================================================

-- +goose Up
CREATE TABLE IF NOT EXISTS collab_documents (
    document_name TEXT PRIMARY KEY,
    state BYTEA NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- +goose Down
DROP TABLE IF EXISTS collab_documents;
