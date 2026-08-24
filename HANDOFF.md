# 🛠️ HANDOFF — qoe.fi monorepo (passation)

> **Document de passation vivant.** Les sections « état courant » décrivent
> la structure **actuelle** (sept. 2026, après les renommages v3). La partie
> « Chronologie du projet » conserve l'historique des décisions passées.

---

## 📋 TL;DR (état courant)

- ✅ Monorepo Turborepo + pnpm : ~21 packages + 8 apps
- ✅ **Backend unique Go** (`apps/api`, module `github.com/qoefi/api`) — Hono legacy supprimé
- ✅ **Queue unique asynq** (`apps/api/cmd/worker`) — BullMQ supprimé
- ✅ Prisma centralisé dans `packages/db/prisma/` (source unique)
- ✅ Supabase **auto-hébergé** sur le VPS (pgvector, RLS) — `auth.qoe.fi` / `base.admin.qoe.fi`
- ✅ CI : typecheck 21/21, tests Go 13/13, coverage gates 6/6 au vert
- ✅ Noms alignés : **service = sous-domaine** quand il existe (`hi`, `studio`, `admin`, `api`) ; `core`/`tenants` servent `qoe.fi` et le wildcard

---

## 🎯 Démarrage en 5 minutes

```bash
# 1. Install
pnpm install

# 2. Setup env
cp .env.docker.example .env.docker
ln -s .env.docker .env
# Éditer .env.docker avec tes clés

# 3. Start dev stack
pnpm docker:dev
# → Core (Reader):     http://localhost:4000   (qoe.fi)
# → Tenants (Blogs):   http://localhost:4001   (*.qoe.fi)
# → Studio:            http://localhost:4020
# → Admin:             http://localhost:4030
# → Hi (exposition):   http://localhost:4040
# → API:               http://localhost:4002/health
```

📖 **Voir [ACTIVATION.md](./ACTIVATION.md) pour le guide complet.**

---

## 🏗️ Architecture (état courant)

```
qoe.fi/
├── apps/
│   ├── hi/                        # Next.js — hi.qoe.fi (vitrine, mentions légales)
│   ├── core/                      # Next.js — qoe.fi (reader, feed, auth SSO, bibliothèque)
│   ├── studio/                    # Next.js — studio.qoe.fi (studio créateur, éditeur TipTap)
│   ├── admin/                     # Next.js — admin.qoe.fi (superadmin, modération)
│   ├── tenants/                   # Next.js — *.qoe.fi (blogs créateurs multi-tenant)
│   ├── api/                       # Go (chi + sqlc + asynq) — api.qoe.fi (backend-of-record)
│   ├── mobile/                    # Expo SDK 57 (React Native, expo-router)
│   └── collab-server/             # Hocuspocus/Yjs — co-édition TipTap
├── packages/                      # ~15 packages partagés (db, auth, ui, theme, config, …)
├── docker/                        # Caddy, compose prod + dev
├── scripts/                       # bootstrap, deploy, copy-env, backfill, launchd
└── docs/                          # MIGRATION, DOCKER, API_CONTRACT, …
```

### Subdomains (état courant)

| Subdomain            | Service    | Usage                                           |
| -------------------- | ---------- | ----------------------------------------------- |
| `qoe.fi`             | core       | Reader / feed / auth centralisé                 |
| `hi.qoe.fi`          | hi         | Page d'exposition (vitrine, liens, CGU)         |
| `studio.qoe.fi`      | studio     | Studio créateur                                 |
| `admin.qoe.fi`       | admin      | Superadmin et modération                        |
| `*.qoe.fi`           | tenants    | Blogs créateurs (wildcard, multi-tenant)        |
| `api.qoe.fi`         | api        | Backend Go (backend-of-record)                  |
| `auth.qoe.fi`        | Supabase   | API Rest Supabase auto-hébergée                 |
| `base.admin.qoe.fi`  | Supabase   | GUI Studio de la base (cert dédié, Basic Auth + Tailscale) |
| `umami.qoe.fi`       | umami      | Analytics                                      |

---

## 📅 Chronologie du projet (3 commits)

> ⚠️ Les sections ci-dessous décrivent l'état **à l'époque** de ces commits
> (noms historiques : landing/feed/dashboard/web, Hono legacy, BullMQ).
> Ces éléments ont depuis été renommés ou supprimés — voir « Architecture
> (état courant) » en tête de document.

### `3029a31` (194 fichiers, +7056 lignes) — "initialize monorepo structure"

**Toi, avant notre chat** : fondation pure du monorepo.

- `pnpm-workspace.yaml`, `turbo.json`, `.npmrc`
- `package.json` racine = métapackage
- Dockerfile + docker-compose initiaux
- README, ACTIVATION.md, DOCKER.md, DEPLOYMENT.md
- **Aucun code applicatif touché**

