# qoe.fi

> **A sophisticated Substack-like platform for modern creators — built as a scalable Turborepo monorepo.**
>
> Multi-tenant, GDPR-first, avec facturation Stripe, IA d'embedding pgvector, workers BullMQ, et 14 packages workspace.

[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)](https://www.typescriptlang.org)
[![pnpm](https://img.shields.io/badge/pnpm-workspace-orange)](https://pnpm.io)
[![Turborepo](https://img.shields.io/badge/Turborepo-2.x-red)](https://turbo.build)
[![Docker](https://img.shields.io/badge/Docker-ready-blue)](https://www.docker.com)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748)](https://www.prisma.io)
[![Supabase](https://img.shields.io/badge/Supabase-Cloud-3ECF8E)](https://supabase.com)

---

## 🏗️ Architecture

```
qoe.fi/                              # Monorepo Turborepo
├── apps/
│   ├── landing/                     # Next.js 16 — start.qoe.fi (vitrine, légal, CMS SystemConfig)
│   ├── feed/                        # Next.js 16 — qoe.fi (feed lecteur + auth centralisé)
│   ├── dashboard/                   # Next.js 16 — dashboard.qoe.fi (studio créateur)
│   ├── admin/                       # Next.js 16 — admin.qoe.fi (superadmin, modération)
│   ├── web/                         # Next.js 16 — *.qoe.fi & domaines customs (blogs créateurs)
│   └── api/                         # Hono backend (health, future)
├── packages/                        # 11 packages partagés
│   ├── db/                          # 🐘 Prisma client + repos (SOURCE UNIQUE: prisma/)
│   ├── auth/                        # 🔐 Roles, permissions, current-user
│   ├── ui/                          # 🎨 Tokens + composants partagés
│   ├── theme/                       # 🎨 Design tokens multi-apps (light/dark + accents)
│   ├── supabase/                    # 🔌 3 clients (browser/server/middleware)
│   ├── i18n/                        # 🌐 Tolgee helpers
│   ├── analytics/                   # 📊 Events tracking
│   ├── billing/                     # 💳 Stripe (client, plans, webhooks)
│   ├── config/                      # ⚙️ Env Zod, constantes, feature flags
│   ├── utils/                       # 🔧 cn, format, slugify, validation
│   └── tsconfig/                    # 📐 4 tsconfig partagés
├── workers/                         # BullMQ (emails, AI, billing — actif)
├── docker/                          # Caddy, Postgres, Redis
├── messages/                        # i18n locales
├── scripts/                         # deploy, seed, backup, dedupe
├── prisma.config.ts                 # Pointe vers packages/db/prisma/
└── HANDOFF.md                       # Passation projet (post-refacto)
```

### 🌐 Domain mapping

| Subdomain | App | Usage |
|-----------|-----|-------|
| `qoe.fi` | feed | Home / feed reader / auth centralisé |
| `dashboard.qoe.fi` | dashboard | Workspace et studio créateur |
| `admin.qoe.fi` | admin | Panel superadmin et modération |
| `start.qoe.fi` | landing | Site vitrine, mentions légales et CMS |
| `*.qoe.fi` | web | Blogs publics des créateurs (multi-tenant) |
| `api.qoe.fi` | api | Hono backend (future) |

Pour le dev Windows des blogs créateurs, préfère `*.lvh.me` pour les sous-domaines dynamiques (`monsieur.lvh.me`) car `*.qoe.test` ne peut pas être résolu en wildcard sans DNS local dédié.

---

## ⚡ Quick start (5 minutes)

### 1. Prérequis
- Node.js 20+
- pnpm 9.15+ (`npm install -g pnpm`)
- Docker Desktop (pour Postgres + Redis)
- Caddy local ou Docker Desktop pour le fallback automatique de `pnpm dev:win`

### 2. Installation
```bash
# Clone + install
git clone https://github.com/your-user/qoe.fi.git
cd qoe.fi
pnpm install   # ~1 min, 14 workspaces

# Setup env
cp .env.docker.example .env
# Édite .env avec tes clés Supabase, Stripe, etc.
```

### 3. Démarrage
```bash
# Option A : Stack complet avec Docker
pnpm docker:dev
# → Postgres + pgvector + Redis + landing + feed + dashboard + admin + web + api avec HMR
# → Feed (Reader):    http://localhost:4000 (interne: 3010)
# → Web (Creator Blogs): http://localhost:4001 (interne: 3000)
# → Dashboard (Studio): http://localhost:4020 (interne: 3020)
# → Admin (Platform):  http://localhost:4030 (interne: 3030)
# → Landing (Marketing): http://localhost:4040 (interne: 3040)
# → API:               http://localhost:4002/health

# Option B : Dev local hybride (recommandé, DB externe/Docker + node host)
pnpm dev:win   # Windows : démarre Caddy + DB/Redis + Turbo dev
pnpm prisma:generate
pnpm dev   # Turbo lance les 6 apps en parallèle
# → Feed (Reader):    http://localhost:3010
# → Web (Blogs):      http://localhost:3001
# → Dashboard (Studio): http://localhost:3020
# → Admin (Platform):  http://localhost:3030
# → Landing (Marketing): http://localhost:3040
# → API:               http://localhost:3002/health
```

### 4. Prisma Studio (optionnel)
```bash
pnpm prisma:studio  # → http://localhost:5555
```

---

## 📚 Stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16, React 19, Turbopack |
| Styling | Tailwind 4, shadcn/ui, Base UI |
| i18n | Tolgee 7 |
| Editor | TipTap (PaywallDivider custom) |
| Forms | React Hook Form, Zod |
| Backend | Hono (apps/api) |
| Database | PostgreSQL 16 + pgvector |
| ORM | Prisma 6 |
| Auth | Supabase (Cloud) + 3 SSR clients |
| Storage | Supabase Storage (CDN) |
| Billing | Stripe (subscriptions) |
| Queue | BullMQ + Redis 7 |
| AI | OpenAI (embeddings) via pgvector |
| Email | Resend |
| Package manager | pnpm 9.15 workspaces |
| Build | Turborepo 2.9 |
| Container | Docker + Docker Compose |
| Reverse proxy | Caddy 2 (auto-HTTPS) |
| TypeScript | 5.9 (strict) |
| Lint | ESLint 9 |
| Tests | Vitest |

---

## 🛠️ Commandes essentielles

### Développement
```bash
pnpm install              # Install all workspaces
pnpm prisma:generate      # Generate Prisma client
pnpm dev                  # Lance les 6 apps/services en parallèle
pnpm build                # Build tout (api, landing, feed, dashboard, admin, web)
pnpm typecheck            # Typecheck tout
pnpm lint                 # ESLint tout
```

### Par app
```bash
pnpm --filter @qoe/landing dev      # Landing uniquement
pnpm --filter @qoe/feed dev         # Feed uniquement
pnpm --filter @qoe/dashboard dev    # Creator Dashboard uniquement
pnpm --filter @qoe/admin dev        # Superadmin uniquement
pnpm --filter @qoe/web dev          # Web (blogs créateurs) uniquement
pnpm --filter @qoe/api dev          # API uniquement
```

### Docker
```bash
pnpm docker:dev            # Stack dev (Postgres + Redis + 5 Next.js apps + API)
pnpm docker:dev:down      # Stop + remove containers
pnpm docker:dev:reset     # ⚠️ Reset complet (supprime les data)
pnpm docker:dev:logs      # Logs en direct
pnpm docker:dev:db        # psql dans le container
pnpm docker:dev:redis     # redis-cli dans le container
```

### Production
```bash
pnpm docker:prod:build    # Build toutes les images
pnpm docker:prod:up       # Lance en arrière-plan
pnpm docker:prod:logs     # Logs en direct
pnpm docker:prod:down     # Stop
pnpm docker:seed          # Seed la DB (idempotent)
pnpm docker:backup        # Backup Postgres (cron-ready)
pnpm docker:deploy        # Deploy complet sur VPS
```

### Prisma
```bash
pnpm prisma:migrate       # dev: crée + applique une migration
pnpm prisma:generate      # regen le client
pnpm prisma:studio        # GUI Prisma Studio
pnpm prisma:format        # Formate schema.prisma
pnpm prisma:seed          # Exécute prisma/seed.ts (idempotent)
```

> 📖 **Source unique Prisma** : `packages/db/prisma/`
> - `schema.prisma`, `migrations/`, `seed.ts` sont **tous** là
> - Le dossier `prisma/` racine a été supprimé (voir commit `eaddd0b`)

---

## 🏗️ Décisions d'architecture clés

### 1. Monorepo Turborepo
- **6 apps/services** indépendants (5 Next.js + 1 Hono API) → scale horizontal par app
- **11 packages** partagés → code DRY, type-safety bout-en-bout
- **Cache Turbo** → rebuild incrémental (42s pour tout, < 1s si cache hit)

### 2. Single source of truth : `packages/db/prisma/`
- Schema, migrations, seed sont **dans le package `@qoe/db`**
- `prisma.config.ts` (racine) pointe vers ce package
- Docker `migrate` service utilise `prisma migrate deploy --schema=/app/packages/db/prisma/schema.prisma`
- Plus de duplication `prisma/` racine / `packages/db/prisma/`

### 3. Composants UI partagés : `packages/ui/`
- `SocialIcon`, `TenantHeader`, `SubscribeForm` → partagés entre `feed`, `dashboard`, `admin`, et `web`
- Exports subpath : `import { SocialIcon } from "@qoe/ui"`

### 4. Strangler Fig & Découplage de la Plateforme (migration v2 terminée)
- La plateforme d'origine (dans `console` et `web`) a été subdivisée en 5 applications ultra-spécialisées :
  1. `apps/landing` : Le portail vitrine (`start.qoe.fi`), gérant la présentation, les mentions légales, la politique GDPR et un CMS relié à `SystemConfig`.
  2. `apps/feed` : Le flux de lecture, la bibliothèque de signets et la page de connexion globale de la plateforme (`qoe.fi`).
  3. `apps/dashboard` : Le studio d'écriture des créateurs et leur panel analytics (`dashboard.qoe.fi`).
  4. `apps/admin` : La modération générale de la plateforme et l'édition du CMS (`admin.qoe.fi`).
  5. `apps/web` : Moteur de rendu multi-tenant ultra-optimisé pour les blogs des créateurs (`*.qoe.fi` et domaines customs).

### 5. tsconfig ultra-strict → pragmatique
- `strict: true` ✅
- `noUncheckedIndexedAccess` ❌ (trop strict pour v1, à réactiver)
- `noImplicitOverride` ❌ (idem)
- `skipLibCheck: true` ✅ (pour Prisma + Tiptap)
- `transpilePackages: ["@qoe/*"]` dans next.config.ts

---

## 📂 Structure détaillée

### Apps

#### `apps/landing` (Next.js 16) - `start.qoe.fi`
- Site vitrine public connecté à la table `SystemConfig` gérée par l'admin.
- CGU, Règles de confidentialité, politique GDPR.
- Aucun cookie d'authentification nécessaire.

#### `apps/feed` (Next.js 16) - `qoe.fi`
- Feed lecteur, bibliothèque personnelle de signets (`/library`).
- Authentification unique (SSO) centrale : page `/login` et callback `/auth/callback` qui configure les cookies de session sur le domaine parent `.qoe.fi`.

#### `apps/dashboard` (Next.js 16) - `dashboard.qoe.fi`
- Workspace créateur, studio d'écriture avec éditeur TipTap et gestionnaire de paywall.
- Suivi d'audience et de facturation Stripe.

#### `apps/admin` (Next.js 16) - `admin.qoe.fi`
- Cockpit de contrôle des administrateurs de la plateforme (modération, statistiques globales, configuration CMS via la table `SystemConfig`).

#### `apps/web` (Next.js 16) - `*.qoe.fi` (Blogs tenants)
- Affichage des publications, newsletters, et paywall côté lecteur pour chaque sous-domaine de créateur ou domaine personnalisé.

#### `apps/api` (Hono) - `api.qoe.fi`
- `/health` endpoint
- Futur : `/api/...` backend séparé pour de meilleures performances de requêtage direct.

### Packages

| Package | Description |
|---------|-------------|
| `@qoe/db` | Prisma client singleton + repos (articles/users/posts) + types |
| `@qoe/auth` | Roles, permissions (`can(user, action)`), current-user helpers |
| `@qoe/ui` | Tokens, button, card, + composants partagés (SocialIcon, TenantHeader, SubscribeForm) |
| `@qoe/theme` | Design tokens multi-apps (CSS variables + registre type-safe de thèmes/accents) |
| `@qoe/supabase` | 3 clients SSR (browser, server, middleware) |
| `@qoe/i18n` | Tolgee helpers (server, client, provider, locales) |
| `@qoe/analytics` | Events tracking (client, server) |
| `@qoe/billing` | Stripe client, plans, webhooks |
| `@qoe/config` | Env (Zod), constantes (ROLES, LIMITS), features |
| `@qoe/utils` | cn, format, slugify, validation |
| `@qoe/tsconfig` | 4 tsconfig partagés (base, nextjs, node, react-library) |

---

## 🐳 Docker (11 services)

| Service | Port externe (Local / Docker Dev) | Réseau | Description |
|---------|-----------------------------------|--------|-------------|
| **caddy** | 80, 443 (Prod uniquement) | public | Reverse proxy + TLS auto |
| **feed** | 3010 / 4000 | public | Next.js central auth + feed |
| **web** | 3001 / 4001 | public | Next.js blogs créateurs (tenants) |
| **dashboard** | 3020 / 4020 | public | Next.js studio créateur |
| **admin** | 3030 / 4030 | public | Next.js superadmin dashboard |
| **landing** | 3040 / 4040 | public | Next.js site vitrine & légal |
| **api** | 3002 / 4002 | public | Hono backend |
| **workers** | - | private | BullMQ jobs |
| **migrate** | - | private | One-shot Prisma migrate |
| **db** | 5433→5432 | private | Postgres 16 + pgvector |
| **redis** | 6379 | private | Cache + queue |

**2 réseaux isolés** :
- `qoefi-public` : caddy, landing, feed, dashboard, admin, web, api, workers
- `qoefi-private` : db, redis, migrate, workers

📖 Voir [DOCKER.md](./DOCKER.md) pour le guide complet.

---

## 🚀 Déploiement

Voir [DEPLOYMENT.md](./DEPLOYMENT.md) pour le guide complet (VPS, DNS, SSL, monitoring).

En résumé :
1. Préparer `.env.docker` avec les clés prod
2. `pnpm docker:prod:build` sur le VPS
3. `pnpm docker:prod:up`
4. DNS wildcard `*.qoe.fi` → VPS IP
5. Caddy obtient les certs Let's Encrypt automatiquement

---


## 🤖 AI Context & Architecture
> **ATTENTION AI AGENTS (Cursor, Claude, Antigravity, etc.)**
>
> This repository maintains a Ground Truth codebase map specifically designed for AI consumption.
> Before writing, modifying, or proposing any code changes, you MUST read and analyze:
> 👉 **[AI_CODEBASE_MAP.md](./AI_CODEBASE_MAP.md)**
>
> It contains the absolute single source of truth for the stack, file registry, blast radius metrics, routing conventions, and strict architectural rules.

## 📖 Documentation

| Fichier | Contenu |
|---------|---------|
| [AI_CODEBASE_MAP.md](./AI_CODEBASE_MAP.md) | 🤖 Ground Truth Codebase Map for AI Coding Agents |
| [README.md](./README.md) | Ce fichier (vitrine du projet) |
| [GETTING_STARTED.md](./GETTING_STARTED.md) | Démarrage rapide Mac/Win avec le workflow hybride |
| [DEV.md](./DEV.md) | Workflow dev quotidien (3 étapes, Caddy + Docker) |
| [ACTIVATION.md](./ACTIVATION.md) | Guide d'activation post-refacto |
| [DOCKER.md](./DOCKER.md) | Guide Docker complet |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Déploiement production (VPS) |
| [HANDOFF.md](./HANDOFF.md) | Passation projet (état post-refacto) |
| [MIGRATION.md](./MIGRATION.md) | Migration monolithe → monorepo (historique) |

> 📂 Les notes de travail internes (plans, explorations design) sont
> versionnées dans `/plans/` mais **non publiées** (`plans/` est dans
> `.gitignore`).

---

## 🧪 Tests & Qualité

```bash
pnpm test                 # Lance Vitest sur tous les packages
pnpm test:ui              # UI mode
pnpm typecheck            # tsc --noEmit sur tout
pnpm lint                 # ESLint
```

**État actuel** : 0 erreur TypeScript, 0 erreur build (`pnpm build` → 3/3 successful).

---

## 🗺️ Roadmap (migration plan)

### ✅ Fait
- [x] Phase 0 : Setup monorepo (Turborepo, pnpm, Docker)
- [x] Phase 1 : 10 packages partagés
- [x] Phase 2 : Migration `apps/web` (landing + tenants)
- [x] Phase 3 : Migration `apps/console` (auth + feed + dashboard + admin)
- [x] Phase 4 : Découplage complet en 5 applications Next.js autonomes + 1 API Hono
- [x] Phase 5 : Docker multi-services (11 services, 2 réseaux)
- [x] Phase 6 : Cleanup + DNS + déploiement
- [x] **Refacto pro** : dédup schema Prisma + composants UI partagés

### 🟡 En cours
- [ ] Remplacer les stubs (OnboardingFlow, SubscribeForm)
- [ ] Migrer les autres shadcn/ui vers `packages/ui/`
- [ ] **Implémenter les jobs** BullMQ (emails, AI embeddings, billing webhooks)
- [ ] Brancher `packages/theme` dans les 5 apps (remplace les `globals.css` locaux)
- [ ] CI/CD GitHub Actions (build + typecheck + tests)
- [ ] Tests E2E (Playwright)

### 🔮 Futur
- [ ] API Hono complète (au-delà de `/health`)
- [ ] Multi-région (UE + US)
- [ ] Realtime (Supabase channels)
- [ ] Mobile app (React Native)

---

## 📄 License

UNLICENSED — Proprietary code, all rights reserved.

---

## 👤 Author

Built by **qoe.fi team** — see [HANDOFF.md](./HANDOFF.md) for project history.
