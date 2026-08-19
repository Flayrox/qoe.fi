# 🗄️ Supabase self-hosté LOCAL (parité avec le VPS)

Le dev local utilise désormais un **Supabase self-hosté** (via le CLI Supabase)
au lieu du Supabase Cloud. Mêmes composants que le VPS (GoTrue/Postgres/Kong/
Studio/Realtime), config versionnée dans `supabase/config.toml` (`project_id =
"qoe.fi"`).

## 🚀 Démarrer / arrêter

```bash
supabase start   # boot le stack (postgres 54322, kong 54321, studio 54323)
supabase status  # clés + URLs
supabase stop    # arrête sans perdre les données
supabase stop --no-backup   # arrête ET supprime les volumes (reset complet)
```

## 🌐 Endpoints & clés (valeurs de démo CLI, non secrètes)

| Élément | Valeur |
|---|---|
| URL projet / Kong | `http://127.0.0.1:54321` |
| Studio | `http://127.0.0.1:54323` |
| DB (Postgres) | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Anon key | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0` |
| Service role key | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU` |
| JWT secret (Go API) | `super-secret-jwt-token-with-at-least-32-characters-long` |
| JWKS | `http://127.0.0.1:54321/auth/v1/.well-known/jwks.json` |

> ⚠️ Le CLI signe les **tokens de session en ES256** (pas HS256) : le Go API les
> valide via JWKS, dérivé de `SUPABASE_AUTH_URL`/`NEXT_PUBLIC_SUPABASE_URL`.
> En prod self-hosté c'est le même mécanisme (JWKS) — parité exacte.

## 📦 Fichiers d'env (tous gitignorés)

- `.env` (racine) = **source unique**, copié vers `apps/*/.env` par
  `scripts/copy-env.js` (exécuté par `pnpm dev`). Pointe sur `127.0.0.1:54321/54322`.
- `.env.docker` = pour `docker:dev`, utilise `host.docker.internal:54321/54322`
  (les conteneurs atteignent le Supabase du host).
- `apps/mobile/.env` = `EXPO_PUBLIC_SUPABASE_URL` → `127.0.0.1:54321`.
- `.env.bak.cloud` = sauvegarde de l'ancien `.env` (Supabase Cloud) pour
  revenir en arrière si besoin.

## 🧱 Schéma + RLS (à appliquer une seule fois, déjà fait)

```bash
# Schéma Prisma (idem prod : prisma migrate deploy)
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
DIRECT_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
pnpm --filter @qoe/db exec prisma migrate deploy --schema=prisma/schema.prisma

# RLS interactions (Post/Like/Bookmark/Follows/Highlight)
docker exec -i supabase_db_qoe.fi psql -U postgres -d postgres -f - < scripts/rls-interactions.sql
```

## 🧪 Vérifier

- Signup local : `curl -X POST http://127.0.0.1:54321/auth/v1/signup -H "apikey: <anon>" -H "Content-Type: application/json" -d '{"email":"...","password":"..."}'`
- Compte de test créé : `test-local@qoe.fi` / `testtest123` (supprimable via Studio → Authentication → Users).

## 🔁 Différence prod / local (assumée)

| | Local | Prod (VPS) |
|---|---|---|
| Moteur | CLI `supabase start` | stack docker `supabase/supabase@v1.27.12` |
| Auth | GoTrue ES256 (JWKS) | GoTrue v2.189 (JWKS) |
| DB | Postgres 54322 | `supabase-db:5432` (réseau `supabase_default`) |
| RLS / schéma | Prisma + `rls-interactions.sql` | idem |

Les deux sont **self-hostés** et exposent la même API Auth/REST : le code est
le même, seules les URLs/clés changent dans les `.env`.
