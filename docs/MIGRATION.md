# 🚚 Migration vers le nouveau VPS — Checklist jour J

> Document de référence à relire **pendant** la migration. Ne contient **aucun secret** :
> chaque secret est référencé par son **origine** (où le trouver) et son **action** (copier / régénérer / récupérer).
>
> Statut : planifié — nouveau serveur + serveur mail auto-hébergé (réputation IP).

---

## 0. État des lieux (l'ancien VPS aujourd'hui)

| Élément | Valeur actuelle |
|---|---|
| Serveur | Hetzner — IP `178.104.197.3`, 4 cœurs / 8 Go RAM, swap 4 G |
| Stack qoe.fi | Docker Compose, 14 services (`/var/www/qoe.fi`) — `worker-node` (BullMQ) supprimé, tout passe par asynq (`worker`) |
| Supabase | Self-hébergé dans `/var/www/supabase/docker` (Postgres 17.6 + pgvector 0.8.2, GoTrue v2.189.0, Kong, Storage, Studio, Realtime) |
| Embeddings | llama.cpp + `jina-embeddings-v3-Q8_0.gguf` (600 Mo) dans `/var/www/qoe.fi/models/` |
| Certs TLS | Certbot : `qoe.fi` + `*.qoe.fi` (wildcard, challenge DNS-01 **manuel**) — **valide jusqu'au 07/10**. ⚠️ `base.admin.qoe.fi` (3 niveaux) n'est PAS couvert par `*.qoe.fi` → cert DÉDIÉ à générer avant la migration (Phase 0) |
| DNS | Nameservers **Hetzner** (`hydrogen/oxygen/helium.ns.hetzner.com`) |
| Email actuel | **Hostinger** (MX `mx1/mx2.hostinger.com`, SPF `include:_spf.mail.hostinger.com`) ← source probable des soucis de réputation |
| Autres projets sur le VPS | lassez (processus hôte, ports 4000-4002), radar (pm2), coolify, portainer |

### Enregistrements DNS actuels (à recréer sur le nouveau serveur)

| Type | Nom | Valeur |
|---|---|---|
| A | qoe.fi | 178.104.197.3 |
| A | www.qoe.fi | 178.104.197.3 |
| A | start / api / studio / admin / umami / cdn / auth .qoe.fi | 178.104.197.3 |
| A | base.admin.qoe.fi (Supabase Studio — nouveau nom) | 178.104.197.3 |
| MX | qoe.fi | `5 mx1.hostinger.com.` / `10 mx2.hostinger.com.` |
| TXT | qoe.fi | `v=spf1 include:_spf.mail.hostinger.com ~all` |
| TXT | qoe.fi | `google-site-verification=5G2LP8qdCURCY_GzijCkVe7CaXxsEDGr73pl_II-0fM` |

---

## 1. Décisions à prendre AVANT le jour J

