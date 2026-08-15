# 🚀 Guide d'activation — qoe.fi monorepo (état post-découplage)

> **La plateforme : 5 applications Next.js indépendantes + un backend Go (`apps/api-go`).**
> L'API Hono legacy (`apps/api`) reste en transition (API créateurs/médias — voir `SUNSET_API_LEGACY.md`).
> Ce guide explique comment démarrer et gérer le développement après cette refactorisation majeure.

---

## ✅ Pré-requis

```bash
# 1. Installer pnpm 11+
npm install -g pnpm

# 2. Vérifier la version
pnpm --version
# Doit afficher 11.21.0 ou plus récent
```

**Autres prérequis** :

- Node.js 20+ (`node -v`)
- Docker Desktop (pour la stack dev complète)
- Git

---

## 🎯 Démarrage en 4 étapes

```bash
# 1. Installer toutes les dépendances du monorepo (21 workspaces résolus)
pnpm install

# 2. Générer le client Prisma (depuis packages/db/prisma/schema.prisma)
pnpm prisma:generate

# 3. Copier le template d'env
cp .env.docker.example .env
# Édite .env avec tes clés Supabase, Stripe, etc.

# 4. Lancer la stack dev complète avec Docker
pnpm docker:dev
# → Postgres + pgvector + Redis + landing + feed + dashboard + admin + web + api avec HMR
# → Feed (Lecteur & Auth):  http://localhost:4000  (interne: 3010)
# → Web (Blogs créateurs):   http://localhost:4001  (interne: 3000)
# → Dashboard (Studio):      http://localhost:4020  (interne: 3020)
# → Admin (Platform):        http://localhost:4030  (interne: 3030)
# → Landing (Vitrines/CMS):  http://localhost:4040  (interne: 3040)
# → API Hono (legacy, transition): http://localhost:4002/health (interne: 3002)
#   Backend de référence : apps/api-go (Go) — voir SUNSET_API_LEGACY.md
```

**C'est tout.** En 5 minutes tu as le stack complet qui tourne.

---

## 🛠️ Commandes quotidiennes

### Développement Local Hybride (Recommandé)

Le mode hybride lance les bases de données dans Docker et exécute les serveurs Next.js localement sur ton hôte (le backend de référence est Go : `apps/api-go`) pour des performances maximales et un Hot-Reload ultra-rapide.

```bash
# Lancer uniquement la DB et Redis dans Docker
docker compose -f docker-compose.dev.yml up -d db redis

# Tout lancer sur l'hôte en parallèle (Turbo orchestre)
pnpm dev
# → @qoe/feed (Flux & Connexion) sur :3010
# → @qoe/web (Blogs des créateurs) sur :3001
# → @qoe/dashboard (Studio d'écriture) sur :3020
# → @qoe/admin (Pilotage superadmin) sur :3030
# → @qoe/landing (Vitrine & Textes légaux) sur :3040
# → @qoe/api (Hono legacy, transition) sur :3002
```

### Commandes par application

```bash
pnpm --filter @qoe/landing dev      # Uniquement la landing page
pnpm --filter @qoe/feed dev         # Uniquement le flux lecteur
pnpm --filter @qoe/dashboard dev    # Uniquement l'espace créateur
pnpm --filter @qoe/admin dev        # Uniquement l'espace administrateur
pnpm --filter @qoe/web dev          # Uniquement le moteur multi-tenant des blogs
pnpm --filter @qoe/api dev          # API Hono legacy (transition)
# Backend de référence (Go) : cd apps/api-go && go run ./cmd/server
```

### Qualité & Build global

```bash
# Build toutes les applications et packages
pnpm build
# → 6/6 successful (api, landing, feed, dashboard, admin, web) en ~45s
# → < 1s en cache hit (grâce au cache intelligent de Turborepo)

# Lancer la vérification des types TypeScript sur tout le projet
pnpm typecheck

# Lancer le linter ESLint sur tout le projet
pnpm lint

# Lancer les tests unitaires
pnpm test
pnpm test:ui # Lance l'interface interactive de Vitest

# Lancer le seed Prisma (idempotent)
pnpm prisma:seed
```

### Docker

```bash
pnpm docker:dev          # Lance l'ensemble de la stack en local
pnpm docker:dev:down     # Arrête et supprime les conteneurs
pnpm docker:dev:reset    # ⚠️ Réinitialisation complète (supprime les bases de données)
pnpm docker:dev:logs     # Affiche les logs en direct de tous les services
pnpm docker:dev:db       # Connexion interactive psql dans le conteneur DB
pnpm docker:dev:redis    # Connexion interactive redis-cli dans le conteneur Redis
pnpm docker:dev:studio   # Lance Prisma Studio via Docker
```

---

## 🏗️ Architecture finale du monorepo