### `65e4c5b` (313 fichiers, +20 437 lignes) — "scaffold console and web"

**Toi** : le gros commit de migration.

- **10 packages workspace** créés (tsconfig, config, utils, db, supabase, ui, i18n, auth, billing, analytics)
- **3 apps** créées (console, web, api)
- **Code de `src/` → `apps/console/src/`** (78 fichiers avec imports mis à jour)
- **19 re-exports fantômes** supprimés (via `scripts/cleanup-fantoms.ps1`)
- **Schema Prisma copié** vers `packages/db/prisma/` (le bug critique)
- **Peer dependencies** `next` + `react` ajoutées à 4 packages
- **Flags TS stricts désactivés** : `noUncheckedIndexedAccess`, `noImplicitOverride`
- **3 imports `@prisma/client`** convertis vers `@qoe/db/types`
- **Docker 8 services** : caddy, web, console, api, workers, db, redis, migrate
- **2 réseaux isolés** : `qoefi-public` + `qoefi-private`
- **Résultat** : `pnpm build` ✅ 3/3 successful

### `eaddd0b` (34 fichiers, +194, -1799) — "REFACTOR: centralize UI"

**Moi, sur ta demande** : déduplication finale.

- **AXE 1** : Schema Prisma dédupliqué (1 source unique dans `packages/db/prisma/`)
  - `prisma/` racine **supprimé**
  - `prisma.config.ts` mis à jour
  - `packages/db/package.json` enrichi
  - `scripts/seed-docker.sh` adapté
- **AXE 2** : Composants UI partagés (`SocialIcon`, `TenantHeader`, `SubscribeForm`)
  - Migrés vers `packages/ui/src/`
  - 6 fichiers doublons supprimés
- **Cleanup** : 8 scripts `fix-*.ps1` redondants supprimés
- **Résultat** : `pnpm build` ✅ 3/3 successful

---

## 🎉 Refacto final (état post-`eaddd0b`)

### ✅ Schema Prisma dédupliqué

- Source unique : `packages/db/prisma/schema.prisma`
- `prisma/` racine **supprimé**
- `prisma.config.ts` pointe vers `packages/db/prisma/`
- `packages/db/package.json` enrichi (`prisma.seed`, `tsx` en devDep)
- `scripts/seed-docker.sh` adapté (cd dans packages/db avant migrate)
- **Build vérifié** : 3/3 successful ✅

### ✅ Composants UI partagés

- `SocialIcon.tsx`, `TenantHeader.tsx`, `SubscribeForm.tsx` copiés vers `packages/ui/src/`
- `packages/ui/src/index.ts` ré-exporte les 3
- `packages/ui/package.json` enrichi (exports subpath, `lucide-react`, `next` peerDep)
- Imports mis à jour dans 3 fichiers (1 console + 2 web)
- 6 fichiers doublons supprimés
- **Build vérifié** : 3/3 successful ✅

### ✅ Runtime

- Build passe parfaitement
- `pnpm dev` lance en EACCES sur port 3000/3010 : restriction **Windows Defender** (pas un bug code)
- Pour tester en local : désactiver temporairement le pare-feu Windows OU lancer en WSL

---

## 📊 Bilan global

