# 🚀 Guide de Démarrage Multi-Plateforme (macOS & Windows) — qoe.fi

Bienvenue dans le guide de démarrage rapide de `qoe.fi`. Ce document t'explique comment faire fonctionner le projet sur **macOS** (quand tu es en déplacement) et sur **Windows** (à la maison), en utilisant le **workflow hybride** (le plus performant et le plus simple).

---

## 💡 Le Workflow Hybride : Pourquoi c'est le meilleur choix ?

Plutôt que de faire tourner toute l'application (y compris Node.js et Next.js) dans Docker, nous utilisons le mode hybride :
1. **Docker** gère uniquement les bases de données et services de fond : **PostgreSQL (avec pgvector)** et **Redis**.
2. **Ton système hôte (Mac ou Windows)** exécute directement les serveurs de développement Node.js (Next.js pour le front, Hono pour l'API).

### 🍏 Pourquoi c'est parfait pour macOS ?
* **Vitesse Apple Silicon (M1/M2/M3)** : Next.js s'exécute nativement et compile à la vitesse de l'éclair sans passer par une machine virtuelle Linux lente.
* **Économie de batterie** : Zéro polling de fichiers dans Docker. Le rafraîchissement à chaud (Hot Module Replacement) utilise le système de fichiers natif de ton Mac.
* **Ressources préservées** : Tu n'as pas besoin d'allouer 4 Go à 8 Go de RAM à Docker Desktop juste pour faire tourner Node.js.

---

## 🛠️ Prérequis (À installer une seule fois)

### Sur macOS
1. **Homebrew** (le gestionnaire de paquets pour Mac) : 
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```
2. **Node.js 20+** et **pnpm 9+** :
   ```bash
   brew install node pnpm
   ```
3. **Docker** :
   * Installe [Docker Desktop pour Mac (Apple Chip ou Intel)](https://www.docker.com/products/docker-desktop/)
   * *Alternative Premium (Recommandée sur Mac)* : [OrbStack](https://orbstack.dev/) — Une alternative à Docker Desktop extrêmement légère, rapide, et très douce sur la batterie de ton Mac.

### Sur Windows
1. **Node.js 20+** et **pnpm 9+** (via le site officiel ou ton terminal).
2. **Docker Desktop** pour Windows (avec WSL2 activé).

> [!WARNING]
> Si tu as déjà lancé la stack complète par le passé, tes conteneurs Node (`api`, `migrate`, etc.) tournent peut-être encore et consomment énormément de CPU/RAM (comme illustré par exemple avec `api` à 1.3 Go de RAM et `migrate` à 1.6 Go). 
> Avant de continuer, clique sur l'icône **Corbeille** (Delete) à côté du groupe `qoefi-dev` dans Docker Desktop pour tout nettoyer et libérer la mémoire de ton PC.

---

## 🏁 Démarrage rapide (5 étapes)

Fais ces étapes dans ton terminal sur ton Mac ou sur ton Windows :

### 1. Cloner le dépôt et entrer dans le dossier
```bash
git clone <url-du-repo>
cd qoe.fi
```

### 2. Installer les dépendances du monorepo
```bash
pnpm install
```

### 3. Configurer l'environnement local
Copie le template de variables d'environnement à la racine du projet :
```bash
cp .env.docker.example .env
```
*(Sur Windows, tu peux utiliser `copy .env.docker.example .env` ou le faire via ton explorateur).*
> [!TIP]
> Ouvre le fichier `.env` nouvellement créé et configure tes clés privées (Supabase, Stripe, etc.).

### 4. Lancer les bases de données dans Docker
Démarre uniquement PostgreSQL et Redis en arrière-plan :
```bash
docker compose -f docker-compose.dev.yml up -d db redis
```
*Vérifie que les conteneurs tournent bien avec `docker compose -f docker-compose.dev.yml ps`.*

### 5. Générer le client Prisma et lancer le serveur de dev
```bash
pnpm prisma:generate
pnpm dev
```

C'est tout ! **Turborepo** va lancer en parallèle :
* ⚛️ **Landing** (`start.qoe.fi` local) sur : http://localhost:3040
* 📰 **Feed** (`qoe.fi` local) sur : http://localhost:3010
* 🎨 **Dashboard** (`dashboard.qoe.fi` local) sur : http://localhost:3020
* 🛡️ **Admin** (`admin.qoe.fi` local) sur : http://localhost:3030
* 🌐 **Web** (`*.qoe.fi` local) sur : http://localhost:3001
* 🔌 **API** (`api.qoe.fi` local) sur : http://localhost:3002

---

## 🐘 Commandes utiles pour la Base de Données

Puisque ta base de données tourne dans Docker, voici comment interagir avec elle :

* **Lancer l'interface graphique Prisma Studio** (pour voir et éditer tes tables dans ton navigateur) :
  ```bash
  pnpm prisma:studio
  # Ouvre http://localhost:5555
  ```
* **Appliquer les migrations de base de données** (si le schéma change) :
  ```bash
  pnpm prisma:migrate
  ```
* **Insérer des fausses données de test (Seed)** :
  ```bash
  pnpm prisma:seed
  ```
* **Arrêter les bases de données** :
  ```bash
  docker compose -f docker-compose.dev.yml down
  ```

---

## ☁️ Déploiement sur VPS : Pourquoi c'est beaucoup plus simple ?

Ne t'inquiète pas pour le déploiement sur ton VPS Linux, **c'est en fait beaucoup plus simple et stable qu'en local** ! 

1. **Docker natif sous Linux** : Contrairement à Windows ou macOS, Docker s'exécute nativement sous Linux. Il n'y a pas de couche de virtualisation (comme WSL2 ou hyperviseur macOS). C'est extrêmement rapide, stable et léger.
2. **Pas de montage de fichiers locaux (bind mounts)** : En production, Docker n'a pas besoin de surveiller tes fichiers locaux pour le Hot-Reload. Le fichier `Dockerfile` de production compile tes applications une bonne fois pour toutes sous forme d'images autonomes (standalone).
3. **Caddy s'occupe de TOUT pour le SSL** : Ton reverse proxy de production, **Caddy**, gère automatiquement la création, le renouvellement et l'attribution des certificats SSL (HTTPS) gratuits via Let's Encrypt pour ton domaine (`qoe.fi`) et tous tes sous-domaines (`*.qoe.fi`, `dashboard.qoe.fi`). Tu n'as aucune configuration complexe à faire.

Pour déployer sur ton VPS, il te suffira de :
* Installer Docker sur ton VPS.
* Cloner le projet et configurer ton fichier `.env.docker`.
* Lancer la commande de build et démarrage de production :
  ```bash
  pnpm docker:prod:build
  pnpm docker:prod:up
  ```
* Pointer tes DNS chez ton registrar (comme Cloudflare ou OVH) vers l'adresse IP de ton VPS. Caddy s'occupera d'activer le HTTPS sécurisé en quelques secondes.
