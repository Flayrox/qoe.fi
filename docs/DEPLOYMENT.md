# 🚀 Guide de déploiement production — qoe.fi

> **État actuel (2026-08)** : monorepo pnpm, source unique Prisma dans `packages/db/prisma/`,
> **14 services Docker** sur **3 réseaux isolés**, Supabase **self-hébergé** à côté, Caddy
> comme unique reverse proxy + TLS. Déployé avec succès sur Netcup (Debian 13, 4 cœurs / 8 Go).
>
> La procédure complète est **automatisée par `scripts/bootstrap.sh`** (idempotent,
> relançable étape par étape via `SKIP_*`). Ce guide explique l'ordre, les prérequis
> et — surtout — **tous les pièges rencontrés** lors du premier déploiement réel.

---

## 📑 Table des matières

1. [Architecture actuelle](#-architecture-actuelle)
2. [Prérequis](#-prérequis)
3. [Procédure en 8 étapes (bootstrap.sh)](#-procédure-en-8-étapes)
4. [Variables d'environnement](#-variables-denvironnement)
5. [Seed & embeddings](#-seed--embeddings)
6. [TLS / Let's Encrypt](#-tls--lets-encrypt)
7. [DNS](#-dns)
8. [Mise à jour & maintenance](#-mise-à-jour--maintenance)
9. [Troubleshooting — les 15 galères du premier déploiement](#-troubleshooting--les-galères-du-premier-déploiement)
10. [Vérifications de bout en bout](#-vérifications-de-bout-en-bout)

---

## 🏗️ Architecture actuelle

### Services (docker-compose.yml, `/var/www/qoe.fi`)

| Service | Sous-domaine | Rôle |
|---|---|---|
| **caddy** | — | Reverse proxy + TLS (seul service exposé 80/443) |
| **core** | `qoe.fi` | Reader + auth (Next.js) |
| **hi** | `hi.qoe.fi` | Marketing / exposition (Next.js) |
| **studio** | `studio.qoe.fi` | Dashboard créateur (Next.js) |
| **admin** | `admin.qoe.fi` | Admin plateforme (Next.js) |
| **tenants** | `*.qoe.fi` | Blogs créateurs (Next.js, wildcard) |
| **api** | `api.qoe.fi` | Backend Go (backend-of-record, port 8080) |
| **worker** | — | Worker asynq Go (webhooks, newsletter, embeddings, collab) |
| **embedding** | — | llama.cpp + `jina-embeddings-v3-Q8_0.gguf` (600 Mo) |
| **redis** | — | Cache + queue asynq |
| **meilisearch** | — | Full-text search (interne uniquement) |
| **umami** | `umami.qoe.fi` | Analytics self-hosted |
| **umami-db** | — | Postgres d'Umami |
| **migrate** | — | One-shot goose up (s'exécute puis s'arrête) |

Supabase self-hébergé **à côté** (dans `/var/www/supabase/docker`, compose séparé) :
Postgres 17 + pgvector, GoTrue, Kong, Storage, Realtime, Studio, Meta, Pooler.
Le dashboard Studio est exposé sur **`base.admin.qoe.fi`** (cert dédié, Basic Auth + Tailscale).

### Réseaux Docker (⚠️ crucial)

| Réseau | Membres | Accès DB ? |
|---|---|---|
| **qoefi-public** | caddy, les 5 frontends Next.js, api, umami + **kong/studio** (via override) | non |
| **qoefi-private** | api, worker, redis, meili, embedding | non |
| **supabase_default** | **LES 5 FRONTENDS**, api, worker, migrate | **oui** (DB) |

> ⚠️ **Leçon n°1 (bug critique)** : les frontends Next.js font du **Prisma direct** vers
> `supabase-db:5432`. Sans le réseau `supabase_default`, la home crash avec
> `Can't reach database server at supabase-db:5432`. Tous les services qui font du
> Prisma doivent être sur ce réseau — pas seulement api/worker/migrate.

---

## ✅ Prérequis

- **VPS** : Debian 12/13 ou Ubuntu 22.04+, **8 Go RAM minimum** (4 Go passent mais c'est juste),
  4 cœurs, ~60 Go disque (les images Docker + le modèle prennent ~15 Go)
- **DNS** : la zone du domaine doit exister (chez le registrar actuel ou le nouveau),
  avec un wildcard `*.qoe.fi` possible
- **Accès root** au VPS (le bootstrap exige root)
- Un transfert de code : le repo n'est pas (encore) public → prévoir `tar | ssh`
  ou pousser le repo sur GitHub d'abord

---

## 🚀 Procédure en 8 étapes

> Tout est automatisé par `scripts/bootstrap.sh`. Tu peux relancer à volonté
> (idempotent) et sauter des étapes (`SKIP_SYSTEM=1 SKIP_BUILD=1 …`).

### Préparation : déposer les sauvegardes

Le bootstrap s'attend à des sauvegardes dans `/root/migration/` (`BOOTSTRAP_BACKUP_DIR`) :

```
migration/
├── env.docker                  ← /var/www/qoe.fi/.env.docker (OBLIGATOIRE)
├── supabase-docker.tar.gz      ← /var/www/supabase/docker (recommandé)
├── public_dump.sql             ← pg_dump --schema=public --clean --if-exists
├── auth_dump.sql               ← pg_dump --schema=auth --data-only
├── storage_dump.sql            ← pg_dump --schema=storage --data-only
├── letsencrypt/                ← /etc/letsencrypt (certs TLS, optionnel)
├── jina-embeddings-v3-Q8_0.gguf← modèle (optionnel, sinon téléchargé + SHA vérifié)
└── lassez-docker.tar.gz        ← projet radar (optionnel)
```

En base **fraîche** (sans ancien VPS), il suffit de fournir `env.docker` — le reste est
généré : clés Supabase fraîches, seed complet, modèle téléchargé.

### Étape 1 — Système de base

- `apt update && apt upgrade`
- Docker via `get.docker.com` + plugin compose
- Tuning : `vm.overcommit_memory=1`, **swap 4 G** (important pour le build : 8 Go de RAM
  + swap absorbent la compilation de 5 apps Next.js)
- Réseaux `qoefi-public` / `qoefi-private`

### Étape 2 — Supabase self-hébergé

- Restaure `supabase-docker.tar.gz` (versions identiques à l'ancien VPS) OU clone frais
  du stack Supabase (**⚠️ le tag `v1.27.12` n'existe pas chez Supabase — utiliser la
  dernière release réelle, ex. `v1.26.08`**)
- Le bootstrap écrit `docker-compose.override.yml` : attache **kong + studio à
  `qoefi-public`** pour que Caddy les joigne sans accès au réseau supabase
- `docker compose up -d` puis attente de Postgres

> ⚠️ **Leçon n°2 (kong 502)** : si `docker-compose.override.yml` est présent mais que
> Kong n'est pas sur `qoefi-public`, c'est que le `.env` du stack Supabase contient
> `COMPOSE_FILE=docker-compose.yml` qui **écrase la détection automatique** de l'override.
> Corriger : `COMPOSE_FILE=docker-compose.yml:docker-compose.override.yml` puis
> `docker compose up -d --force-recreate kong studio`.

### Étape 3 — Repo qoe.fi + .env + modèle

- Clone le repo (ou transfère ton code local par `tar | ssh` si pas de repo public)
- `.env.docker` (restauré depuis `env.docker` ou fourni)
- **Symlink `.env → .env.docker`** (le compose lit `.env` par défaut — leçon apprise !)
- Modèle d'embedding : téléchargé + **vérifié taille (600 995 424 octets) + SHA-256**
  (`da95bb31…`) — le bootstrap refuse un modèle corrompu

### Étape 4 — Migration des données (si ancien VPS)

- Restore `public_dump.sql`, purge auth/storage, restore `auth_dump.sql` + `storage_dump.sql`
- Sécurité BDD (scripts idempotents, dans l'ordre ; le schéma storage n'est pas touché) :
  1. `docker exec -i supabase-db psql -U postgres -d postgres < scripts/rls-interactions.sql`
     (active RLS + policies sur les tables d'interaction — idempotent depuis 02/09)
  2. `docker exec -i supabase-db psql -U postgres -d postgres < scripts/rls-grants.sql`
     (REVOKE des grants massifs anon/authenticated → SELECT ciblés + réplication realtime)
  3. `docker exec -i supabase-db psql -U postgres -d postgres < scripts/rls-storage.sql`
     (buckets publics + policies storage : lecture publique, upload par owner — requis upload mobile)
- Vérification des comptages

### Étape 5 — Build des images

```bash
cd /var/www/qoe.fi && docker compose build   # ~20-30 min
```

> ⚠️ **Leçon n°3 (build qui meurt avec la session SSH)** : `docker compose build &` lancé
> via SSH meurt à la déconnexion. Toujours détacher proprement :
> `nohup docker compose build > /root/qoe-build.log 2>&1 < /dev/null &`
> puis surveiller avec `tail -f /root/qoe-build.log`.

### Étape 6 — Démarrage du stack

```bash
docker compose up -d
docker compose ps
```

### Étape 7 — Vérifications

Le bootstrap teste les health checks avec `--resolve …:127.0.0.1` (le DNS pointe encore
vers l'ancien VPS à ce stade). Après la bascule DNS, relancer sans `--resolve`.

### Étape 8 — Reste manuel

- Bascule DNS (nouvelle IP)
- PTR / reverse DNS chez l'hébergeur (réputation mail)
- DKIM/SPF/DMARC (si serveur mail)
- Admin Umami
- Wildcard `*.qoe.fi` (voir §TLS)

---

## ⚙️ Variables d'environnement

Fichier `.env.docker` à la racine (jamais commité). Le référentiel est
`.env.docker.example` — mais **il diverge du réel** (contient des vestiges SENTRY/GrowthBook
et rate les variables prod). Voici l'ensemble réel utilisé en prod :

```bash
# === DOMAINE ===
PRIMARY_DOMAIN=qoe.fi
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1

# === DB (Prisma → supabase-db, réseau supabase_default) ===
DATABASE_URL="postgresql://postgres:<PW>@supabase-db:5432/postgres?schema=public"
DIRECT_URL="postgresql://postgres:<PW>@supabase-db:5432/postgres?schema=public"
# ⚠️ API Go : DSN SANS ?schema=public (pgx l'envoie en startup parameter → refusé)
API_DATABASE_URL="postgresql://postgres:<PW>@supabase-db:5432/postgres"

# === SUPABASE (self-hosted, via Caddy) ===
NEXT_PUBLIC_SUPABASE_URL=https://auth.qoe.fi
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key du stack supabase>
SUPABASE_SERVICE_ROLE_KEY=<service_role key du stack supabase>
SUPABASE_JWT_SECRET=<jwt secret du stack supabase>

# === URLs publiques ===
NEXT_PUBLIC_APP_URL=https://qoe.fi
NEXT_PUBLIC_CONSOLE_URL=https://qoe.fi
NEXT_PUBLIC_LANDING_URL=https://hi.qoe.fi
NEXT_PUBLIC_API_URL=https://api.qoe.fi
NEXT_PUBLIC_ADMIN_URL=https://admin.qoe.fi
NEXT_PUBLIC_DASHBOARD_URL=https://studio.qoe.fi
NEXT_PUBLIC_UMAMI_SCRIPT_URL=https://umami.qoe.fi/script.js

# === Interne Docker ===
QOE_API_URL=http://api:8080
REDIS_URL=redis://redis:6379
EMBEDDING_URL=http://embedding:80
EMBEDDING_MODEL=jina-embeddings-v3
EMBEDDING_INDEX_TASK=retrieval.passage
EMBEDDING_QUERY_TASK=retrieval.query
MEILISEARCH_HOST=http://meilisearch:7700
MEILI_MASTER_KEY=<clé meili>

# === Umami ===
UMAMI_API_URL=http://umami:3000/api
UMAMI_USERNAME=<admin>
UMAMI_PASSWORD=<mot de passe>
UMAMI_HASH_SALT=<salt>
UMAMI_DATABASE_URL=postgresql://postgres:<PW>@umami-db:5432/umami

# === Paiements / Email / IA ===
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
RESEND_API_KEY=re_...
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

> 💡 **Génération des secrets Supabase (base fraîche)** : `openssl rand -base64 32` pour
> `JWT_SECRET` / `SECRET_KEY_BASE` / clés d'encryption ; les clés `anon`/`service_role`
> sont des JWT signés avec le `JWT_SECRET` (claims `role: anon|service_role`, iss
> `supabase`, ~10 ans d'expiration). `REALTIME_DB_ENC_KEY` doit faire **exactement
> 16 caractères** (AES-128, codé en dur dans realtime 2.x — sinon restart en boucle).

---

## 🌱 Seed & embeddings

En base fraîche, après le premier `docker compose up -d` (migrate appliqué), le seed se
lance **dans le container `migrate`** (il contient tsx + le code seed) :

```bash
cd /var/www/qoe.fi
docker run --rm --name qoe-seed \
  --network supabase_default --network qoefi-private \
  --env-file /var/www/qoe.fi/.env.docker \
  -e NEXT_PUBLIC_SUPABASE_URL=http://supabase-kong:8000 \
  -e EMBEDDING_URL=http://qoefi-embedding:80/v1/embeddings \
  --entrypoint sh qoefi-migrate -c \
  "cd /app/packages/db && /app/node_modules/.bin/tsx prisma/seed-large.ts"
```

- `NEXT_PUBLIC_SUPABASE_URL` interne → Kong (création des **500 comptes auth**, mdp `password123`)
- `EMBEDDING_URL` doit être l'URL **complète** `…/v1/embeddings` (le script l'utilise telle quelle)

Puis les embeddings des articles/pensées :

```bash
docker run --rm --name qoe-embed-all \
  --network supabase_default --network qoefi-private \
  --env-file /var/www/qoe.fi/.env.docker \
  -v /var/www/qoe.fi/packages/db/prisma/embed-all.ts:/app/packages/db/prisma/embed-all.ts:ro \
  -e EMBEDDING_URL=http://qoefi-embedding:80/v1/embeddings \
  --entrypoint sh qoefi-migrate -c \
  "cd /app/packages/db && /app/node_modules/.bin/tsx prisma/embed-all.ts"
```

> ⚠️ **Leçon n°4 (embed-all)** : `embed-all.ts` avait l'URL d'embedding **en dur**
> (`127.0.0.1:8081`) → 500 erreurs ECONNREFUSED en prod. Corrigé (env `EMBEDDING_URL`),
> mais si tu relances depuis une **ancienne image**, monte le fichier corrigé en volume
> (`-v …:ro`) ou rebuild.

Vérif : `500 users` avec embedding, `200 articles` avec embedding, `700 pensées racines`
avec embedding, `500 comptes auth.users`.

---

## 🔐 TLS / Let's Encrypt

### Domaines nominatifs (qoe.fi + 8 sous-domaines) — 100% automatique

Le DNS pointe vers le VPS → **HTTP-01 suffit** :

```bash
apt-get install -y certbot
# ⚠️ arrêter Caddy le temps du challenge (port 80)
docker stop qoefi-caddy
certbot certonly --standalone --non-interactive --agree-tos -m admin@qoe.fi \
  -d qoe.fi -d www.qoe.fi -d hi.qoe.fi -d api.qoe.fi -d studio.qoe.fi \
  -d admin.qoe.fi -d umami.qoe.fi -d auth.qoe.fi -d cdn.qoe.fi
docker start qoefi-caddy
```

Renouvellement auto déjà en place : `certbot.timer` (systemd, 2×/jour) +
hook `/etc/letsencrypt/renewal-hooks/deploy/restart-caddy.sh` qui redémarre Caddy.

> ⚠️ **Leçon n°5 (certs auto-signés vs certbot)** : si des certs auto-signés existent déjà
> dans `/etc/letsencrypt/live/qoe.fi`, certbot refuse avec `live directory exists for qoe.fi`.
> Supprimer le dossier puis relancer. Et le cert est émis sous `qoe.fi-0001` (conflit de nom) :
> recréer `live/qoe.fi` avec des **symlinks par fichier** vers `archive/qoe.fi-0001/` :
> `cert.pem → ../../archive/qoe.fi-0001/cert1.pem`, idem `chain.pem`/`fullchain.pem`/`privkey.pem`.

### Wildcard `*.qoe.fi` (blogs tenants) — DNS-01 requis

Le wildcard n'est pas couvert par HTTP-01 → challenge **DNS-01** (un token API du
fournisseur DNS). Options :
- **certbot-dns-hetzner** (zone chez Hetzner)
- **certbot-dns-netcup** (si la zone est transférée chez Netcup — API DNS dispo)
- Ou Caddy en mode natif (`tls { dns netcup … }`)

Sans wildcard, les tenants répondent mais avec une erreur de certificat navigateur.

### base.admin.qoe.fi (3 niveaux)

Non couvert par `*.qoe.fi` → **cert dédié** (`certbot certonly -d base.admin.qoe.fi`),
mêmes symlinks. Le bloc Caddy a Basic Auth + restriction Tailscale
(`remote_ip 100.64.0.0/10` → 403 sinon).

---

## 🌍 DNS

| Type | Nom | Valeur |
|---|---|---|
| A | `qoe.fi`, `www.qoe.fi` | `<IP_VPS>` |
| A | `hi`, `api`, `studio`, `admin`, `umami`, `cdn`, `auth` .`qoe.fi` | `<IP_VPS>` |
| A | `base.admin.qoe.fi` | `<IP_VPS>` |
| A | `*.qoe.fi` (wildcard → tenants) | `<IP_VPS>` |
| MX / SPF / TXT | ne pas toucher (mail) | inchangés |

- Baisser les **TTL à 300 s** 24-48 h avant la bascule
- Pas besoin de toucher aux nameservers tant que la zone reste chez le registrar actuel

### 🚚 Transfert DNS chez Netcup (décidé le 21/08/2026)

La zone est transférée **immédiatement** chez Netcup (même hébergeur que le VPS =
zéro friction). Procédure :

1. **Recréer la zone à l'identique chez Netcup** (panel DNS, domaine `qoe.fi`) :
   - Tous les A records du tableau ci-dessus → `159.195.110.239` (IP du VPS)
   - MX : `5 mx1.hostinger.com.` / `10 mx2.hostinger.com.` (mail actuel)
   - TXT SPF : `v=spf1 include:_spf.mail.hostinger.com ~all`
   - TXT : `google-site-verification=5G2LP8qdCURCY_GzijCkVe7CaXxsEDGr73pl_II-0fM`
2. **Pointer les nameservers** chez le registrar actuel (Hetzner) vers les NS Netcup
   (`ns1.netcup.net` / `ns2.netcup.net` / `ns3.netcup.net`) — propagation 24-48 h,
   les 2 zones coexistent le temps de la bascule, le site continue de marcher.
3. **Vérifier** : `dig +short A qoe.fi` depuis plusieurs points (ex. `dig @8.8.8.8`).
4. **Une fois la zone active chez Netcup** : basculer le wildcard TLS en DNS-01 Netcup
   (`certbot-dns-netcup` ou plugin Caddy `caddy-dns/netcup`) → `*.qoe.fi` automatique,
   fini les challenges manuels. Voir §TLS.
5. (Option) PTR / reverse DNS chez Netcup pour la réputation mail.

---

## 🔄 Mise à jour & maintenance

```bash
# Sur le VPS
cd /var/www/qoe.fi
git pull                       # (ou re-transférer les fichiers changés si pas de repo public)
docker compose build           # long — toujours avec nohup !
nohup docker compose build > /root/qoe-build.log 2>&1 < /dev/null &
docker compose up -d
```

Logs / état :
```bash
docker compose ps
docker compose logs -f core    # ou api, worker, caddy…
docker stats
```

---

## 🆘 Troubleshooting — les galères du premier déploiement

### 1. La home crash : `Can't reach database server at supabase-db:5432`
**Cause** : le frontend n'est pas sur `supabase_default`. **Fix** : ajouter le réseau aux 5
frontends dans docker-compose.yml (`qoefi-public` + `qoefi-private` + `supabase_default`),
puis `docker compose up -d --force-recreate core hi studio admin tenants`.

### 2. Kong ne démarre pas : `keyauth_credentials declared twice`
**Cause** : `SUPABASE_PUBLISHABLE_KEY`/`SUPABASE_SECRET_KEY` mis = ANON/SERVICE_ROLE (doublons).
**Fix** : les laisser **vides** (mode legacy HS256 — exactement ce que l'app utilise). Le
entrypoint Kong supprime les credentials vides.

### 3. Realtime restart en boucle
**Cause** : `REALTIME_DB_ENC_KEY` doit faire **16 caractères** (AES-128).
**Fix** : `REALTIME_DB_ENC_KEY=supabaserealtime` (ou 16 chars exactement).

### 4bis. Bascule Prisma → goose sur une base existante (baseline)
Sur une base déjà migrée par Prisma (prod), le schéma est en place mais la table
goose (`goose_db_version`) n'existe pas. **Une seule fois** après le déploiement
du nouveau service `migrate` (avant son premier `up`) :

```bash
docker compose run --rm --no-deps db psql -U ${POSTGRES_USER:-qoe} -d ${POSTGRES_DB:-qoe} -c "
CREATE TABLE IF NOT EXISTS goose_db_version (
  id SERIAL PRIMARY KEY,
  version_id BIGINT NOT NULL,
  is_applied BOOLEAN NOT NULL,
  tstamp TIMESTAMP DEFAULT now()
);
INSERT INTO goose_db_version (version_id, is_applied) VALUES (1, true);"
# puis le premier up ne fera rien (version 1 déjà appliquée)
docker compose up migrate
```

Sur une base vierge (dev, CI, nouveau déploiement), aucun baseline n'est
nécessaire : `goose up` applique `00001_init.sql` (squash de l'historique
Prisma, identique à `apps/api/sql/schema/schema.sql`).

### 4. pgvector absent / `type "vector" does not exist`
**Cause** : le stack Supabase v1.26 installe l'extension dans le schéma `extensions`, mais la
migration goose s'exécute avec `search_path = public` → le type n'est pas résolu.
**Fix** :
```bash
docker exec supabase-db psql -U postgres -d postgres -c "ALTER EXTENSION vector SET SCHEMA public;"
docker compose up migrate
```

### 5. API Go : `FATAL: unrecognized configuration parameter "schema"`
**Cause** : pgx envoie `?schema=public` en startup parameter (refusé par Postgres).
**Fix** : `API_DATABASE_URL` **sans** le paramètre (le code lit `API_DATABASE_URL` en
priorité, fallback `DATABASE_URL`).

### 6. Build studio : « Server Actions must be async »
**Cause** : Turbopack (Next 16, build) exige que tout export d'un fichier `'use server'`
soit async ; `labelDemographic` (helper sync) était exporté depuis `actions.ts`.
**Fix** : extraire le helper + les constantes dans un module sans `'use server'`.

### 7. Build studio : sharp importé côté client
**Cause** : le barrel `@qoe/supabase` re-exportait `media-engine` (import sharp natif).
**Fix** : retirer `media-engine` du barrel — utiliser `@qoe/supabase/media-engine` (sous-chemin
serveur, déjà dans l'exports map).

### 8. Caddy 502 : `dial tcp: lookup api … no such host`
**Cause** : `api` n'était pas sur `qoefi-public`. **Fix** : ajouter le réseau au service api
(pour Caddy) en gardant `supabase_default` (DB) et `qoefi-private` (interne).

### 9. Caddy 502 : `lookup supabase-kong … no such host`
**Cause** : l'override `docker-compose.override.yml` du stack Supabase n'était **pas chargé**
(`COMPOSE_FILE=docker-compose.yml` dans le .env écrase la détection auto).
**Fix** : `COMPOSE_FILE=docker-compose.yml:docker-compose.override.yml` + `--force-recreate kong studio`.

### 10. Transfert de code : pas de rsync sur macOS
**Fix** : `tar --exclude='node_modules' --exclude='.next' -czf - . | ssh root@vps 'tar -xzf - -C /var/www/qoe.fi'`.
Vérifier l'intégrité : comparer `git ls-files` local vs VPS.

### 11. Package `packages/supabase` manquant sur le VPS
**Cause** : raté silencieux du transfert initial. **Fix** : re-transférer et comparer la liste
complète des fichiers git (`git ls-files | tar -T - -czf - | ssh … 'tar -xzf -'`).

### 12. Build qui « disparaît » au retour d'une commande SSH
**Fix** : toujours `nohup … > log 2>&1 < /dev/null &` (ou `setsid` côté VPS). Vérifier avec
`pgrep -af "docker compose build"` et `tail` du log.

### 13. Seed : les 500 comptes auth ne se créent pas
**Cause** : `NEXT_PUBLIC_SUPABASE_URL` pointait vers l'URL publique (pas résolue depuis le
container) ou absente. **Fix** : `-e NEXT_PUBLIC_SUPABASE_URL=http://supabase-kong:8000` dans
le container seed, avec `--network supabase_default`.

### 14. Embeddings : `ECONNREFUSED 127.0.0.1:8081`
**Cause** : URL en dur dans l'ancien script + `EMBEDDING_URL` passé sans `/v1/embeddings`.
**Fix** : URL complète `http://qoefi-embedding:80/v1/embeddings` + fichier corrigé monté en volume.

### 15. `live directory exists for qoe.fi` (certbot)
**Fix** : supprimer `/etc/letsencrypt/live/qoe.fi` avant, puis re-créer les symlinks par
fichier vers `archive/qoe.fi-0001/`.

---

## ✅ Vérifications de bout en bout

```bash
curl -sk https://api.qoe.fi/health                       # {"status":"ok"}
curl -sk -o /dev/null -w '%{http_code}\n' https://qoe.fi/home   # 200
curl -sk -o /dev/null -w '%{http_code}\n' https://hi.qoe.fi     # 200
curl -sk -o /dev/null -w '%{http_code}\n' https://umami.qoe.fi  # 200
curl -sk -o /dev/null -w '%{http_code}\n' https://auth.qoe.fi/auth/v1/health  # 401 (normal, clé requise)

# Login réel (compte seedé, mdp password123) :
ANON=<anon key>
curl -sk -X POST "https://auth.qoe.fi/auth/v1/token?grant_type=password" \
  -H "apikey: $ANON" -H "Content-Type: application/json" \
  -d '{"email":"cedric-bonnet@qoe.fi","password":"password123"}'   # → access_token

# TLS :
echo | openssl s_client -connect qoe.fi:443 -servername qoe.fi 2>/dev/null \
  | openssl x509 -noout -issuer    # issuer=Let's Encrypt

# Ressources :
docker stats        # embedding ~1.1 Go, reste < limite ; total ~3.5 Go / 8 Go
free -h ; df -h /
```

---

## 📖 Liens utiles

- [docs/MIGRATION.md](./docs/MIGRATION.md) — plan de migration détaillé (checklist jour J)
- [scripts/bootstrap.sh](./scripts/bootstrap.sh) — l'automatisation de cette procédure
- [DOCKER.md](./DOCKER.md) — architecture Docker (⚠️ partiellement datée : mongodb/growthbook/Hono legacy)
- [GETTING_STARTED.md](./GETTING_STARTED.md) — dev local
