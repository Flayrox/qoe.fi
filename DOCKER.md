# 🐳 Guide Docker — qoe.fi monorepo (état post-refacto)

> **13 services, 2 réseaux isolés, 1 source de vérité pour Prisma.**
> Ce guide reflète l'état après le refacto qui a dédupliqué `packages/db/prisma/`.

---

## 📑 Table des matières

1. [Architecture](#-architecture)
2. [Prérequis](#-prérequis)
3. [Démarrage dev local](#-démarrage-dev-local)
4. [Commandes dev](#-commandes-dev)
5. [Commandes prod](#-commandes-prod)
6. [Déploiement VPS](#-déploiement-vps)
7. [DNS et SSL](#-dns-et-ssl)
8. [Troubleshooting](#-troubleshooting)
9. [FAQ](#-faq)

---

## 🏗️ Architecture

### Services

| Service           | Port externe | Réseau  | Build stage / Image    | Description                                                |
| ----------------- | ------------ | ------- | ---------------------- | ---------------------------------------------------------- |
| **caddy**         | 80, 443      | public  | runtime                | Reverse proxy + TLS auto (Let's Encrypt)                   |
| **web**           | 4001→3000    | public  | `web`                  | Next.js public (blogs créateurs / tenants)                 |
| **landing**       | 4040→3040    | public  | `landing`              | Next.js marketing (`start.qoe.fi`)                         |
| **feed**          | 4000→3010    | public  | `feed`                 | Next.js reader (`qoe.fi` + auth central)                   |
| **studio**        | 4020→3020    | public  | `dashboard`            | Next.js creator (`studio.qoe.fi`)                          |
| **admin**         | 4030→3030    | public  | `admin`                | Next.js superadmin (`admin.qoe.fi`)                        |
| **api**           | 4002→3002    | public  | `api`                  | Hono legacy (transition, `api-legacy.qoe.fi`)              |
| **workers**       | -            | private | `workers`              | BullMQ jobs (emails, AI, billing)                          |
| **migrate**       | -            | private | runtime                | One-shot Prisma migrate (s'exécute puis s'arrête)          |
| **redis**         | 6379         | private | redis:7-alpine         | Cache + queue                                              |
| **db (Supabase)** | 5433→5432    | private | `supabase/postgres:17` | Postgres 17 + pgvector (hébergé dans `/var/www/supabase/`) |
| **mongodb**       | 27018→27017  | private | mongo:7                | Stockage du dashboard GrowthBook (dev)                     |
| **growthbook**    | 3100→3000, 3200→3100 | private | `growthbook/growthbook:latest` | Feature flags self-hostés (UI + API SDK, dev)   |

### Domaines

| Subdomain               | Service interne | Description                                                    |
| ----------------------- | --------------- | -------------------------------------------------------------- |
| `qoe.fi`                | feed            | Flux lecteur & authentification centrale                       |
| `www.qoe.fi`            | feed            | Redirection vers domaine racine                                |
| `studio.qoe.fi`         | studio          | Dashboard créateur / studio d'édition                          |
| `admin.qoe.fi`          | admin           | Panneau de contrôle super-administrateur                       |
| `start.qoe.fi`          | landing         | Vitrine commerciale de l'application                           |
| `*.qoe.fi` (wildcard)   | web             | Blogs publics des créateurs (multi-tenancy)                    |
| `api.qoe.fi`            | api-go          | Backend Go de référence (backend-of-record)                   |
| `api-legacy.qoe.fi`      | api             | API Hono créateurs/médias (transition)                         |
| `admin-supabase.qoe.fi` | Supabase Kong   | API Rest Supabase Auto-hébergée (avec proxy cache NVMe)        |
| `base.admin.qoe.fi`     | Supabase Studio | Interface GUI de la base de données (sécurisée par Basic Auth + Tailscale) ⚠️ cert dédié (3 niveaux, non couvert par `*.qoe.fi`) |
| `cdn.qoe.fi`            | Nginx Host      | CDN d'images & Stockage public (sécurisé avec cache local)     |

### Réseaux

- **`qoefi-public`** : caddy, web, landing, feed, dashboard, admin, api, workers
- **`qoefi-private`** : redis, migrate, workers (accès DB via loopback `host.docker.internal:5433`)

---

## ✅ Prérequis

- Docker Desktop (ou Docker Engine + Compose v2)
- Un fichier `.env.docker` configuré (voir template `.env.docker.example`)
- 4 GB de RAM minimum pour faire tourner la stack complète

---

## 🏁 Démarrage dev local

```bash
# 1. Cloner
git clone https://github.com/ton-user/qoe.fi.git
cd qoe.fi

# 2. Copier le template d'env
cp .env.docker.example .env.docker
# Édite .env.docker avec tes clés Supabase, Stripe, etc.

# 3. Lancer le stack dev complet
pnpm docker:dev
# OU directement :
docker compose -f docker-compose.dev.yml up
```

### URLs accessibles en local (Docker Dev)

| URL                                       | Service                     | Port local (Docker)  | Port local (npm dev) |
| ----------------------------------------- | --------------------------- | -------------------- | -------------------- |
| `http://qoe.fi:4000`                      | feed (flux lecteur + auth)  | 4000 (interne: 3010) | 3010                 |
| `http://start.qoe.fi:4040`                | landing (site vitrine)      | 4040 (interne: 3040) | 3040                 |
| `http://studio.qoe.fi:4020`               | studio (dashboard créateur) | 4020 (interne: 3020) | 3020                 |
| `http://admin.qoe.fi:4030`                | admin (panel superadmin)    | 4030 (interne: 3030) | 3030                 |
| `http://localhost:4001` (ou `*.qoe.fi`)   | web (blogs créateurs)       | 4001 (interne: 3000) | 3001                 |
| `http://localhost:4002/health`            | api (Hono legacy, transition) | 4002 (interne: 3002) | 3002                 |
| `psql -h localhost -p 5433 -U qoe -d qoe` | db (Postgres direct)        | 5433 (interne: 5432) | 5433                 |
| `redis-cli -h localhost -p 6379`          | redis (Redis cache direct)  | 6379                 | 6379                 |
| `http://localhost:3100`                   | growthbook (dashboard flags)| 3100 (interne: 3000) | 3100                 |
| `http://localhost:3200`                   | growthbook (API SDK flags)  | 3200 (interne: 3100) | 3200                 |

> Pour utiliser les vrais subdomains en local, ajoute dans `/etc/hosts` :
>
> ```
> 127.0.0.1 qoe.fi studio.qoe.fi admin.qoe.fi start.qoe.fi api.qoe.fi
> ```

---

## 🐘 Postgres local

```bash
# Connexion psql (depuis le host)
psql -h localhost -p 5433 -U qoe -d qoe

# Dans le container
pnpm docker:dev:db
# → Ouvre psql automatiquement

# Redis
pnpm docker:dev:redis
# → Ouvre redis-cli
```

---

## 🎮 Commandes dev

### Lifecycle

```bash
pnpm docker:dev          # Lance tout (foreground, logs en direct)
pnpm docker:dev:detached # Lance en arrière-plan
pnpm docker:dev:down     # Stop + remove containers
pnpm docker:dev:reset    # ⚠️ Reset COMPLET (supprime data)
pnpm docker:dev:logs     # Tous les logs
```

### Par service

```bash
pnpm docker:dev:web         # Logs web
pnpm docker:dev:landing     # Logs landing
pnpm docker:dev:feed        # Logs feed
pnpm docker:dev:dashboard   # Logs dashboard
pnpm docker:dev:admin       # Logs admin
pnpm docker:dev:api         # Logs api
pnpm docker:dev:shell       # Shell dans le container feed
pnpm docker:dev:db          # psql dans db
pnpm docker:dev:redis       # redis-cli
pnpm docker:dev:studio      # Prisma Studio (http://localhost:5555)
```

### Build manuel

```bash
# Build toutes les cibles du Dockerfile multi-target
docker build --target web -t qoefi-web:latest .
docker build --target landing -t qoefi-landing:latest .
docker build --target feed -t qoefi-feed:latest .
docker build --target dashboard -t qoefi-dashboard:latest .
docker build --target admin -t qoefi-admin:latest .
docker build --target api -t qoefi-api:latest .
docker build --target workers -t qoefi-workers:latest .

# Build + lance tout en arrière-plan
pnpm docker:prod
```

---

## 🏭 Commandes prod

```bash
# Build toutes les images (multi-target)
pnpm docker:prod:build

# OU par service
pnpm docker:prod:web
pnpm docker:prod:landing
pnpm docker:prod:feed
pnpm docker:prod:dashboard
pnpm docker:prod:admin
pnpm docker:prod:api
pnpm docker:prod:workers

# Lance en arrière-plan
pnpm docker:prod:up
```

### Monitoring prod

```bash
pnpm docker:prod:ps                          # État des containers
pnpm docker:prod:logs                        # Tous les logs
pnpm docker:prod:logs:web                    # Logs web uniquement
pnpm docker:prod:logs:landing                # Logs landing
pnpm docker:prod:logs:feed                   # Logs feed
pnpm docker:prod:logs:dashboard              # Logs dashboard
pnpm docker:prod:logs:admin                  # Logs admin
pnpm docker:prod:logs:api                    # Logs api
pnpm docker:prod:logs:caddy                  # Logs caddy (SSL)
pnpm docker:prod:logs:workers                # Logs workers
pnpm docker:prod:shell                       # Shell dans un container
pnpm docker:prod:db                          # psql prod
```

### Mise à jour

```bash
pnpm docker:prod:rebuild    # Force recreate + rebuild
```

### Rollback

```bash
# Liste les images
docker images | grep qoefi

# Rollback web par exemple
docker compose up -d --no-deps web:<tag-précédent>
```

---

## 🌐 Déploiement VPS

### Étape 1 : Préparer le VPS

```bash
# Connexion SSH
ssh user@ton-vps-ip

# Mise à jour
sudo apt update && sudo apt upgrade -y

# Installation Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
# Déconnecte-toi/reconnecte-toi pour appliquer le groupe

# Vérification
docker --version
```

### Étape 2 : Cloner le projet

```bash
cd /var/www  # ou /opt, ou /home
git clone https://github.com/ton-user/qoe.fi.git
cd qoe.fi
```

### Étape 3 : Configurer l'env

```bash
cp .env.docker.example .env.docker
nano .env.docker
# Renseigne :
#   POSTGRES_PASSWORD (génère un mdp fort)
#   PRIMARY_DOMAIN=qoe.fi
#   NEXT_PUBLIC_SUPABASE_URL=https://ton-projet.supabase.co
#   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
#   SUPABASE_SERVICE_ROLE_KEY=...
#   STRIPE_SECRET_KEY=sk_live_...
#   STRIPE_WEBHOOK_SECRET=whsec_...
#   RESEND_API_KEY=re_...
```

### Étape 4 : Build + lancer

```bash
pnpm docker:prod:build
pnpm docker:prod:up
pnpm docker:prod:ps  # Vérifier healthy
```

### Étape 5 : Configurer le DNS

Voir section suivante ⬇️

---

## 🌍 DNS et SSL

### Configuration DNS

Chez ton registrar (Cloudflare, OVH, etc.) :

| Type | Nom            | Valeur                    |
| ---- | -------------- | ------------------------- |
| A    | `@` (racine)   | `<IP_VPS>`                |
| A    | `*` (wildcard) | `<IP_VPS>`                |
| AAAA | `@`            | `<IP_V6_VPS>` (optionnel) |
| AAAA | `*`            | `<IP_V6_VPS>` (optionnel) |

### SSL automatique

**Caddy obtient les certificats Let's Encrypt automatiquement** dès que le DNS est propagé et que les ports 80/443 sont ouverts.

```bash
# Vérifier la propagation
nslookup qoe.fi 8.8.8.8
nslookup start.qoe.fi 8.8.8.8

# Si pas résolu : attendre 30 min, vérifier la config DNS
```

### Vérification SSL

```bash
# Tu dois voir "CN = qoe.fi" et un issuer Let's Encrypt
openssl s_client -connect qoe.fi:443 -servername qoe.fi < /dev/null 2>/dev/null | openssl x509 -noout -subject
```

---

## 🗄️ Backups

```bash
# Backup manuel
pnpm docker:backup

# Les backups sont dans /backups/qoe_YYYYMMDD_HHMMSS.sql.gz

# Cron automatique (tous les jours à 3h)
crontab -e
# Ajoute :
0 3 * * * /var/www/qoe.fi/scripts/backup-postgres.sh >> /var/log/qoefi-backup.log 2>&1
```

---

## 🔄 Workflow de mise à jour

```bash
# Sur ton PC
git add .
git commit -m "feat: ..."
git push

# Sur le VPS
cd /var/www/qoe.fi
git pull
pnpm docker:prod:rebuild   # Rebuild + restart
```

---

## 🆘 Troubleshooting

### Port 3000 / 3010 occupé

```bash
# Trouve le process
lsof -i :3000           # Mac/Linux
powershell -Command "Get-NetTCPConnection -LocalPort 3000"  # Windows

# Tue-le OU change le port dans les packages d'apps (ex: apps/feed/package.json)
# "dev": "next dev -p 3010"
```

### Container `migrate` échoue

```bash
# Vérifie que db est healthy
docker compose ps
docker compose logs db

# Souvent : migration en conflit avec la DB actuelle
docker compose logs migrate

# Reset DB (⚠️ PERTE DE DONNÉES en dev)
docker compose down -v
pnpm docker:dev
```

### HMR ne fonctionne pas (Windows/Mac)

Vérifie que `CHOKIDAR_USEPOLLING=true` est dans `.env.docker` (déjà activé par défaut).

### "Caddy ne peut pas obtenir le certificat SSL"

```bash
pnpm docker:prod:logs:caddy
# Cherche "acme" ou "challenge" dans les logs

# Causes possibles :
# 1. DNS pas propagé → attendre
# 2. Port 80/443 bloqué par firewall
# 3. Let's Encrypt rate-limited (max 5 certifs/semaine)
```

### Reset complet

```bash
pnpm docker:dev:reset
# Supprime containers + volumes + relance
```

### "Out of memory" sur le VPS

```bash
# Vérifier la conso
docker stats

# Augmenter la RAM du VPS (recommandé : 4 GB minimum)
# OU limiter les workers
```

---

## 🤔 FAQ

### Pourquoi 2 réseaux isolés ?

- **Sécurité** : la DB n'est pas exposée à internet
- **Performance** : le trafic interne ne pollue pas le réseau public
- **Caddy seul entry point** : tout passe par le reverse proxy

### Pourquoi Caddy et pas nginx ?

- **TLS automatique** : pas de config Let's Encrypt à maintenir
- **Config simple** : 30 lignes de Caddyfile vs 100+ lignes nginx
- **HTTP/3 ready** : par défaut
- **Zero-downtime reload** : rechargement à chaud

### Pourquoi un seul Dockerfile multi-target ?

- **Un seul fichier à maintenir** au lieu de 4
- **Cache partagé** : les stages de base sont réutilisés entre targets
- **CI/CD simplifié** : un seul `docker build` à automatiser

### Pourquoi Redis en plus de Postgres ?

- **BullMQ** : queue de jobs (emails, AI, billing)
- **Cache** : next.js cache, sessions
- **Rate limiting** : protection API
- **Realtime** : pub/sub pour features futures

### Pourquoi pgvector ?

- **Embeddings IA** : recommandation de contenu, recherche sémantique
- **Alternative open-source** à Pinecone/Weaviate
- **Une seule DB** à gérer au lieu de 2

### Source unique Prisma : pourquoi `packages/db/prisma/` ?

- **Co-localisation** : le schema est avec le client qui l'utilise
- **Pas de duplication** : pas de `prisma/` racine à synchroniser
- **Build pipeline** : `prebuild` lance `prisma generate` automatiquement
- **CI/CD friendly** : un seul path à docker-copier

### Pourquoi ne pas avoir mis `prisma generate` dans `postinstall` ?

- **Performance** : `postinstall` ralentit `pnpm install`
- **Cache** : Turbo cache le `prisma generate` séparément
- **Debug** : on voit clairement quand le client est regenéré
