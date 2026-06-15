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
│   ├── console/                     # Next.js 16 — auth + dashboard + admin
│   ├── web/                         # Next.js 16 — public + tenants
│   └── api/                         # Hono backend (health, future)
├── packages/                        # 10 packages partagés
│   ├── db/                          # 🐘 Prisma client + repos (SOURCE UNIQUE: prisma/)
│   ├── auth/                        # 🔐 Roles, permissions, current-user
│   ├── ui/                          # 🎨 Tokens + composants partagés
│   ├── supabase/                    # 🔌 3 clients (browser/server/middleware)
│   ├── i18n/                        # 🌐 Tolgee helpers
│   ├── analytics/                   # 📊 Events tracking
│   ├── billing/                     # 💳 Stripe (client, plans, webhooks)
│   ├── config/                      # ⚙️ Env Zod, constantes, feature flags
│   ├── utils/                       # 🔧 cn, format, slugify, validation
│   └── tsconfig/                    # 📐 4 tsconfig partagés
├── workers/                         # BullMQ (placeholder)
├── docker/                          # Caddy, Postgres, Redis
├── messages/                        # i18n locales
├── scripts/                         # deploy, seed, backup, dedupe
├── prisma.config.ts                 # Pointe vers packages/db/prisma/
└── HANDOFF.md                       # Passation projet (post-refacto)
```

### 🌐 Domain mapping

| Subdomain | App | Usage |
|-----------|-----|-------|
| `qoe.fi` | console | Home / feed / auth |
| `dashboard.qoe.fi` | console | Creator dashboard |
| `admin.qoe.fi` | console | Superadmin panel |
| `start.qoe.fi` | web | Landing page (marketing) |
| `*.qoe.fi` | web | Tenant pages (multi-tenant) |
| `api.qoe.fi` | api | Hono backend (future) |

---

## ⚡ Quick start (5 minutes)

### 1. Prérequis
- Node.js 20+
- pnpm 9.15+ (`npm install -g pnpm`)
- Docker Desktop (pour Postgres + Redis)

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
# Option A : Stack complet avec Docker (recommandé)
pnpm docker:dev
# → Postgres + pgvector + Redis + web + console + api avec HMR
# → Console: http://localhost:3000
# → Web:     http://localhost:3001
# → API:     http://localhost:3002/health

# Option B : Dev local sans Docker (DB externe requise)
pnpm prisma:generate
pnpm dev   # Turbo lance les 3 apps en parallèle
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
pnpm dev                  # Lance les 3 apps en parallèle
pnpm build                # Build tout (api, console, web)
pnpm typecheck            # Typecheck tout
pnpm lint                 # ESLint tout
```

### Par app
```bash
pnpm --filter @qoe/console dev      # Console uniquement
pnpm --filter @qoe/web dev          # Web uniquement
pnpm --filter @qoe/api dev          # API uniquement
```

### Docker
```bash
pnpm docker:dev            # Stack dev (Postgres + Redis + 3 apps)
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
```

> 📖 **Source unique Prisma** : `packages/db/prisma/`
> - `schema.prisma`, `migrations/`, `seed.ts` sont **tous** là
> - Le dossier `prisma/` racine a été supprimé (voir commit `eaddd0b`)

---

## 🏗️ Décisions d'architecture clés

### 1. Monorepo Turborepo
- **3 apps** indépendantes → scale horizontal par app
- **10 packages** partagés → code DRY, type-safety bout-en-bout
- **Cache Turbo** → rebuild incrémental (42s pour tout, < 1s si cache hit)

### 2. Single source of truth : `packages/db/prisma/`
- Schema, migrations, seed sont **dans le package `@qoe/db`**
- `prisma.config.ts` (racine) pointe vers ce package
- Docker `migrate` service utilise `prisma migrate deploy --schema=/app/packages/db/prisma/schema.prisma`
- Plus de duplication `prisma/` racine / `packages/db/prisma/`

### 3. Composants UI partagés : `packages/ui/`
- `SocialIcon`, `TenantHeader`, `SubscribeForm` → partagés entre `console` et `web`
- Exports subpath : `import { SocialIcon } from "@qoe/ui"`
- Le reste des shadcn/ui reste dans `apps/console/src/components/ui/` (migration future)

### 4. Strangler Fig (migration terminée)
- Le monolithe Next.js a été décomposé sans interruption
- Tous les imports `@/lib/...` → `@qoe/...`
- L'ancien `src/` est supprimé (pas de dette technique)

