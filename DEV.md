# ⚡ Démarrage Rapide du Dev Local — qoe.fi

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
*(Caddy tourne en tâche de fond et libère ton terminal).*

### 3. Lancer les serveurs de dev (Natif)
Démarre toutes les applications Next.js et l'API Hono en parallèle :
```bash
pnpm dev
```

---

## 🌐 URLs Utiles en Local

Une fois tout démarré, accède directement à tes applications via les domaines locaux :
* **Espace Feed / Lecteur** : [http://localhost](http://localhost)
* **Dashboard Créateur** : [http://dashboard.localhost](http://dashboard.localhost)
* **Administration Générale** : [http://admin.localhost](http://admin.localhost)
* **Landing Vitrine** : [http://start.localhost](http://start.localhost)
* **API Hono** : [http://api.localhost](http://api.localhost)
* **Prisma Studio (GUI)** : [http://localhost:5555](http://localhost:5555)

---

## 🛑 Commandes d'Arrêt et Nettoyage

* **Arrêter Caddy** : `caddy stop`
* **Arrêter les bases de données** : `docker compose -f docker-compose.dev.yml down`
