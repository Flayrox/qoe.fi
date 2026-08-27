# 🚀 Guide d'activation — qoe.fi monorepo

> **La plateforme : 5 applications Next.js 16 indépendantes + un backend Go (`apps/api`)**
> unique (chi + sqlc + goose + asynq). Prisma et l'API Hono legacy ont été
> entièrement supprimés. Ce guide explique comment démarrer et gérer le
> développement.
>
> Pour une mise en route pas-à-pas (macOS & Windows), voir
> [`docs/GETTING_STARTED.md`](./GETTING_STARTED.md).

---

## 🏗️ Architecture du monorepo

```
qoe.fi/
├── apps/                            # 8 services
│   ├── core/        Next.js 16 — qoe.fi (flux lecteur & SSO centralisé)      :15402
│   ├── studio/      Next.js 16 — studio.qoe.fi (studio créateur & TipTap)    :15404
│   ├── admin/       Next.js 16 — admin.qoe.fi (superadmin & modération)      :15405
│   ├── hi/          Next.js 16 — hi.qoe.fi (vitrine, textes légaux)          :15401
│   ├── tenants/     Next.js 16 — *.qoe.fi & domaines customs (blogs)         :15403
│   ├── api/         Go — api.qoe.fi (backend-of-record, worker asynq)        :15407
│   ├── mobile/      Expo SDK 57 — reader mobile
│   └── collab-server/  Hocuspocus/Yjs — co-édition TipTap
├── packages/                        # 13 packages partagés
│   ├── ui/          🎨 Design system & composants partagés (Button, toast bento, primitives base-ui)
│   ├── theme/       🎨 Design tokens CSS multi-apps (source unique)
│   ├── sdk/         🔄 Couche de données TanStack Query + actions
│   ├── supabase/    🔌 Clients d'authentification SSR
│   ├── auth/        🔐 Rôles, permissions et helpers session
│   ├── i18n/        🌐 Traductions Lingui
│   ├── analytics/   📊 Événements et tracking
│   ├── config/      ⚙️ Validation des variables d'environnement (Zod)
│   ├── observability/ 🔭 Logs structurés + Sentry centralisé
│   ├── flags/       🚩 Feature flags GrowthBook
│   ├── devtools/    🛠️ Outils de dev (mock user, seed, impersonate)
│   ├── utils/       🔧 Fonctions utilitaires communes (cn, etc.)
│   └── tsconfig/    📐 Configurations TypeScript partagées
├── docker/                          # Caddy (reverse proxy), compose dev + prod
└── Caddyfile.dev                    # Reverse proxy local (domain .qoe.test → ports 154xx)
```

### Sous-domaines (DNS wildcard)

| Sous-domaine          | Application | Port local | Rôle                                  |
| --------------------- | ----------- | ---------- | ------------------------------------- |
| `qoe.fi`              | `apps/core` | 15402      | Portail, flux de lecture, SSO          |
| `studio.qoe.fi`       | `apps/studio`| 15404      | Studio d'écriture des créateurs       |
| `admin.qoe.fi`        | `apps/admin`| 15405      | Panel superadmin et modération        |
| `hi.qoe.fi`           | `apps/hi`   | 15401      | Vitrine commerciale, mentions légales |
| `*.qoe.fi` (wildcard) | `apps/tenants` | 15403   | Blogs publics des créateurs           |
| `api.qoe.fi`          | `apps/api`  | 15407      | Backend Go unique                     |

En local, remplace `.qoe.fi` par `.qoe.test` (via Caddy) ou `.lvh.me`.

---

## ✅ Pré-requis

- **Node.js 20+** et **pnpm 11+** (`npm install -g pnpm`)
- **Docker** (Docker Desktop ou OrbStack — recommandé sur macOS)
- **Caddy** (`brew install caddy`) — optionnel si tu utilises `dev:up` (fallback Docker)
- **Go 1.24+** pour le backend (`apps/api`)

---

## 🏁 Démarrage

### Option A — Tout en une commande (recommandé)

```bash
pnpm dev:up
```

`scripts/dev-up.sh` orchestre tout dans le bon ordre : infra Docker (Postgres
pgvector, Redis, Meilisearch, MongoDB, GrowthBook, Umami), Supabase local, puis
les apps Next.js en natif via Turborepo.

### Option B — Manuel (workflow hybride)