```
qoe.fi/                              # 21 workspaces résolus
├── apps/                            # 6 services / applications indépendantes
│   ├── landing/                     # Next.js 16 — start.qoe.fi (vitrine, textes légaux, CMS)
│   ├── feed/                        # Next.js 16 — qoe.fi (flux lecteurs & SSO centralisé)
│   ├── dashboard/                   # Next.js 16 — dashboard.qoe.fi (studio créateur & TipTap)
│   ├── admin/                       # Next.js 16 — admin.qoe.fi (superadmin & CMS config)
│   ├── web/                         # Next.js 16 — *.qoe.fi & domaines customs (blogs créateurs)
│   └── api/                         # Hono legacy (transition, API créateurs/médias)
├── packages/                        # 14 packages partagés
│   ├── db/                          # 🐘 Prisma Singleton (Source unique de vérité DB)
│   ├── auth/                        # 🔐 Rôles, permissions et helpers session
│   ├── ui/                          # 🎨 Design System & composants partagés
│   ├── theme/                       # 🎨 Design tokens CSS multi-apps (source unique)
│   ├── supabase/                    # 🔌 Clients d'authentification SSR
│   ├── i18n/                        # 🌐 Helpers de traduction Lingui
│   ├── analytics/                   # 📊 Événements et tracking
│   ├── api-client/                  # 🔄 Couche de données TanStack Query + actions
│   ├── billing/                     # 💳 Logique Stripe abonnements
│   ├── config/                      # ⚙️ Validation des variables d'environnement (Zod)
│   ├── observability/               # 🔭 Logs structurés + Sentry centralisé
│   ├── flags/                       # 🚩 Feature flags GrowthBook (client + serveur)
│   ├── utils/                       # 🔧 Fonctions utilitaires communes
│   └── tsconfig/                    # 📐 Configurations TypeScript partagées
├── workers/                         # BullMQ (queues de tâches asynchrones — actif)
├── docker/                          # Configuration Caddy (Reverse Proxy), Postgres et Redis
└── prisma.config.ts                 # Redirige le CLI Prisma racine vers le package db
```

### Planification des sous-domaines (DNS Wildcard)

| Sous-domaine          | Application Next.js | Rôle                                                         |
| --------------------- | ------------------- | ------------------------------------------------------------ |
| `qoe.fi`              | `apps/feed`         | Portail d'accueil, flux de lecture et connexion unique (SSO) |
| `dashboard.qoe.fi`    | `apps/dashboard`    | Studio d'écriture et de publication des créateurs            |
| `admin.qoe.fi`        | `apps/admin`        | Panel de modération de la plateforme et édition du CMS       |
| `start.qoe.fi`        | `apps/landing`      | Vitrine commerciale, mentions légales et CGU de la marque    |
| `*.qoe.fi` (wildcard) | `apps/web`          | Moteur multi-tenant servant les blogs publics des créateurs  |
| `api.qoe.fi`          | `apps/api`          | Backend Hono (endpoints à haute performance)                 |

---

## 📂 Source unique de vérité : `packages/db/prisma/`

Toutes les interactions avec la base de données (schéma, migrations, scripts de seed) s'effectuent au sein du package `@qoe/db` pour éviter tout drift technique.

```ts
// ✅ À importer depuis n'importe quelle application du monorepo
import { prisma } from '@qoe/db/client';
import type { User, Post } from '@qoe/db/types';
```

Le dossier `prisma/` racine a été totalement nettoyé.

---

## 🎨 Composants UI partagés : `packages/ui/`

Le package `@qoe/ui` centralise le design system de qoe.fi. Les composants communs à haute valeur ajoutée y sont logés :

- `SocialIcon` : Icônes sociales pour les créateurs.
- `TenantHeader` : En-tête dynamique du blog des créateurs.
- `SubscribeForm` : Formulaire d'abonnement universel connecté à Stripe.

```tsx
// ✅ Importable dans n'importe quelle application
import { TenantHeader, SubscribeForm } from '@qoe/ui';
```

---

## 🔌 Authentification Unique (SSO Subdomains)

Toutes les applications partagent la session grâce au package `@qoe/supabase`.
Les cookies d'authentification sont configurés sur le domaine parent `.qoe.fi`, ce qui garantit qu'une authentification réussie sur `qoe.fi/login` ouvre automatiquement la session sur `dashboard.qoe.fi`, `admin.qoe.fi` et sur les blogs `*.qoe.fi`.

---

## 🐛 Guide de dépannage (Troubleshooting)

### Port occupé lors du démarrage

Si un message vous indique qu'un port est occupé en local (ex: `3010`), vous pouvez identifier le processus en cours et l'arrêter :

```powershell
# Sur Windows (PowerShell)
Get-NetTCPConnection -LocalPort 3010 | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }
```

### Erreur TypeScript "Module @prisma/client has no exported member"

Le client Prisma doit être régénéré suite à une installation ou une mise à jour de schéma :

```bash
pnpm prisma:generate
```

### Erreurs de droits ou EACCES sur Windows

Sous Windows, Next.js ou pnpm peuvent parfois rencontrer des blocages d'accès réseau local (Windows Defender). Si cela arrive, exécutez votre terminal en mode administrateur ou lancez le projet dans WSL2 (Ubuntu).

---

## 🎉 Le projet est prêt pour le développement !

L'architecture est propre, découpée de manière étanche, performante et documentée. Tu as désormais toutes les clés en main pour bâtir des fonctionnalités d'élite sur qoe.fi ! 🏆
