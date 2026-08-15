-- 🔑 Scopes des clés API (moindre privilège) : READ, WRITE, ANALYTICS.
-- Les clés existantes conservent l'accès complet (défaut = les trois scopes).
ALTER TABLE "ApiKey" ADD COLUMN "scopes" TEXT[] NOT NULL DEFAULT ARRAY['READ','WRITE','ANALYTICS']::TEXT[];
