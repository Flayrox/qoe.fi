-- =====================================================================
-- 💌 Freemium emails : palier Pro par publication (décision produit)
-- =====================================================================
-- Gratuit : identité (nom + logo), langues d'envoi (QOE_EMAIL_LOCALES),
-- activation du bienvenue. Pro : tout ce qui change le rendu et les mots —
-- nom d'expéditeur, reply-to, accent, sujets, aperçus, note de pied,
-- corps du bienvenue (version UNIQUE, plus de variantes par langue : trop
-- coûteux à maintenir, décision assumée).
--
-- `emailPro` est l'INTÉRIM en attendant les abonnements Stripe (webhook →
-- SET emailPro) : appliqué CÔTÉ SERVEUR au rendu (jamais que dans l'UI —
-- contournable sinon) + assaini à la sauvegarde (le stocké ne contient
-- jamais d'overrides pro pour une publication gratuite).
--
-- +goose Up
-- +goose StatementBegin
ALTER TABLE "Publication"
    ADD COLUMN IF NOT EXISTS "emailPro" BOOLEAN NOT NULL DEFAULT false;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
ALTER TABLE "Publication"
    DROP COLUMN IF EXISTS "emailPro";
-- +goose StatementEnd
