# 🐳 Guide Docker — qoe.fi monorepo

> Documentation complète pour développer et déployer **qoe.fi** (monorepo Turborepo) avec Docker.

---

## 📑 Table des matières

1. [Architecture](#-architecture)
2. [Prérequis](#-prérequis)
3. [Quickstart — Dev local](#-quickstart--dev-local)
4. [Commandes dev](#-commandes-dev)
5. [Production](#-production)
6. [Déploiement sur VPS](#-déploiement-sur-vps)
7. [Troubleshooting](#-troubleshooting)
8. [Architecture réseau](#-architecture-réseau)

---

## 🏗️ Architecture

qoe.fi est un monorepo avec **8 services Docker** :

```
┌─────────────────────────────────────────────────────────────────┐
│                        Internet (ports 80, 443)                  │
└────────────────────────────┬────────────────────────────────────┘
                             ↓
                    ┌────────────────┐
                    │  🌐 caddy     │ (reverse proxy + TLS auto)
                    │  caddy:2      │
                    └────────┬───────┘
                             │
        ┌────────────────────┼─────────────────────┐
        ↓                    ↓                     ↓
   ┌────┴─────┐         ┌────┴─────┐          ┌────┴────┐
   │ 🌐 web  │         │⚛️ console │          │🔌 api  │
   │ Next.js │         │ Next.js   │          │  Hono  │
   │  :3000  │         │  :3000    │          │  :3001 │
   │ (public)│         │ (auth)    │          │(public)│
   └────┬────┘         └────┬──────┘          └────┬────┘
        │                   │                     │
        └───────────────────┼─────────────────────┘
                            │
                  ┌─────────┴──────────┐
                  │  qoefi-private     │ (réseau privé)
                  │                    │
        ┌─────────┼──────────┬─────────┴────┐
        ↓         ↓          ↓              ↓
   ┌────┴───┐ ┌───┴────┐ ┌──┴────┐    ┌─────┴──────┐
   │🐘 db  │ │🔄redis │ │⚙️workers│    │ migrate   │
   │+pgvec │ │cache+q │ │ BullMQ │    │ (one-shot)│
   │ :5432 │ │  :6379 │ │        │    │            │
   └────────┘ └────────┘ └────────┘    └────────────┘
```

### Services

| Service | Image | Port interne | Réseau | Description |
|---------|-------|--------------|--------|-------------|
| **caddy** | caddy:2-alpine | 80, 443 | public | Reverse proxy + TLS auto (Let's Encrypt) |
| **web** | Node 20 (custom) | 3000 | public+private | Next.js : start.qoe.fi + tenants |
| **console** | Node 20 (custom) | 3000 | public+private | Next.js : qoe.fi, dashboard, admin |
| **api** | Node 20 (custom) | 3001 | public+private | Hono backend : api.qoe.fi |
| **workers** | Node 20 (custom) | — | private | BullMQ : emails, AI, billing async |
| **db** | pgvector/pgvector:pg16 | 5432 | private | PostgreSQL + extension vector |
| **redis** | redis:7-alpine | 6379 | private | Cache + queue BullMQ |
| **migrate** | (même image que api) | — | private | One-shot Prisma migrate deploy |

### Domaines

| URL | Service | Description |
|-----|---------|-------------|
| `qoe.fi`, `www.qoe.fi` | console | Home/feed + auth + reader pages |
| `*.qoe.fi` (subdomain) | web | Tenant creator pages (ex: writer.qoe.fi) |
| `dashboard.qoe.fi` | console | Dashboard créateur |
| `admin.qoe.fi` | console | Admin plateforme (superadmin) |
| `start.qoe.fi` | web | Landing marketing |
| `api.qoe.fi` | api | Backend API |
| Custom domain (CNAME) | web | Tenant via custom domain |

---

## ✅ Prérequis

- **Docker Desktop** 4.x+ ([docker.com](https://docker.com))
- **Docker Compose** v2+ (inclus dans Docker Desktop)
- **Git** 2.x+
- **Node 20+** (uniquement pour quelques scripts)

> 💡 Sur Windows, utilise **WSL2** pour de meilleures performances de bind mount.

---

## 🚀 Quickstart — Dev local

```bash
# 1. Cloner
git clone https://github.com/ton-user/qoe.fi.git
cd qoe.fi

# 2. Copier le template d'env
cp .env.docker.example .env.docker
# Édite .env.docker avec tes clés Supabase, Stripe, etc.

# 3. Lancer le stack dev complet
npm run docker:dev

# OU directement :
docker compose -f docker-compose.dev.yml up
```

### URLs accessibles en local

| Service | URL | Notes |
|---------|-----|-------|
| **Console** (qoe.fi, dashboard, admin) | http://localhost:3000 | HMR actif |
| **Web** (start, tenants) | http://localhost:3001 | HMR actif |
| **API** (api.qoe.fi) | http://localhost:3002 | HMR actif |
| **Prisma Studio** (optionnel) | http://localhost:5555 | UI pour explorer la DB |
| **PostgreSQL** | `localhost:5433` | User: qoe, Pass: qoe (ou ce que tu as mis) |
| **Redis** | `localhost:6379` | Pas d'auth en dev |

> ⚠️ En dev local, on n'utilise PAS Caddy (ports 80/443). On accède directement aux containers sur les ports 3000/3001/3002. Caddy n'est utilisé qu'en production.

### Test rapide

```bash
# Logs en direct
npm run docker:dev:logs

# Shell dans le container console
npm run docker:dev:shell

# Connexion psql
npm run docker:dev:db

# Redis CLI
npm run docker:dev:redis
```

---

## 🎮 Commandes dev

| Commande npm | Équivalent Docker | Description |
|--------------|-------------------|-------------|
| `npm run docker:dev` | `docker compose -f docker-compose.dev.yml up` | Lance le stack (foreground) |
| `npm run docker:dev:detached` | `... up -d` | Lance en arrière-plan |
| `npm run docker:dev:build` | `... up --build` | Rebuild les images avant de lancer |
| `npm run docker:dev:logs` | `... logs -f` | Logs en direct |
| `npm run docker:dev:console` | `... logs -f console` | Logs uniquement du container console |
| `npm run docker:dev:web` | `... logs -f web` | Logs uniquement du container web |
| `npm run docker:dev:shell` | `... exec console sh` | Shell dans console |
| `npm run docker:dev:db` | `... exec db psql ...` | psql dans la DB |
| `npm run docker:dev:redis` | `... exec redis redis-cli` | Redis CLI |
| `npm run docker:dev:studio` | `... up prisma-studio` | Lance Prisma Studio (UI web) |
| `npm run docker:dev:down` | `... down` | Arrête les containers (garde les volumes) |
| `npm run docker:dev:reset` | `... down -v && ... up --build` | ⚠️ **Supprime tout** (DB incluse) et rebuild |

---

## 🚢 Production

### Build des images

```bash
# Build toutes les cibles du Dockerfile multi-target
docker build --target web -t qoefi-web:latest .
docker build --target console -t qoefi-console:latest .
docker build --target api -t qoefi-api:latest .
docker build --target workers -t qoefi-workers:latest .
```

**OU** laisse docker-compose le faire :

```bash
# Build + lance tout en arrière-plan
npm run docker:prod
```

### Commandes prod

| Commande | Description |
|----------|-------------|
| `npm run docker:prod` | Build + lance tout (arrière-plan) |
| `npm run docker:prod:down` | Arrête tout |
| `npm run docker:prod:logs` | Logs en direct |
| `npm run docker:prod:logs:console` | Logs de console uniquement |
| `npm run docker:prod:logs:caddy` | Logs Caddy uniquement |
| `npm run docker:prod:ps` | Status des containers |
| `npm run docker:prod:shell` | Shell dans console |
| `npm run docker:prod:db` | psql dans la DB prod |
| `npm run docker:prod:rebuild` | Force rebuild complet (après changement de deps) |
| `npm run docker:prod:web` | Rebuild + redémarre UNIQUEMENT web |
| `npm run docker:prod:console` | Rebuild + redémarre UNIQUEMENT console |
| `npm run docker:prod:api` | Rebuild + redémarre UNIQUEMENT api |

---

## 🌐 Déploiement sur VPS

### Étape 1 : Préparer le VPS

```bash
# Connexion SSH
ssh user@ton-vps-ip

# Installation Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
# Déconnecte-toi/reconnecte-toi pour appliquer le groupe
```

### Étape 2 : Transférer le code

```bash
# Sur ton PC
git push origin main

# Sur le VPS
cd /var/www  # ou où tu veux
git clone https://github.com/ton-user/qoe.fi.git
cd qoe.fi
```

### Étape 3 : Configurer l'environnement

```bash
# Sur le VPS
cp .env.docker.example .env.docker
nano .env.docker  # Édite avec tes VRAIS secrets de prod
```

⚠️ **Critique** : change ces valeurs :
- `POSTGRES_PASSWORD` : `openssl rand -base64 32`
- `STRIPE_SECRET_KEY` : `sk_live_...` (pas sk_test)
- `SUPABASE_*` : clés du projet prod
- `RESEND_API_KEY` : clé API Resend
- `NEXT_PUBLIC_APP_URL=https://qoe.fi` (ton vrai domaine)
- `PRIMARY_DOMAIN=qoe.fi` (sans protocole)

### Étape 4 : Configurer le DNS

Dans ton registrar (OVH, Cloudflare, etc.) :

| Type | Host | Value |
|------|------|-------|
| A | @ | IP_DE_TON_VPS |
| A | www | IP_DE_TON_VPS |
| A | * | IP_DE_TON_VPS (wildcard) |
| A | start | IP_DE_TON_VPS |
| A | dashboard | IP_DE_TON_VPS |
| A | admin | IP_DE_TON_VPS |
| A | api | IP_DE_TON_VPS |

> ⏱️ La propagation DNS peut prendre 5-30 min (ou 48h max).

### Étape 5 : Lancer en prod

```bash
# Build + démarre en arrière-plan
npm run docker:prod

# Vérifier que tout tourne
npm run docker:prod:ps
```

### Étape 6 : Tester

```bash
# Depuis ton PC
curl -I https://qoe.fi
curl -I https://dashboard.qoe.fi
curl -I https://start.qoe.fi
curl -I https://api.qoe.fi/health
```

Si tout va bien :
- ✅ Caddy a obtenu les certifs Let's Encrypt
- ✅ Chaque sous-domaine répond
- ✅ HTTP redirige vers HTTPS
- ✅ `/api.qoe.fi/health` retourne `{"status":"ok"}`

### Étape 7 : Backups automatiques

```bash
# Sur le VPS, ajouter une ligne au cron
crontab -e

# Backup tous les jours à 3h du matin
0 3 * * * /var/www/qoe.fi/scripts/backup-postgres.sh >> /var/log/qoefi-backup.log 2>&1
```

### Mises à jour futures

```bash
# Sur ton PC
git push

# Sur le VPS
cd /var/www/qoe.fi
git pull
npm run docker:prod:rebuild
```

---

## 🆘 Troubleshooting

### "Port 3000 is already in use"

```bash
# Trouve le process qui occupe le port
lsof -i :3000  # Mac/Linux
netstat -ano | findstr :3000  # Windows

# Tue-le OU change le port dans docker-compose.dev.yml
```

### "Cannot connect to database"

```bash
# Vérifie que db est healthy
npm run docker:dev:ps

# Logs db
docker compose -f docker-compose.dev.yml logs db
```

### HMR ne fonctionne pas (Windows/Mac)

Les volumes partagés ne notifient pas Docker. Solution : polling (déjà activé par défaut dans docker-compose.dev.yml) :
```yaml
environment:
  CHOKIDAR_USEPOLLING: "true"
  WATCHPACK_POLLING: "true"
```

### "Caddy ne peut pas obtenir le certificat SSL"

1. Vérifie DNS : `nslookup qoe.fi` doit pointer sur ton VPS
2. Ports 80/443 ouverts (pas de firewall)
3. Let's Encrypt pas rate-limité (max 5 certifs/semaine par domaine)
4. Logs : `docker compose logs caddy`

### "Connection refused" sur la DB après reset

```bash
# Reset complet
npm run docker:dev:reset
```

### "Out of memory" sur le VPS

Ajuste les `deploy.resources.limits` dans `docker-compose.yml` selon la RAM de ton VPS. Règle : allouer max 70% de la RAM totale.

---

## 🛡️ Architecture réseau (sécurité)

### Deux réseaux isolés

| Réseau | Services | Accès Internet |
|--------|----------|----------------|
| **qoefi-public** | caddy, web, console, api | ✅ (via Caddy) |
| **qoefi-private** | db, redis, workers, migrate | ❌ (interne uniquement) |

**Conséquence** : impossible d'accéder à la DB ou Redis depuis l'extérieur, même si un service web est compromis.

### Reverse proxy seul exposé

Seul **Caddy** expose des ports sur Internet (80, 443). Les autres services sont sur `expose:` (port interne Docker uniquement, pas publié sur l'host).

### Caddy = seul entry point

Toute requête passe par Caddy. Pas de port direct vers les apps. Tu peux :
- Rate-limit par IP
- Bloquer les bots
- Logger centralisé
- WAF (via Cloudflare devant)

---

## 📚 Concepts expliqués

### Pourquoi 2 réseaux ?

Pour limiter la surface d'attaque. Si un attaquant trouve une faille dans une app Next.js, il **ne peut pas** se connecter directement à la DB. Il devrait d'abord compromettre Caddy, ce qui est BEAUCOUP plus dur.

### Pourquoi Caddy et pas nginx ?

- HTTPS **automatique** (zéro config, vs 30 lignes nginx)
- Renewal **automatique** des certifs
- Config **10× plus simple**
- Performance équivalente

### Pourquoi un seul Dockerfile multi-target ?

- **Cache partagé** : un seul `pnpm install` pour toutes les apps
- **Build plus rapide** : pas de duplication des deps
- **Cohérence** : impossible d'avoir des versions différentes de Node entre les apps

### Pourquoi Redis en plus de Postgres ?

- **Cache** : invalidation rapide (pattern `cache.get(key)` au lieu de query DB)
- **Queue** : BullMQ pour les jobs async (emails, AI, webhooks)
- **Session** : peut stocker des sessions éphémères
- **Rate limiting** : compteurs rapides

Si demain tu n'as plus besoin de Redis (faible traffic), tu peux le supprimer. Pour l'instant, on l'inclut par défaut.

---

## 🆘 Besoin d'aide ?

Si tu bloques :
1. Check les logs : `npm run docker:prod:logs`
2. Check le status : `npm run docker:prod:ps`
3. Lis le [DOCKER.md original](#) (cette doc) 😅

Et n'hésite pas à demander de l'aide ! 🐳✨
