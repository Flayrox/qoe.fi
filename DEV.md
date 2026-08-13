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

---

## 🛑 Commandes d'Arrêt et Nettoyage

- **Arrêter Caddy** : `caddy stop`
- **Arrêter les bases de données** : `docker compose -f docker-compose.dev.yml down`
