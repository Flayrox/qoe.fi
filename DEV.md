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

Démarre toutes les applications Next.js et l'API Hono en parallèle :

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
- **API Hono** : [http://api.localhost](http://api.localhost) _(ou `localhost:3002/health`)_
- **Blogs Créateurs** : `http://*.localhost:3001` _(wildcard multi-tenant, ex: `http://demo.localhost:3001`)_
- **Prisma Studio (GUI)** : [http://localhost:5555](http://localhost:5555)
- **GrowthBook (flags UI)** : [http://localhost:3100](http://localhost:3100)

---

## 📱 App Mobile (React Native + Expo)

App Expo **SDK 57** (`apps/mobile`) : expo-router + **Expo UI** (@expo/ui —
composants natifs SwiftUI / Jetpack Compose, stable et inclus dans Expo Go).
Intégrée au monorepo (pnpm + turbo), Metro est auto-configuré pour le monorepo.

### Structure (calquée sur `apps/feed`)

```
apps/mobile/src/
  app/          → routes expo-router (seules les routes vivent ici)
  components/   → composants UI génériques (+ providers/)
  features/     → fonctionnalités métier (home, puis feed, auth…)
  hooks/        → hooks partagés
  lib/          → infra : api (hôte auto), query-client
  constants/    → thème
```

### Connexion à l'API

- Le mobile importe **`@qoe/api-client/mobile`** : entrée RN-safe du client
  partagé (client + types + query-keys + `useInfiniteFeed`), sans les actions
  serveur (`'use server'` / Prisma) que tire l'index racine.
- `src/lib/api.ts` résout l'hôte automatiquement : `localhost` sur simulateur,
  IP locale (via `hostUri` Metro) sur appareil physique.
- Data fetching : **@tanstack/react-query** (même version que les apps web).
- La carte « API qoe.fi » de l'écran d'accueil affiche l'état de la connexion :
  lance l'API (`pnpm dev:api`) pour la voir passer à « connectée ».

### i18n (Lingui)

- L'app réutilise **`@qoe/i18n/core` + `@qoe/i18n/catalogs`** (entrées RN-safe
  ajoutées au package) : même singleton Lingui et mêmes catalogues
  (`messages/`) que les apps web, chargés et fusionnés sans dépendance serveur.
- `src/lib/i18n.ts` active la locale de l'appareil (`expo-localization`,
  fr/en) et exporte un traducteur `t('clé', 'texte par défaut')` — même
  contrat que les apps web. Les clés existantes (`login.*`, `common.*`…)
  sont réutilisées telles quelles.

### Auth (Supabase)

- Client RN dans `src/lib/supabase.ts` : `@supabase/supabase-js` + session
  persistée dans **AsyncStorage** (pas le client browser à cookies de
  `@qoe/supabase`). Config publique dans `apps/mobile/.env` (`EXPO_PUBLIC_*`).
- `AuthProvider` (src/features/auth) expose `session` / `signIn` / `signOut`
  et synchronise le token d'accès dans `src/lib/session.ts`, lu par le
  client API via `getAuthToken` → les appels API sont authentifiés.
- Routes protégées : le layout racine affiche `LoginScreen` sans session,
  les onglets avec. `useAuth()` doit être consommé DANS `AppProviders`.
- L'écran de connexion a un **mode inscription** (nom + email + mot de passe,
  clés de traduction `login.*` existantes) : `signUp` dans AuthProvider gère
  la confirmation par email si activée côté Supabase.

### DevTools

- **Natif** : `cmd+d` sur le simulateur → menu dev Expo Go (React DevTools,
  réseau, perf…). `j` dans le terminal `expo start` ouvre le debugger.
- **Web** : React Query DevTools (inspecteur requêtes/cache) n'est monté que
  sur `Platform.OS === 'web'` (le package rend du DOM, incompatible natif).
- **URL API** : `EXPO_PUBLIC_API_URL` force l'URL (prod/staging). Sans elle,
  l'app résout `localhost` (simulateur) ou l'IP Metro (appareil physique).

> ⚠️ **Hono vs Go** : sur `main`, la migration est actée — `api.qoe.fi` →
> **Go backend-of-record** (`apps/api-go`, contrat parallèle : `/v1/feed`,
> `/v1/thoughts` en alias, users, bookmarks…), et l'API Hono (`apps/api`,
> :3002) est devenue **legacy** ("api-legacy"). Le **sunset complet de Hono**
> et les **19 tests Go** (Testcontainers Postgres réel, handlers, workers,
> gate de couverture CI) sont portés par la branche `feat/theme-toggle`
> (pas encore fusionnée sur main). En dev : Go = `:8080`, Hono legacy =
> `:3002`. Le mobile vise l'API publique via `EXPO_PUBLIC_API_URL` → en dev
> avec Go lancé : `http://localhost:8080` ; en prod : `https://api.qoe.fi`.

### Lancer sur le simulateur iOS (recommandé sur Mac)

```bash
pnpm mobile:ios
```

Boote le simulateur, installe Expo Go (uniquement la 1ʳᵉ fois) puis ouvre
l'app avec le hot reload. Metro tourne sur le port **8081**.

### Autres cibles de test

```bash
pnpm mobile:web      # version web dans le navigateur (le plus rapide pour l'UI)
pnpm mobile:android  # émulateur Android (Android Studio requis)
pnpm mobile:start    # dev server seul → QR code pour un appareil physique (même WiFi)
pnpm mobile:doctor   # diagnostic santé du projet Expo
pnpm mobile:lint     # eslint (expo lint)
pnpm mobile:typecheck
```

> 💡 L'Expo Go de l'App Store peut être en retard sur le dernier SDK. Sur un
> **iPhone physique**, si le QR code ne charge pas l'app, il faudra passer par
> un dev build (`npx expo run:ios` ou EAS) — sur le **simulateur**, ça marche
> directement. La route web (`pnpm mobile:web`) reste le test le plus simple.

---

## 🛑 Commandes d'Arrêt et Nettoyage

- **Arrêter Caddy** : `caddy stop`
- **Arrêter les bases de données** : `docker compose -f docker-compose.dev.yml down`