- [ ] **Fournisseur** : Netcup (IP à bonne réputation mail) — taille / RAM à choisir (8 Go min recommandé)
- [ ] **DNS** : rester chez Hetzner OU passer chez Netcup — recommandé : **Netcup** (tout centralisé : serveur + DNS + mail)
- [ ] **TLS** : remplacer certbot (renouvellement manuel pénible) par **Caddy DNS-01 netcup** → wildcard automatique, zéro action manuelle. (Plugins vérifiés : `caddy-dns/netcup` ✅, `caddy-dns/hetzner` ✅)
- [ ] **Serveur mail** : Mailcow ou équivalent sur le nouveau VPS + DKIM/SPF/DMARC + **reverse DNS (PTR) chez Netcup** (essentiel pour la réputation)
- [ ] **Provider email des apps** : le code a déjà l'abstraction (`EMAIL_PROVIDER` + registry Resend/Postmark/SES/SMTP dans `packages/workers/src/email-provider.ts`) → brancher le SMTP auto-hébergé (Resend en fallback)
- [x] **lassez.fr / radar** : DÉCIDÉ — on le garde (média de l'utilisateur, sa propre DB Supabase cloud). Migration à l'identique (network_mode host, ports 4000-4002 joints par Caddy via `host.docker.internal`). À terme il sera absorbé par qoe.fi comme plateforme propriétaire — ne pas investir dans sa restructuration.
- [x] **Coolify** : DÉCIDÉ — à la poubelle (proxy mort, hébergeait seulement le bot Discord, lui aussi supprimé). Remplacé par **Portainer** (déjà installé, plus léger) pour l'admin visuel Docker.
- [ ] **Rollback** : garder le VPS Hetzner actif ~7 jours après la bascule (repointer le DNS = rollback instantané)

### Décisions v2 — organisation Docker (à appliquer au nouveau serveur)

- **Noms** : `qoefi-api` (ex `qoefi-api-go`), `qoefi-worker` (ex `qoefi-api-go-worker`), `qoefi-studio` (ex `qoefi-dashboard`), `qoefi-tenants` (ex `qoefi-web`), `qoefi-console` (ex `qoefi-feed`), `qoefi-start` (ex `qoefi-landing`). **`qoefi-worker-node` SUPPRIMÉ** : vestige BullMQ, plus rien n'enqueue vers lui (0 job traité en 24 h, queues vides) — tout passe par asynq. Kebab-case partout (convention DNS/hostname, pas de `_`). Convention : **nom de service = sous-domaine** quand il existe (start/studio/admin/api) ; `console`/`tenants` n'ont pas de sous-domaine propre (qoe.fi racine et wildcard). `QOE_API_GO_URL` reste le nom de l'env var (dossier `apps/api-go` inchangé) — seule la **valeur** devient `http://api:8080`.
- **Sous-domaines v2** : `dashboard.qoe.fi` → **`studio.qoe.fi`** ; `admin-studio.qoe.fi` → **`base.admin.qoe.fi`** (cert dédié requis, wildcard ne couvre pas les 3 niveaux). Mettre à jour dans `.env.docker` : `NEXT_PUBLIC_DASHBOARD_URL=https://studio.qoe.fi`.
- **Segmentation réseau par rôle** (voir docker-compose.yml) : `qoefi-public` = caddy + frontends + kong/studio ; `qoefi-private` = api/worker/redis/meili/embedding ; `supabase_default` = **uniquement** api, worker, migrate. Les frontends et caddy n'ont plus accès à la DB.
- **Override Supabase** : `docker-compose.override.yml` dans `/var/www/supabase/docker` (créé par bootstrap.sh) attache kong/studio à `qoefi-public` (Caddy les joint sans toucher au réseau supabase). ⚠️ Ne pas renommer `realtime-dev.supabase-realtime` (realtime dérive son tenant id de son nom de conteneur — officiel Supabase).
- **Meilisearch** : plus de port public 7700 (interne uniquement, joint par l'API Go).

---

## 2. 🔑 Inventaire des secrets

### Groupe A — À COPIER depuis l'ancien VPS (aucune régénération nécessaire)

| Secret | Fichier source | Destination |
|---|---|---|
| `POSTGRES_PASSWORD` | `/var/www/supabase/docker/.env` | `.env.docker` (DATABASE_URL/DIRECT_URL) + supabase stack |
| `ANON_KEY` / `SERVICE_ROLE_KEY` | `/var/www/supabase/docker/.env` | `.env.docker` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| `JWT_SECRET` (supabase) | `/var/www/supabase/docker/.env` | `.env.docker` → `SUPABASE_JWT_SECRET` |
| `SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_SECRET_KEY` | `/var/www/supabase/docker/.env` | supabase stack |
| `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` | `/var/www/supabase/docker/.env` | supabase stack (Studio) |
| `SECRET_KEY_BASE`, `REALTIME_DB_ENC_KEY`, `VAULT_ENC_KEY`, `PG_META_CRYPTO_KEY` | `/var/www/supabase/docker/.env` | supabase stack |
| `LOGFLARE_PUBLIC/PRIVATE_ACCESS_TOKEN` | `/var/www/supabase/docker/.env` | supabase stack |
| `S3_PROTOCOL_ACCESS_KEY_ID/SECRET`, `MINIO_ROOT_USER/PASSWORD` | `/var/www/supabase/docker/.env` | supabase stack |
| `MEILI_MASTER_KEY` | `.env.docker` VPS | `.env.docker` |
| `UMAMI_USERNAME` / `UMAMI_PASSWORD` / `UMAMI_HASH_SALT` | `.env.docker` VPS | `.env.docker` |
| `SSO_JWT_SECRET` | `.env.docker` VPS (ancien env) | `.env.docker` |
| `HF_TOKEN` | `.env.docker` (local + VPS) — compte HuggingFace de l'utilisateur | `.env.docker` |
| Certs `/etc/letsencrypt/` | VPS (qoe.fi valide jusqu'au 07/10) | copier tel quel pour repartir ; puis bascule DNS-01 |

### Groupe B — À RÉCUPÉRER sur les dashboards (comptes utilisateur)

| Secret | Où le récupérer |
|---|---|
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | dashboard.stripe.com |
| `NEXT_PUBLIC_TOLGEE_API_KEY` | app.tolgee.io |
| `OPENAI_API_KEY` | platform.openai.com |
| `ANTHROPIC_API_KEY` | console.anthropic.com |

### Groupe C — Dérivés / NON secrets (à reconstruire)

| Variable | Valeur |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://auth.qoe.fi` |
| `NEXT_PUBLIC_APP_URL` / `CONSOLE_URL` | `https://qoe.fi` |
| `NEXT_PUBLIC_LANDING_URL` | `https://start.qoe.fi` |
| `NEXT_PUBLIC_API_URL` | `https://api.qoe.fi` |
| `NEXT_PUBLIC_ADMIN_URL` | `https://admin.qoe.fi` |
| `NEXT_PUBLIC_DASHBOARD_URL` | `https://studio.qoe.fi` (renommé v2 — à mettre à jour dans le `.env.docker` cible, puis REBUILD) |
| `NEXT_PUBLIC_UMAMI_SCRIPT_URL` | `https://umami.qoe.fi/script.js` |
| `DATABASE_URL` / `DIRECT_URL` | `postgresql://postgres:<PW>@supabase-db:5432/postgres` (réseau `supabase_default`) |
| `REDIS_URL` | `redis://redis:6379` |
| `EMBEDDING_URL` | `http://embedding:80` |
| `QOE_API_GO_URL` | `http://api:8080` (service compose `api` → `qoefi-api`) |
| `EMBEDDING_MODEL` / `_INDEX_TASK` / `_QUERY_TASK` / `_DIMS` | `jina-embeddings-v3` / `retrieval.passage` / `retrieval.query` / `512` |
| `DEFAULT_LANGUAGE` | `fr` |
| DNS | voir §0 (A records → nouvelle IP, MX/SPF/DKIM/DMARC → nouveau serveur mail) |

### Groupe D — NOUVEAUX (serveur mail)

| Secret | Note |
|---|---|
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | à créer (Mailcow) |
| Clés DKIM | générées par Mailcow, à publier en TXT |
| `EMAIL_PROVIDER` | `smtp` (à implémenter) |
| Reverse DNS (PTR) | à configurer chez **Netcup** (panel) |

> 💡 **Astuce** : sur l'ancien VPS, `cp /var/www/qoe.fi/.env.docker /tmp/env-backup-$(date +%F)` et `cp /var/www/supabase/docker/.env /tmp/supabase-env-backup-$(date +%F)` avant de couper — ces deux fichiers suffisent pour le groupe A.

---

## 3. ✅ Checklist jour J (dans l'ordre)

> 🤖 **Tout ce qui suit (Phases 1-4 + vérifs) est automatisé par `scripts/bootstrap.sh`**
> (idempotent, skippable par étape). Cette checklist reste la référence pour
> comprendre l'ordre, préparer les sauvegardes et gérer la bascule DNS.

### Phase 0 — Préparation (J-2)

- [ ] Commander le nouveau VPS (Netcup), générer la clé SSH, tester l'accès
- [ ] **Baisser les TTL DNS à 300 s** sur tous les records (48 h avant, pour une propagation rapide)
- [ ] Sauvegarder sur l'ancien VPS : `.env.docker`, supabase `.env`, `/etc/letsencrypt/`, dumps DB, `models/` (GGUF), `/var/www/qoe.fi.old-*` (rollback), `/var/www/lassez-docker` (tar czf `lassez-docker.tar.gz`)
- [ ] **Générer le cert DÉDIÉ de Supabase Studio sur l'ancien VPS** (une seule fois, challenge DNS-01 manuel — il sera inclus dans la sauvegarde `letsencrypt/`) :
  ```bash
  certbot certonly -d base.admin.qoe.fi   # ajouter le TXT demandé, puis vérifier /etc/letsencrypt/live/base.admin.qoe.fi
  ```
- [ ] Tout déposer dans `/root/migration/` du nouveau VPS (attendu par bootstrap.sh)
- [ ] Préparer le `.env.docker` cible (groupe A copié + groupe B récupéré + groupe C reconstruit)
- [ ] Vérifier les version pins Supabase de l'ancien VPS (images docker) pour réinstaller **les mêmes versions**

### Phase 1 — Serveur de base (nouveau VPS)

```bash
# SSH + mises à jour
apt update && apt upgrade -y

# Docker + compose plugin
curl -fsSL https://get.docker.com | sh

# Tuning (comme sur l'ancien)
sysctl -w vm.overcommit_memory=1 && echo 'vm.overcommit_memory = 1' >> /etc/sysctl.conf
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Réseaux docker (noms identiques à l'ancien)
docker network create qoefi-public
docker network create qoefi-private
```

### Phase 2 — Supabase self-hébergé

```bash
# Installer le même stack que l'ancien VPS (voir /var/www/supabase/docker sur l'ancien)
git clone https://github.com/supabase/supabase.git /opt/supabase  # ou copier /var/www/supabase/docker tel quel
cd /opt/supabase/docker && cp .env.example .env
# → y coller les secrets du GROUPE A (POSTGRES_PASSWORD, ANON_KEY, SERVICE_ROLE_KEY, JWT_SECRET, etc.)
# → SITE_URL=https://qoe.fi, ADDITIONAL_REDIRECT_URLS, SMTP_* (nouveau serveur mail)
# → déposer docker-compose.override.yml (kong/studio → qoefi-public, voir Décisions v2)
#   — généré automatiquement par scripts/bootstrap.sh —
docker compose up -d
# Vérifier : docker compose ps, Kong sur :8000, Studio sur :3000
```

### Phase 3 — Migration des données

```bash
# ── 3a. Dump sur l'ANCIEN VPS (ou depuis le cloud Supabase) ──
pg_dump "$DATABASE_URL_ANCIEN" --schema=public --clean --if-exists -f /tmp/public_dump.sql
pg_dump "$DATABASE_URL_ANCIEN" --schema=auth --data-only -f /tmp/auth_dump.sql
pg_dump "$DATABASE_URL_ANCIEN" --schema=storage --data-only -f /tmp/storage_dump.sql
# ⚠️ retirer ?pgbouncer=true de l'URL avant pg_dump

# ── 3b. Restore sur le NOUVEAU VPS ──
cat /tmp/public_dump.sql | docker exec -i supabase-db psql -U postgres -d postgres
# (si erreurs DROP sur tables inexistantes : ignorer, puis reset public + recréer
#  l'extension vector + grants avant de restaurer — cf. procédure initiale)

# Purge des données de test auth/storage puis restore data-only :
cat /tmp/auth_dump.sql    | docker exec -i supabase-db psql -U postgres -d postgres
cat /tmp/storage_dump.sql | docker exec -i supabase-db psql -U postgres -d postgres

# ── 3c. Post-restore ──
# Grants postgres/anon/authenticated/service_role sur les tables public
# Réappliquer les policies RLS :
cat scripts/rls-interactions.sql | docker exec -i supabase-db psql -U postgres -d postgres
# Vérifier les comptages : articles, users, posts, storage

# ── 3d. Projet annexe : lassez/radar (sa propre DB Supabase cloud) ──
tar xzf /root/migration/lassez-docker.tar.gz -C /var/www/
cd /var/www/lassez-docker && docker compose up -d   # network_mode host (ports 4000-4002)
```

### Phase 4 — Déploiement qoe.fi

```bash
cd /var/www && git clone https://github.com/Flayrox/qoe.fi.git && cd qoe.fi
# Écrire le .env.docker (groupes A + B + C) puis :
ln -s .env.docker .env   # ← le compose lit .env par défaut (leçon apprise !)

# Modèle d'embedding (600 Mo, source vérifiée) :
mkdir -p models
curl -sL -o models/jina-embeddings-v3-Q8_0.gguf \
  "https://huggingface.co/second-state/jina-embeddings-v3-GGUF/resolve/main/jina-embeddings-v3-Q8_0.gguf"
# vérifier : 600995424 octets (le bootstrap vérifie aussi le SHA-256)

# 📛 Noms v2 : services `api`, `worker`, `studio`, `tenants`, `console`, `start`
#    (ex api-go, api-go-worker, dashboard, web, feed, landing)
#    docker compose ps doit lister : qoefi-caddy, qoefi-console, qoefi-start, qoefi-studio,
#    qoefi-admin, qoefi-tenants, qoefi-api, qoefi-worker,
#    qoefi-embedding, qoefi-redis, qoefi-meilisearch, qoefi-umami, qoefi-umami-db, qoefi-migrate
#    (worker-node BullMQ supprimé — plus rien n'enqueue vers BullMQ)

# TLS : basculer le Caddyfile sur DNS-01 netcup (supprime certbot)
#   tls { dns netcup <token> } — sinon copier /etc/letsencrypt de l'ancien VPS en attendant

docker compose build        # ~20-30 min (surveiller la RAM, le swap absorbe)
docker compose up -d
docker compose ps
```

### Phase 5 — Bascule DNS (le moment critique)

> ⚠️ Faire à un moment calme. Les certs existants restent valides pendant la bascule.

- [ ] Créer la zone chez Netcup (ou repointage des NS vers Netcup)
- [ ] Créer les A records (voir §0) → **NOUVELLE IP**
- [ ] MX → nouveau serveur mail, SPF mis à jour, TXT DKIM + DMARC
- [ ] (option) PTR / reverse DNS chez Netcup
- [ ] Vérifier la propagation (`dig +short A qoe.fi` depuis plusieurs points)

### Phase 6 — Vérifications de bout en bout

```bash
curl -s https://api.qoe.fi/health                          # {"status":"ok"}
curl -s -o /dev/null -w '%{http_code}\n' https://qoe.fi    # 200/307
curl -s -o /dev/null -w '%{http_code}\n' https://start.qoe.fi
curl -s -o /dev/null -w '%{http_code}\n' https://studio.qoe.fi
curl -sk -o /dev/null -w '%{http_code}\n' https://base.admin.qoe.fi  # via Tailscale (sinon 403 attendu)
# Recherche sémantique (llama.cpp + pgvector) :
curl -s "https://api.qoe.fi/search/semantic?q=identit%C3%A9+num%C3%A9rique"
# Recherche lexicale (meilisearch) :
curl -s "https://api.qoe.fi/search/articles?q=test"
# RLS (doit fonctionner) : anon voit les posts publics, pas les privés
# Mail : envoi de test (inscription / récupération mot de passe)
# Dashboard : /articles charge (contrat JWT)
# Umami : admin + tracker
# docker stats : RAM OK (embedding ~600 Mo, web 1 Go…)
```

---

## 4. 🧯 Rollback

1. **Avant la bascule DNS** : rien n'est cassé — l'ancien VPS tourne toujours, on repointe le DNS quand on veut.
2. **Après la bascule** : repasser les A records vers `178.104.197.3` (TTL 300 s → effet en ~5 min).
3. Sauvegardes conservées : dumps DB + `.env` + `/etc/letsencrypt` + `qoe.fi.old-*`.

---

## 5. Leçons de la première installation (à ne pas refaire)

| Piège | Solution |
|---|---|
| `docker compose up` sans `--env-file` → `${VAR}` vides | symlink `.env → .env.docker` |
| api-go écoute sur `:8090` (lit `API_PORT`) | `API_PORT=8080` dans le compose |
| TEI ne supporte pas jina-v3 (graph ONNX) | llama.cpp (config locale prouvée) |
| `postgres` pas superuser sur Supabase self-hébergé | grants correctifs sur les tables public |
| Routes Caddy dupliquées (clé API masquait JWT) | un seul enregistrement + scopes |
| pnpm 9.15 vs lockfile pnpm 11.21 | Dockerfile aligné (node 22, pnpm 11.21) |
| coolify-proxy occupait 80/443 | arrêté (rien ne passait par lui) |
| Certs wildcard certbot = renouvellement manuel TXT | **→ Caddy DNS-01 (Netcup/Hetzner)** |

---

## 6. À faire après la migration (améliorations prévues)

- [ ] Provider email SMTP dans le code (`EMAIL_PROVIDER`), Resend en fallback
- [ ] Script de bootstrap automatisé (`scripts/bootstrap.sh`) rendant cette checklist inutile
- [ ] Mettre à jour `.env.docker.example` (il diverge du réel : manquent `SSO_JWT_SECRET`, `MEILI_MASTER_KEY`, `HF_TOKEN`, `EMBEDDING_*`, `REDIS_URL`, `SUPABASE_JWT_SECRET`, `NEXT_PUBLIC_TOLGEE_*` ; contient `SENTRY_DSN`, `GROWTHBOOK_*` inutilisés)
- [ ] Supprimer les backups `qoe.fi.old-*` + images dangling (libère ~6-10 Go)
