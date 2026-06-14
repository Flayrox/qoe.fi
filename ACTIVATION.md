# 🚀 Guide d'activation du monorepo qoe.fi

> Ce guide explique comment **basculer définitivement** le projet vers le monorepo Turborepo.
> L'ancien code dans `src/` continue de fonctionner via des ré-exports.

---

## ✅ Pré-requis

```bash
# 1. Installer pnpm 9+
npm install -g pnpm

# 2. Vérifier la version
pnpm --version
# Doit afficher 9.15.0 ou plus récent
```

---

## 🎯 Activation en 3 commandes

```bash
# 1. À la racine du projet : installer TOUTES les dépendances du monorepo
pnpm install

# 2. Builder tous les packages partagés
pnpm turbo build --filter='./packages/*'

# 3. Lancer le stack dev (HMR activé sur web + console)
pnpm docker:dev
```

---

## 🌐 URLs accessibles en local

| Service | URL | Description |
|---------|-----|-------------|
| **Console** | http://localhost:3000 | Home, feed, dashboard, admin |
| **Web** | http://localhost:3001 | Landing `/start`, tenants |
| **API** | http://localhost:3002 | Backend Hono |
| **Prisma Studio** | http://localhost:5555 | UI pour explorer la DB |
| **PostgreSQL** | `localhost:5433` | User: `qoe`, Pass: `qoe` (ou ton mdp) |
| **Redis** | `localhost:6379` | Pas d'auth en dev |

---

## 🔨 Commandes du quotidien

```bash
# Développement (HMR sur 3 apps en parallèle)
pnpm docker:dev
# OU
pnpm dev

# Build d'une seule app
pnpm --filter @qoe/console build

# Build de TOUT (via Turborepo, optimisé)
pnpm build

# Lint + typecheck
pnpm lint
pnpm typecheck

# Tests
pnpm test
```

---

## 📦 Build de production

```bash
# 1. Build toutes les images Docker
docker compose build

# 2. Lance en arrière-plan
docker compose up -d

# 3. Vérifie que tout est healthy
docker compose ps

# 4. Voir les logs
pnpm run docker:prod:logs
```

Voir [DEPLOYMENT.md](./DEPLOYMENT.md) pour la checklist complète de déploiement sur VPS.

---

## 🔄 Ce qui change par rapport à l'ancien `package.json`

| Avant (monolithe) | Après (monorepo) |
|-------------------|------------------|
| `npm run dev` lance Next.js depuis la racine | `pnpm dev` lance les 3 apps en parallèle via Turbo |
| `npm run build` build 1 app | `pnpm build` build les 3 apps en optimisant les deps |
| Toutes les deps à la racine | Deps dans chaque app + packages partagés |
| 1 seul `node_modules` | 1 `node_modules` partagé (hoisted par pnpm) |

---

## 🛠️ Stratégie de migration progressive

L'ancien code dans `src/` **continue de fonctionner** via des ré-exports depuis `apps/web/` et `apps/console/`. C'est le pattern **Strangler Fig** :

```
src/app/(main)/home/page.tsx     ←  code original (toujours actif)
                  ↕
apps/console/src/app/(reader)/home/page.tsx
                  ↓
              re-export
```

### Quand supprimer l'ancien `src/` ?

- Quand tu auras 1-2 jours de libre
- Quand tu seras prêt à débugger les imports cassés
- Quand tu auras testé que tous les flux fonctionnent depuis `apps/`

### Comment faire la migration physique (Phase 8.5 - optionnel)

```bash
# Pour chaque section, copier le fichier puis mettre à jour les imports
# Exemple : migrer src/app/(main)/home/page.tsx vers apps/console/

# 1. Copier
cp src/app/\(main\)/home/page.tsx apps/console/src/app/\(reader\)/home/page.tsx

# 2. Mettre à jour les imports (manuellement)
#    @/lib/db → @qoe/db
#    @/components/ui/button → @qoe/ui/button
#    @/lib/supabase/server → @qoe/supabase/server

# 3. Supprimer l'ancien
rm src/app/\(main\)/home/page.tsx

# 4. Supprimer le ré-export
rm apps/console/src/app/\(reader\)/home/page.tsx
```

**Astuce** : fais-le fichier par fichier, en commitant entre chaque. Si quelque chose casse, tu peux revenir en arrière facilement.

---

## ❓ Troubleshooting

### "Cannot find module '@qoe/db'"

Tu n'as pas fait `pnpm install` à la racine. Fais-le.

### "Port 3000 already in use"

```bash
# Trouve et tue le process
lsof -i :3000  # Mac/Linux
netstat -ano | findstr :3000  # Windows

# OU change le port dans apps/console/package.json
# "dev": "next dev -p 3010"
```

### "Prisma generate failed"

```bash
# À la racine
pnpm --filter @qoe/db prisma generate
```

### "Docker build failed: network unreachable"

Vérifie ta connexion Internet et que Docker a accès au réseau (Docker Desktop → Settings → Network).

---

## 🎓 Comprendre le monorepo

```
qoe.fi/
├── apps/                    ← Deployable apps
│   ├── web/                 ← start.qoe.fi + tenants
│   ├── console/             ← qoe.fi + dashboard + admin
│   └── api/                 ← api.qoe.fi (Hono)
│
├── workers/                 ← Background jobs
│
├── packages/                ← Shared libraries
│   ├── db/                  ← Prisma client + repos
│   ├── supabase/            ← 3 Supabase clients
│   ├── auth/                ← Rôles + permissions
│   ├── ui/                  ← shadcn components
│   ├── ...                  ← 6 autres
│
├── prisma/                  ← Schema (racine)
│
├── docker/                  ← Caddy, postgres, redis
│
├── docker-compose.yml       ← 8 services prod
├── docker-compose.dev.yml    ← HMR dev
├── turbo.json                ← Pipeline Turborepo
└── pnpm-workspace.yaml       ← Déclare les workspaces
```

### Avantages

| Bénéfice | Détail |
|----------|--------|
| **Bundle size** | Public = 150 KB, Console = 400 KB |
| **Cache** | Turbo rebuild uniquement ce qui change |
| **Isolation** | Bug admin ne pète pas le public |
| **Scalabilité** | Chaque app peut scale indépendamment |
| **Tests** | Par package, plus rapide |
| **DX** | HMR, type-safety bout-en-bout |

---

**Tu es prêt à activer ! 🚀**

Une question ? → [DOCKER.md](./DOCKER.md) | [DEPLOYMENT.md](./DEPLOYMENT.md) | [MIGRATION.md](./MIGRATION.md)
