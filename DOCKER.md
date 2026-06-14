# 🐳 Guide Docker — qoe.fi

> Documentation complète pour développer et déployer **qoe.fi** avec Docker.

---

## 📑 Table des matières

1. [Prérequis](#-prérequis)
2. [Quickstart — Dev local](#-quickstart--dev-local)
3. [Architecture](#-architecture)
4. [Commandes utiles](#-commandes-utiles)
5. [Déploiement sur VPS](#-déploiement-sur-vps)
6. [Troubleshooting](#-troubleshooting)
7. [Concepts expliqués](#-concepts-expliqués)

---

## ✅ Prérequis

Avant de commencer, installe sur ta machine :

| Outil | Version min | Vérification | Pourquoi |
|-------|-------------|--------------|----------|
| **Docker Desktop** | 4.x+ | `docker --version` | Exécute les containers |
| **Docker Compose** | v2+ (inclus dans Docker Desktop) | `docker compose version` | Orchestre les services |
| **Git** | 2.x+ | `git --version` | Versionning (déjà installé si t'es là) |
| **Node** | 20+ | `node --version` | Uniquement pour Prisma Studio en local (optionnel) |

> 💡 **Astuce Windows** : Si tu utilises Git Bash ou WSL2 pour les scripts `.sh`, tout fonctionnera out-of-the-box.

---

## 🚀 Quickstart — Dev local

> 🎯 En moins de 5 minutes, tu auras qoe.fi qui tourne avec une vraie base de données PostgreSQL + pgvector.

### Étape 1 : Copier le fichier d'environnement

```bash
cp .env.docker.example .env.docker
```

👉 Édite `.env.docker` et remplis les **vraies valeurs** de Supabase (URL, anon key, service role key). Récupère-les dans ton dashboard Supabase → Project Settings → API.

> ⚠️ **NE COMMIT JAMAIS `.env.docker`** — il est déjà dans `.gitignore` (cf. `.dockerignore` + `.gitignore`).

### Étape 2 : Lancer le stack dev

```bash
# Option A : via npm (plus simple)
npm run docker:dev

# Option B : directement avec docker compose
docker compose -f docker-compose.dev.yml up
```

Au premier lancement, Docker va :
1. 📦 Télécharger les images (Postgres, Node) — ~500 MB, prend 1-2 min
2. 🔨 Construire l'image de l'app — 1-3 min la première fois
3. 🚀 Démarrer Postgres → attendre qu'il soit healthy
4. 🔄 Appliquer les migrations Prisma automatiquement
5. ⚛️ Démarrer Next.js avec hot-reload

### Étape 3 : Accéder à l'app

| Service | URL | Notes |
|---------|-----|-------|
| **App Next.js** | http://localhost:3000 | Hot-reload activé ! |
| **PostgreSQL** | `localhost:5433` | User: `qoe`, Pass: `qoe` (ou ce que tu as mis) |
| **Prisma Studio** (optionnel) | http://localhost:5555 | Voir les données de la DB |

> 💡 **Tu peux maintenant modifier n'importe quel fichier dans `src/`** → la page se rafraîchit automatiquement dans le navigateur ! C'est le **hot-reload** 🎉

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────┐
│  🐳 docker-compose.dev.yml                              │
│                                                           │
│  ┌─────────────┐    ┌──────────────┐    ┌────────────┐  │
│  │   db        │    │  migrate     │    │   app      │  │
│  │ Postgres 16 │◀───│  (one-shot)  │◀───│ Next.js 16 │  │
│  │ + pgvector  │    │ Prisma       │    │  + HMR ✅  │  │
│  │ :5432       │    │              │    │  :3000     │  │
│  └─────────────┘    └──────────────┘    └────────────┘  │
│         ▲                    ▲                  ▲         │
│         └────── réseau qoefi-dev-net ──────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### Les 3 services

| Service | Rôle | Tourne en continu ? | Ports |
|---------|------|----------------------|-------|
| `db` | PostgreSQL 16 + extension pgvector | ✅ Oui (volume persistant) | 5433 (externe) |
| `migrate` | Applique les migrations Prisma | ❌ Une seule fois au démarrage | Aucun |
| `app` | L'application Next.js | ✅ Oui (avec hot-reload) | 3000 |

### Ordre de démarrage (dépendances)

```
db (healthy)  →  migrate (completed)  →  app (healthy)
```

Docker Compose attend automatiquement que chaque service soit prêt grâce à `depends_on` + `healthcheck`. **C'est la magie** : tu n'as rien à gérer manuellement.

---

## 🎮 Commandes utiles

> 📋 **Raccourcis npm** disponibles dans `package.json` (section "scripts")

### Développement

| Commande npm | Équivalent Docker | Description |
|--------------|-------------------|-------------|
| `npm run docker:dev` | `docker compose -f docker-compose.dev.yml up` | Lance le stack en avant-plan (logs visibles) |
| `npm run docker:dev:detached` | `... up -d` | Lance en arrière-plan (libère le terminal) |
| `npm run docker:dev:logs` | `... logs -f` | Suit les logs en direct |
| `npm run docker:dev:shell` | `... exec app sh` | Ouvre un shell dans le container de l'app |
| `npm run docker:dev:db` | `... exec db psql ...` | Ouvre psql pour jouer avec la DB |
| `npm run docker:dev:down` | `... down` | Arrête et supprime les containers (garde les volumes) |
| `npm run docker:dev:reset` | `... down -v && ... up --build` | ⚠️ Supprime TOUT (DB incluse) et rebuild |

### Base de données

| Commande | Description |
|----------|-------------|
| `npm run docker:seed` | Applique migrations + seed (via `scripts/seed-docker.sh`) |
| `npm run docker:seed:reset` | ⚠️ Reset complet de la DB + seed |
| `npm run docker:wait-db` | Attend que Postgres soit ready (utile en CI/CD) |
| `npm run prisma:studio` | Ouvre Prisma Studio (UI web pour la DB) |

### Production (VPS)

| Commande | Description |
|----------|-------------|
| `npm run docker:prod` | Build + lance en prod (avec Caddy) |
| `npm run docker:prod:down` | Arrête la prod |
| `npm run docker:prod:logs` | Logs en direct |
| `npm run docker:prod:rebuild` | Force le rebuild complet (après un changement de deps) |

---

## 🌐 Déploiement sur VPS

> 🎯 Guide pas-à-pas pour mettre qoe.fi en production sur ton VPS.

### Prérequis côté VPS

```bash
# Connecte-toi en SSH à ton VPS
ssh user@ton-vps-ip

# Installe Docker + Compose (si pas déjà fait)
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
# Déconnecte-toi/reconnecte-toi pour appliquer le groupe

# Vérifie
docker --version
docker compose version
```

### Étape 1 : Transférer le code

**Option A : avec Git** (recommandé)
```bash
# Sur ton PC
git push origin main

# Sur le VPS
cd /var/www  # ou où tu veux
git clone https://github.com/ton-user/qoe.fi.git
cd qoe.fi
```

**Option B : avec SCP** (si pas de Git)
```bash
# Sur ton PC
scp -r ./qoe.fi user@ton-vps-ip:/var/www/
```

### Étape 2 : Configurer l'environnement prod

```bash
# Sur le VPS
cd /var/www/qoe.fi
cp .env.docker.example .env.docker
nano .env.docker  # édite avec tes VRAIS secrets de prod !
```

⚠️ **Critique** : change ces valeurs pour la prod :
- `POSTGRES_PASSWORD` → un vrai mot de passe fort : `openssl rand -base64 32`
- `NEXTAUTH_SECRET` → `openssl rand -base64 32`
- `STRIPE_SECRET_KEY` → ta clé live (sk_live_...)
- `NEXT_PUBLIC_APP_URL` → `https://qoe.fi` (ton vrai domaine)
- `SUPABASE_*` → les clés de ton projet prod (pas staging)

### Étape 3 : Configurer le DNS

Dans ton registrar (OVH, Cloudflare, etc.) :
```
Type: A
Host: @
Value: IP_DE_TON_VPS
TTL: 3600

Type: A
Host: www
Value: IP_DE_TON_VPS
TTL: 3600
```

> ⏱️ La propagation DNS peut prendre jusqu'à 48h (souvent 5-30 min).

### Étape 4 : Configurer Caddy

Édite [`docker/caddy/Caddyfile`](docker/caddy/Caddyfile:7) et remplace `qoe.fi` par ton vrai domaine :

```bash
nano docker/caddy/Caddyfile
# Remplace toutes les occurrences de "qoe.fi" par ton domaine
```

### Étape 5 : Lancer en prod

```bash
# Build + démarre en arrière-plan
npm run docker:prod

# Ou directement :
docker compose --profile prod up -d --build
```

### Étape 6 : Vérifier

```bash
# Logs en temps réel
docker compose logs -f

# Status des containers
docker compose ps

# Tester depuis ton PC
curl -I https://qoe.fi
```

Si tout va bien, tu devrais voir :
- ✅ Caddy a obtenu un certificat SSL
- ✅ L'app répond sur https://qoe.fi
- ✅ HTTP redirige automatiquement vers HTTPS

### Mises à jour futures

```bash
# Sur ton PC
git push

# Sur le VPS
cd /var/www/qoe.fi
git pull
npm run docker:prod:rebuild
```

C'est tout ! 🎉

---

## 🆘 Troubleshooting

### ❌ "Port 3000 is already in use"

Tu as une autre app sur le port 3000. Change dans `docker-compose.dev.yml` :
```yaml
ports:
  - "3001:3000"  # utilise 3001 à la place
```

### ❌ "Cannot connect to database"

La DB n'est pas encore prête. Attends 30 secondes, ou vérifie :
```bash
npm run docker:dev:db  # essaie de te connecter
```

### ❌ "Hot-reload ne fonctionne pas" (Windows/Mac)

Vérifie que les variables d'env sont bien dans `docker-compose.dev.yml` :
```yaml
CHOKIDAR_USEPOLLING: "true"
WATCHPACK_POLLING: "true"
```

### ❌ "prisma generate failed"

Souvent dû à un problème de connexion. Force le rebuild :
```bash
npm run docker:dev:reset
```

### ❌ Caddy ne peut pas obtenir le certificat SSL

Vérifie que :
1. Le DNS pointe bien vers l'IP de ton VPS (`nslookup qoe.fi`)
2. Les ports 80 et 443 sont ouverts (pas de firewall, pas d'autre service dessus)
3. Let's Encrypt n'est pas rate-limité (max 5 certifs/semaine par domaine)

### ❌ "permission denied" sur les scripts .sh

Sous Windows, les permissions ne s'appliquent pas. Les scripts marcheront quand même via `bash ./scripts/wait-for-db.sh` ou les raccourcis npm (`npm run docker:wait-db`).

---

## 📖 Concepts expliqués

> 🎓 Pour les débutants qui veulent comprendre ce qu'ils font

### C'est quoi Docker ?

Imagine une **boîte hermétique** qui contient ton app + tout ce dont elle a besoin (Node, dépendances, config). Cette boîte peut tourner **pareil** sur ton PC, sur ton VPS, ou chez un autre développeur. Plus de "ça marche chez moi" !

### C'est quoi Docker Compose ?

Un fichier YAML qui décrit **plusieurs boîtes** qui collaborent. Ici on en a 3 : la DB, les migrations, l'app. Docker Compose les démarre dans le bon ordre.

### C'est quoi un Volume ?

Un **disque dur virtuel** géré par Docker. Les données de ta DB sont dans un volume nommé (`qoefi-postgres-data`) : elles survivent aux `docker compose down` et aux reboots.

### C'est quoi un Bind Mount ?

Un **miroir** entre un dossier de ton PC et un dossier dans le container. C'est ça qui permet le hot-reload : tu modifies un fichier sur ton PC → le container le voit immédiatement.

### C'est quoi un Healthcheck ?

Une commande que Docker lance régulièrement pour vérifier qu'un service est "vivant". Tant qu'il n'est pas healthy, les autres services qui dépendent de lui ne démarrent pas.

### C'est quoi un "multi-stage build" ?

Une technique Dockerfile où on **construit dans une image, mais on publie une autre image** (plus légère). Le `Dockerfile` de qoe.fi utilise 4 stages : base → deps → builder → runner. L'image finale ne contient que le strict minimum.

### C'est quoi Caddy ?

Un serveur web moderne qui :
- Sert de **reverse proxy** (redirige les requêtes vers ton app)
- Gère **automatiquement HTTPS** avec Let's Encrypt (zéro config !)
- Renouvelle les certificats tout seul (1 mois avant expiration)

C'est 10x plus simple que nginx. 🚀

---

## 📞 Besoin d'aide ?

Si tu bloques, voici les logs à checker en priorité :
```bash
npm run docker:dev:logs    # logs en direct
docker compose ps          # status des containers
```

Et n'hésite pas à me demander ! 🐳✨
