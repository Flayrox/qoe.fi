-- =====================================================================
-- 00077_reader_features_catalog.sql — Catalogue opérationnel : features lecteur
-- =====================================================================
-- Enregistre les fonctionnalités lecteur dans le catalogue opérationnel
-- "Feature" pour permettre l'inscription à la notification de lancement
-- et l'aiguillage dans l'application.
-- =====================================================================

-- +goose Up
-- +goose StatementBegin
INSERT INTO "Feature" ("key", "status", "notifyEnabled", "href")
VALUES
    ('audio-tts',       'coming-soon', true, '/library'),
    ('ai-summary',      'coming-soon', true, null),
    ('reading-papers',  'coming-soon', true, null),
    ('offline-reading', 'coming-soon', true, '/library'),
    ('direct-messages', 'coming-soon', true, null)
ON CONFLICT ("key") DO NOTHING;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DELETE FROM "Feature"
WHERE "key" IN ('audio-tts', 'ai-summary', 'reading-papers', 'offline-reading', 'direct-messages');
-- +goose StatementEnd
