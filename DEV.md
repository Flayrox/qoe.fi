# ⚡ Démarrage Rapide du Dev Local — qoe.fi

> **Workflow hybride** : Docker pour la DB uniquement, Node natif pour les
> apps (meilleures perf, HMR instantané). Voir aussi
> [GETTING_STARTED.md](./GETTING_STARTED.md) pour le guide multi-plateforme.

Ce guide te résume comment lancer rapidement ton environnement de développement hybride sur ton Mac.

---

## 🛠️ Chaque Matin : Le Workflow en 3 Étapes

### 1. Lancer les bases de données (Docker/OrbStack)

Dans ton terminal, démarre uniquement Postgres et Redis en arrière-plan :

```bash
docker compose -f docker-compose.dev.yml up -d db redis
```

### 2. Démarrer le Reverse Proxy (Caddy)

Lance Caddy pour rediriger automatiquement tes sous-domaines locaux en `.localhost` (ex: `dashboard.localhost` ➡️ port `3020`) :

```bash
caddy start --config Caddyfile.dev
```

_(Caddy tourne en tâche de fond et libère ton terminal)._

> 🧪 Le `Caddyfile.dev` accepte **deux domaines** par app : `*.localhost`
> (standard, pas de /etc/hosts nécessaire sur macOS) et `*.qoe.test`
> (utile quand plusieurs devs veulent éviter les conflits DNS).

### 3. Lancer les serveurs de dev (Natif)

Démarre toutes les applications Next.js et l'API Hono legacy en parallèle (le backend de référence est Go — `apps/api-go`) :

```bash
pnpm dev
```

> 💡 **Le réflexe du quotidien** : `pnpm dev` lance les **5 apps + API + workers**
> en parallèle → premier build ~2-3 min et CPU à fond. Pour travailler sur UNE
> app, lance le script ciblé correspondant (bien plus rapide et léger) :
>
> ```bash
> pnpm dev:feed      # feed + API  (3010 + 3002)
> pnpm dev:web       # web + API   (3001 + 3002)
> pnpm dev:dashboard # dashboard + API (3020 + 3002)
> pnpm dev:landing   # landing seule (3040)
> pnpm dev:admin     # admin seul (3030)
> pnpm dev:api       # API seule (3002)
> ```

---

## 🚩 Feature Flags (GrowthBook self-hosté)

Le monorepo est câblé sur GrowthBook via `@qoe/flags` (dans les 5 apps, l'API et les workers). Pour l'activer en dev :

```bash
# 1. Démarre MongoDB + GrowthBook (UI et API SDK)
docker compose -f docker-compose.dev.yml up -d mongodb growthbook

# 2. Ouvre http://localhost:3100 → crée ton compte admin
# 3. Settings → SDK Connections → New → copie la clé `sdk-...`
# 4. Colle-la dans .env et .env.docker :
#    GROWTHBOOK_CLIENT_KEY=sdk-...  et  NEXT_PUBLIC_GROWTHBOOK_CLIENT_KEY=sdk-...
```

- **Dashboard UI** : http://localhost:3100 · **API SDK** : http://localhost:3200
- Sans config, tous les flags retombent sur leurs valeurs par défaut (aucun crash).
- Voir `packages/flags/src/flags.ts` pour ajouter un flag.

---

## 🌐 URLs Utiles en Local

Une fois tout démarré, accède directement à tes applications via les domaines locaux :

- **Espace Feed / Lecteur** : [http://qoe.localhost](http://qoe.localhost) _(ou `localhost:3010` en direct)_
- **Dashboard Créateur** : [http://dashboard.localhost](http://dashboard.localhost) _(ou `localhost:3020`)_
- **Administration Générale** : [http://admin.localhost](http://admin.localhost) _(ou `localhost:3030`)_
- **Landing Vitrine** : [http://start.localhost](http://start.localhost) _(ou `localhost:3040`)_
- **API Hono (legacy, transition)** : [http://api.localhost](http://api.localhost) _(ou `localhost:3002/health`)_ — backend de référence : `cd apps/api-go && go run ./cmd/server` (port 8080, activé via `QOE_API_GO_URL`)
- **Blogs Créateurs** : `http://*.localhost:3001` _(wildcard multi-tenant, ex: `http://demo.localhost:3001`)_
- **Prisma Studio (GUI)** : [http://localhost:5555](http://localhost:5555)
- **GrowthBook (flags UI)** : [http://localhost:3100](http://localhost:3100)

---

## 🛑 Commandes d'Arrêt et Nettoyage

- **Arrêter Caddy** : `caddy stop`
- **Arrêter les bases de données** : `docker compose -f docker-compose.dev.yml down`