| Aspect                     | Avant (3029a31)            | Après (v2 - Découplé)                                         |
| -------------------------- | -------------------------- | ------------------------------------------------------------- |
| **Apps**                   | 1 (monolithe)              | 6 (landing, feed, dashboard, admin, web, api)                 |
| **Packages partagés**      | 0                          | 11                                                            |
| **Schema Prisma**          | 1 fichier racine           | 1 source unique dans `packages/db/prisma/`                    |
| **Composants UI partagés** | Pas de partage             | Centralisés dans `packages/ui/`                               |
| **Design tokens**          | 5 `globals.css` divergents | Source unique dans `packages/theme/` (en cours d'intégration) |
| **Build**                  | `pnpm dev` simple          | `pnpm build` 6/6 + 11 packages + 1 worker successful en ~45s  |
| **Docker**                 | Fichier basique            | 11 services + 2 réseaux isolés                                |
| **Documentation**          | 1 README                   | 7 fichiers markdown mis à jour + `plans/` interne             |
| **Lignes de code**         | ~7 000                     | ~26 000 (scaffold complet découplé)                           |

---

## 🔧 Décisions architecturales clés

### 1. Monorepo Turborepo

- **6 apps/services** indépendants → scale horizontal et isolation totale par contexte métier
- **11 packages** partagés → code DRY, type-safety bout-en-bout
- **Cache Turbo** → rebuild incrémental (42s la 1ère fois, < 1s en cache hit)

### 2. Source unique Prisma : `packages/db/prisma/`

- Schema, migrations, seed sont **dans le package `@qoe/db`**
- `prisma.config.ts` (racine) pointe vers ce package
- Docker `migrate` service : `qoe-migrate -dir /migrations up` (goose, `apps/api/sql/migrations`)
- Plus de duplication `prisma/` racine / `packages/db/prisma/`

### 3. Composants UI partagés : `packages/ui/`

- `SocialIcon`, `TenantHeader`, `SubscribeForm` → partagés entre `core`, `studio`, `admin`, et `tenants`
- Exports subpath : `import { SocialIcon } from "@qoe/ui"`

### 4. Décomposition de la plateforme (migration v2 → renommages v3)

- Le gros dossier legacy `apps/console` et le site `start` de `apps/web` ont été scindés, puis renommés (v3) :
  - **`apps/hi`** : CMS, présentation et textes légaux (`hi.qoe.fi`, ex `start.qoe.fi`)
  - **`apps/core`** : Flux lecteurs, SSO centralisé (`qoe.fi`, ex `feed`)
  - **`apps/studio`** : Studio créateur et éditeur d'articles (`studio.qoe.fi`, ex `dashboard`)
  - **`apps/admin`** : Pilotage admin et modération (`admin.qoe.fi`)
  - **`apps/tenants`** : Rendu des blogs créateurs (`*.qoe.fi`, ex `web`)

### 5. tsconfig pragmatique

- `strict: true` ✅
- `noUncheckedIndexedAccess` ❌ (trop strict pour v1, à réactiver)
- `noImplicitOverride` ❌ (idem)
- `skipLibCheck: true` ✅
- `transpilePackages: ["@qoe/*"]` dans next.config.ts de chaque application

---

## 🧪 Commandes utiles

```bash
# Build complet
pnpm build

# Typecheck
pnpm typecheck

# Une seule app
pnpm --filter @qoe/hi build
pnpm --filter @qoe/core build
pnpm --filter @qoe/studio build
pnpm --filter @qoe/admin build
pnpm --filter @qoe/tenants build

# Dev (HMR)
pnpm dev                # toutes les apps
pnpm dev:core           # reader + API
pnpm dev:studio         # studio + API

# Go (backend-of-record)
cd apps/api && go run ./cmd/server   # :8080
cd apps/api && go run ./cmd/worker   # worker asynq
cd apps/api && go test ./...         # tests d'intégration (testcontainers)

# Docker
pnpm docker:dev
pnpm docker:prod
pnpm docker:prod:rebuild
```

---

## 📂 Fichiers clés à connaître

| Fichier                            | Rôle                                                   |
| ---------------------------------- | ------------------------------------------------------ |
| `pnpm-workspace.yaml`              | Déclare les 18 workspaces                              |
| `turbo.json`                       | Pipeline de build (cache, parallélisme)                |
| `prisma.config.ts`                 | Pointe vers `packages/db/prisma/`                      |
| `packages/db/prisma/schema.prisma` | **Source de vérité** du modèle de données              |
| `packages/ui/src/index.ts`         | Exports centralisés des composants UI partagés         |
| `packages/theme/src/`              | Design tokens + registre de thèmes (source unique CSS) |
| `apps/hi/next.config.ts`           | Config Next pour la vitrine                            |
| `apps/core/next.config.ts`         | Config Next pour le reader et l'auth                   |
| `apps/studio/next.config.ts`       | Config Next pour le studio                             |
| `apps/admin/next.config.ts`        | Config Next pour le panel admin                        |
| `apps/tenants/next.config.ts`      | Config Next pour les blogs                             |
| `apps/api/cmd/server/main.go`      | Point d'entrée API Go (chi)                            |
| `apps/api/cmd/worker/main.go`      | Worker asynq (webhooks, newsletter, embeddings, publish) |
| `docker-compose.yml`               | 14 services + réseaux segmentés                        |
| `docker/caddy/Caddyfile`           | Reverse proxy + TLS auto                               |
| `scripts/deploy.sh`                | Deploy complet sur VPS                                 |

---

## 🛠️ Scripts PowerShell (utiles)

| Script                         | Description                               |
| ------------------------------ | ----------------------------------------- |
| `scripts/cleanup-fantoms.ps1`  | Supprime les re-exports fantômes (legacy) |
| `scripts/dedupe-prisma.ps1`    | Déduplique le schema Prisma               |
| `scripts/dedupe-ui.ps1`        | Déduplique les composants UI partagés     |
| `scripts/fix-implicit-any.ps1` | Ajoute `: any` aux callbacks Prisma       |
| `scripts/deploy.sh`            | Deploy complet sur VPS (Bash)             |
| `scripts/seed-docker.sh`       | Seed la DB (Bash)                         |
| `scripts/backup-postgres.sh`   | Backup Postgres (Bash)                    |
| `scripts/wait-for-db.sh`       | Attend que Postgres soit healthy (Bash)   |

---

## 🗺️ Roadmap future

### 🟢 En place aujourd'hui

- **Worker asynq unique** (`apps/api/cmd/worker`) : webhooks, newsletter fanout, sync Meilisearch, embeddings jina, **scheduler de publication** (SCHEDULED → PUBLISHED)
- **CI** : typecheck + lint + tests + build (job monorepo), Go vet/build/test/race + coverage gates 6/6 (job api), Playwright e2e
- **Mobile** : Expo SDK 57 (expo-router) — feed, articles, thoughts, profils
- **Collab** : Hocuspocus/Yjs (`apps/collab-server`) pour la co-édition TipTap

### 🟡 À faire

- **Serveur mail** (Netcup) : Mailcow + DKIM/SPF/DMARC/PTR, brancher `EMAIL_PROVIDER=smtp`
- **Caddy DNS-01** (plugin netcup) : wildcard + certs auto sans certbot
- **Bascule DNS** vers le nouveau VPS (voir `docs/MIGRATION.md`)
- **Notifications email** : l'outbox existe (`packages/workers` = `@qoe/email`), l'envoi SMTP reste à brancher

---

## 📖 Documentation

| Fichier                                    | Contenu                                                            |
| ------------------------------------------ | ------------------------------------------------------------------ |
| [README.md](./README.md)                   | Vitrine du projet (Quick start, stack, structure)                  |
| [GETTING_STARTED.md](./GETTING_STARTED.md) | Guide de démarrage rapide multi-plateforme (Mac/Win)               |
| [DEV.md](./DEV.md)                         | Workflow dev quotidien (3 étapes : db Docker + Caddy + `pnpm dev`) |
| [ACTIVATION.md](./ACTIVATION.md)           | Comment démarrer (4 commandes)                                     |
| [DOCKER.md](./DOCKER.md)                   | Architecture Docker, 11 services, dev/prod                         |
| [DEPLOYMENT.md](./DEPLOYMENT.md)           | Déploiement production (VPS, DNS, SSL, backups)                    |
| [HANDOFF.md](./HANDOFF.md)                 | **Ce fichier** — passation + historique                            |
| [MIGRATION.md](./MIGRATION.md)             | Migration monolithe → monorepo (historique)                        |

> 📂 `plans/` contient les notes de travail internes (roadmaps, explorations
> design). **Non publié** (`.gitignore`).

---

## 🎓 Leçons apprises

### Ce qui a bien marché

- **Strangler Fig pattern** : migration sans interruption, chaque étape réversible
- **Source unique Prisma** : pas de drift entre `prisma/` racine et `packages/db/`
- **Un seul backend Go + une seule queue asynq** : supprimer la stack Node legacy (Hono, BullMQ, worker-node) a simplifié l'exploitation
- **Noms alignés service = sous-domaine** : `hi`, `studio`, `api`, `core`, `tenants` — un seul mot par concept
- **Docker multi-target** : 1 seul Dockerfile pour les apps Next.js (hi, core, studio, admin, tenants)
- **Caddy** : TLS automatique, pas de config Let's Encrypt à maintenir

### Ce qui a été challengeant

- **Windows + pnpm** : EPERM aléatoires, parfois il faut retry `pnpm install`
- **Prisma + pnpm workspaces** : solution `paths` dans tsconfig + `transpilePackages`
- **Next.js 16 `typedRoutes`** : très strict sur les href, on a dû ajouter `as any`
- **Windows Defender EACCES** : bloque `pnpm dev` sur port 3000/3010 en local
- **Flags TS stricts** : `noUncheckedIndexedAccess` cause trop d'erreurs en v1

### Pour le prochain projet

- **Commencer directement par le monorepo** dès le début (pas de monolithe)
- **Centraliser Prisma dès le jour 1** dans `packages/db/prisma/`
- **Pousser les composants dans `packages/ui/`** dès qu'ils sont utilisés par 2 apps
- **Activer Caddy** (pas nginx) pour le TLS auto
- **Utiliser pnpm** (pas npm/yarn) pour les workspaces
- **Utiliser Turborepo** pour le cache de build

---

## 🎉 Conclusion

Le projet est dans un état **propre, scalable, fonctionnel** : backend Go unique, queue asynq unique, apps aux noms alignés, CI verte. Le prochain dev qui arrive a tout ce qu'il faut dans [README.md](./README.md) pour être opérationnel en 5 minutes.

Bonne chance pour la suite ! 🚀