```bash
# 1. Installer les dépendances
pnpm install

# 2. Configurer l'environnement
cp .env.docker.example .env
# Édite .env avec tes clés Supabase, Stripe, etc.

# 3. Lancer l'infra (bases de données + services de fond)
docker compose -f docker-compose.dev.yml up -d db redis

# 4. Lancer le reverse proxy local (Caddy)
caddy start --config Caddyfile.dev

# 5. Lancer les apps (Turborepo, HMR natif)
pnpm dev
```

**C'est tout.** En quelques minutes le stack complet tourne : les 5 apps
répondent sur `http://localhost:1540x` (ou via `http://qoe.test`,
`http://studio.qoe.test`, …).

---

## 🛠️ Commandes quotidiennes

### Par application (sans chauffer tout le monorepo)

```bash
pnpm dev:core      # core + ses dépendances (15402)
pnpm dev:studio    # studio (15404)
pnpm dev:admin     # admin (15405)
pnpm dev:hi        # hi (15401)
pnpm dev:tenants   # tenants (15403)
```

### Backend Go

```bash
cd apps/api && go run ./cmd/server   # API sur :15407 (ou :8080 selon env)
cd apps/api && go run ./cmd/migrate up   # applique les migrations goose
cd apps/api && go run ./cmd/seed         # seed idempotent
```

### Qualité & vérification

```bash
pnpm typecheck     # tsc sur tout le monorepo
pnpm lint          # eslint
pnpm test          # tests vitest (TS)
pnpm test:api      # tests Go d'intégration (base partagée, packages sérialisés)
pnpm build         # build de production (Turborepo)
```

### Base de données

```bash
pnpm db:migrate          # goose up (migrations apps/api/sql/migrations)
pnpm db:migrate:status   # état des migrations
pnpm db:seed             # seed Go (idempotent)
docker compose -f docker-compose.dev.yml exec db psql -U qoe -d qoe   # psql
```

### Tests d'intégration Go (base de test dédiée)

```bash
pnpm test:db:up          # démarre la base de test (port 55432)
pnpm test:db:migrate     # applique les migrations dessus
pnpm test:api            # lance toute la suite Go (sérialisée, -p 1)
```

### Docker

```bash
pnpm docker:dev          # stack complète en Docker (apps incluses)
pnpm docker:dev:down     # arrête
pnpm docker:prod:up      # stack de production
pnpm docker:prod:rebuild # rebuild complet
```

---

## 🎨 Composants UI partagés : `packages/ui`

`@qoe/ui` centralise le design system :

- **Button unifié** (base-ui) : `import { Button } from '@qoe/ui/button'`
- **Toasts bento** : `import { toast, Toaster } from '@qoe/ui/toast'` — rendre
  `<Toaster />` une seule fois dans le layout racine, puis `toast.success(...)`,
  `toast.error(...)`, `toast.info(...)`, `toast.warning(...)`, `toast.dismiss()`
- **Primitives** base-ui : dialog, sheet, select, dropdown-menu, tooltip,
  popover, hover-card, input, label, avatar, calendar, table…
- **Composants métier** : LoginFormBento, LoginModal, BentoPlateau, Sidebar,
  SocialIcon, TenantHeader, SubscribeForm…

```tsx
import { Button } from '@qoe/ui/button';
import { toast } from '@qoe/ui/toast';
```

---

## 🔌 Authentification unique (SSO sous-domaines)

Toutes les applications partagent la session grâce à `@qoe/supabase`. Les
cookies d'authentification sont configurés sur le domaine parent `.qoe.fi` :
une authentification sur `qoe.fi` ouvre automatiquement la session sur
`studio.qoe.fi`, `admin.qoe.fi` et les blogs `*.qoe.fi`.

---

## 🐛 Dépannage

### Port occupé

```bash
lsof -iTCP:15402 -sTCP:LISTEN   # identifie le process sur le port
# ou, pour tuer tous les dev servers :
pnpm kill:dev
```

### `pnpm install` échoue ou lockfile incohérent

```bash
pnpm install          # resynchronise pnpm-lock.yaml
```

### Le backend Go ne démarre pas

Vérifie que `DATABASE_URL` pointe vers la bonne base dans `.env`
(`scripts/copy-env.js` synchronise la racine vers `apps/api`), puis
`cd apps/api && go run ./cmd/migrate up`.

### Tests Go d'intégration

Les packages doivent tourner **sérialisés** sur la base partagée
(`pnpm test:api` le fait avec `-p 1`). En CI, chaque package monte son propre
conteneur Testcontainers — les deux modes sont couverts. Voir
[`docs/TEST_STRATEGY.md`](./TEST_STRATEGY.md).