### 5. tsconfig ultra-strict → pragmatique
- `strict: true` ✅
- `noUncheckedIndexedAccess` ❌ (trop strict pour v1, à réactiver)
- `noImplicitOverride` ❌ (idem)
- `skipLibCheck: true` ✅ (pour Prisma + Tiptap)
- `transpilePackages: ["@qoe/*"]` dans next.config.ts

---

## 📂 Structure détaillée

### Apps

#### `apps/console` (Next.js 16)
- `qoe.fi` (home public/privé)
- `dashboard.qoe.fi` (creator)
- `admin.qoe.fi` (superadmin)
- Routes : `(reader)/`, `(creator)/dashboard/`, `(admin)/admin/`, `login/`, `auth/`, `api/`
- Tolgee, Theme, Tooltip providers

#### `apps/web` (Next.js 16)
- `start.qoe.fi` (landing `/start`)
- `*.qoe.fi` tenants (`/tenant/[domain]/`, `/tenant/[domain]/article/[slug]/`)
- Security headers (`X-Frame-Options`, `nosniff`, `Referrer-Policy`)
- Composants marketing (Hero, Bento, Comparison, CTA, Marquee)

#### `apps/api` (Hono)
- `/health` endpoint
- Futur : `/api/...` backend séparé

### Packages

| Package | Description |
|---------|-------------|
| `@qoe/db` | Prisma client singleton + repos (articles/users/posts) + types |
| `@qoe/auth` | Roles, permissions (`can(user, action)`), current-user helpers |
| `@qoe/ui` | Tokens, button, card, + 3 composants partagés (SocialIcon, TenantHeader, SubscribeForm) |
| `@qoe/supabase` | 3 clients SSR (browser, server, middleware) |
| `@qoe/i18n` | Tolgee helpers (server, client, provider, locales) |
| `@qoe/analytics` | Events tracking (client, server) |
| `@qoe/billing` | Stripe client, plans, webhooks (placeholder) |
| `@qoe/config` | Env (Zod), constantes (ROLES, LIMITS), features |
| `@qoe/utils` | cn, format, slugify, validation |
| `@qoe/tsconfig` | 4 tsconfig partagés (base, nextjs, node, react-library) |

---

## 🐳 Docker (8 services)

| Service | Port externe | Réseau | Description |
|---------|--------------|--------|-------------|
| **caddy** | 80, 443 | public | Reverse proxy + TLS auto |
| **web** | 3001 | public | Next.js public |
| **console** | 3000 | public | Next.js auth |
| **api** | 3002 | public | Hono backend |
| **workers** | - | private | BullMQ jobs |
| **migrate** | - | private | One-shot Prisma migrate |
| **db** | 5433→5432 | private | Postgres 16 + pgvector |
| **redis** | 6379 | private | Cache + queue |

**2 réseaux isolés** :
- `qoefi-public` : caddy, web, console, api, workers
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

## 📖 Documentation

| Fichier | Contenu |
|---------|---------|
| [README.md](./README.md) | Ce fichier (vitrine du projet) |
| [ACTIVATION.md](./ACTIVATION.md) | Guide d'activation post-refacto |
| [DOCKER.md](./DOCKER.md) | Guide Docker complet |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Déploiement production (VPS) |
| [HANDOFF.md](./HANDOFF.md) | Passation projet (état post-refacto) |
| [MIGRATION.md](./MIGRATION.md) | Migration monolithe → monorepo (historique) |

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
- [x] Phase 6 : Docker multi-services
- [x] Phase 8 : Cleanup + DNS + déploiement
- [x] **Refacto pro** : dédup schema Prisma + composants UI partagés

### 🟡 En cours
- [ ] Remplacer les stubs (OnboardingFlow, SubscribeForm)
- [ ] Migrer les autres shadcn/ui vers `packages/ui/`
- [ ] CI/CD GitHub Actions (build + typecheck + tests)
- [ ] Tests E2E (Playwright)

### 🔮 Futur
- [ ] Workers BullMQ (emails, AI, billing)
- [ ] API Hono complète
- [ ] Multi-région (UE + US)
- [ ] Realtime (Supabase channels)
- [ ] Mobile app (React Native)

---

## 📄 License

UNLICENSED — Proprietary code, all rights reserved.

---

## 👤 Author

Built by **qoe.fi team** — see [HANDOFF.md](./HANDOFF.md) for project history.
