# 🌐 Dev VPS — Runbook

Migration de l'infra de développement de la machine locale vers le VPS de dev
(Hetzner `116.203.158.47`, alias SSH `dev`). Les apps (Next, API Go, collab)
restent **en local** sur le Mac ; tous les services (Postgres, Redis, Meili,
Supabase, Jina) vivent sur le VPS.

## Principe

```
Browser/Mac ──► apps locales (core :15402, API Go :15407)
                      │
                      ├──► VPS 116.203.158.47:15409  Postgres app (pgvector) + umami
                      ├──► VPS 116.203.158.47:15410  Redis (asynq)
                      ├──► VPS 116.203.158.47:15408  Meilisearch
                      ├──► VPS 116.203.158.47:15411  Umami
                      ├──► VPS 116.203.158.47:8081   llama.cpp / Jina embeddings
                      └──► VPS 116.203.158.47:54321  Supabase (envoy → auth/rest/storage)
```

## Services sur le VPS

| Dossier | Contenu | Démarrage |
|---|---|---|
| `/opt/qoe-infra` | db pgvector (15409), redis (15410), meili (15408, clé lockée ufw), mongo (15414), growthbook (15412/15413), umami (15411) | `ssh dev` puis `cd /opt/qoe-infra && docker compose up -d` |
| `/opt/qoe-supabase` | Self-hosted Supabase 2026 (envoy 54321, db/studio internes) | `cd /opt/qoe-supabase && docker compose up -d` |
| `/opt/qoe-embed` | llama.cpp server Jina (8081) | `cd /opt/qoe-embed && docker compose up -d` |

Le `.env` racine du repo pointe vers le VPS (voir section suivante).

## Raccourcis utiles

```bash
ssh dev                         # accès VPS (clé SSH, pas de mot de passe)
# Logs API locale (launchd)
tail -f /tmp/qoefi-api-server.log /tmp/qoefi-api-worker.log
# Migrations goose (depuis le Mac, vers la DB VPS)
cd apps/api && set -a && . ./.env && set +a && go run ./cmd/migrate status
# Reindex Meilisearch après un gros import
cd apps/api && go run ./cmd/backfill -meili
# Studio Supabase : http://116.203.158.47:54323 (non publié par défaut)
```

## Points d'attention

1. **Firewall ufw** : SSH (22) ouvert partout, les ports services (`15409`,
   `15410`, `15408`, `15411`, `15414`, `15412`, `15413`, `8081`, `54321`) ne
   sont ouverts que vers l'IP publique du Mac (`77.130.243.128`). Si ton IP
   change (box), `ssh dev` rejoint toujours (SSH ouvert partout), mais le
   navigateur ne pourra plus joindre les services → ré-ouvrir les ports depuis
   la nouvelle IP (`ufw delete` + `ufw allow from <IP>`).
2. **4 Go de RAM + swap 8G** : c'est serré mais ça tient. Si ça rame, ne pas
   lancer studio + growthbook + mongo en même temps, ou upgrader (CX32).
3. **Le schéma `public` du Postgres Supabase (54322) est vide** : l'app ne l'a
   jamais utilisé (auth + storage seulement, aucune requête REST `.from()` dans
   le code). Les données applicatives sont dans le Postgres app (15409).
   Ne pas s'inquiéter d'un `PGRST205` sur des tables métier via REST Supabase.
4. **Jina local (launchd) désactivé** : `EMBEDDING_URL` pointe vers le VPS.
   Le plist `com.qoefi.embedding-server` existe encore pour référence ; ne pas
   le relancer (occupation inutile de la RAM + port 8081).
5. **Sauvegarde du `.env` local d'origine** : `/tmp/qoe-env-backup-*` (avant
   repointage vers le VPS). Pour revenir en arrière : restore ce fichier puis
   `node scripts/copy-env.js` et relancer API/worker/core.
6. **Secrets** : le mot de passe root du VPS a été utilisé une seule fois pour
   poser la clé SSH (`~/.ssh/qoe_dev`, alias `dev` dans `~/.ssh/config`).
   Accès par clé uniquement désormais.
7. **Migration des données** (fait le 4 sept 2026) : app DB 209 articles /
   516 users, auth Supabase 2140 users, storage 82 objets, meili 209 docs
   (via `backfill -meili`). Pour re-synchroniser : dump `pg_dump -Fc` + restore,
   ou refaire le `backfill -meili`.

## Cycle de dev normal

```bash
# Infra : déjà up sur le VPS (auto-restart au boot via Docker restart policies)
node scripts/copy-env.js   # si le .env racine a changé
pnpm dev                   # apps locales (core, API, worker via launchd)
```

Redémarrer l'API/worker après un changement de `.env` :

```bash
launchctl kickstart -k gui/$(id -u)/com.qoefi.api-server
launchctl kickstart -k gui/$(id -u)/com.qoefi.api-worker
```