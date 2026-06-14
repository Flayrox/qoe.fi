# 🚀 Guide de déploiement production — qoe.fi

> Checklist complète pour déployer qoe.fi sur ton VPS pour la première fois.

---

## 📑 Table des matières

1. [Prérequis](#-prérequis)
2. [Préparation locale](#-préparation-locale)
3. [Setup du VPS](#-setup-du-vps)
4. [Configuration DNS](#-configuration-dns)
5. [Premier déploiement](#-premier-déploiement)
6. [Vérification post-déploiement](#-vérification-post-déploiement)
7. [Mises à jour futures](#-mises-à-jour-futures)
8. [Rollback](#-rollback)
9. [Troubleshooting](#-troubleshooting)

---

## ✅ Prérequis

### Sur ton PC
- Git installé
- Accès SSH configuré sur ton VPS
- Tes clés API prêtes :
  - [ ] **Supabase** : URL du projet + anon key + service_role key
  - [ ] **Stripe** : secret_key (sk_live_...) + webhook_secret (whsec_...)
  - [ ] **Resend** (ou autre SMTP) : API key pour les emails
  - [ ] **OpenAI** (optionnel) : pour AI embeddings/recos
  - [ ] **Tolgee** : API key pour l'i18n

### Sur ton VPS
- Docker + Docker Compose installés
- Au moins 4 GB RAM (recommandé : 8 GB)
- 20 GB d'espace disque (DB + images Docker)
- Ports 80 et 443 ouverts (HTTP/HTTPS)
- Un nom de domaine que tu contrôles

---

## 🖥️ Préparation locale

### 1. Vérifier que tout est en place

```bash
# À la racine du projet
ls -la
# Tu dois voir : apps/ workers/ packages/ docker/ pnpm-workspace.yaml turbo.json
```

### 2. Copier et éditer le fichier d'env

```bash
cp .env.docker.example .env.docker
nano .env.docker
```

### 3. Remplir les valeurs critiques

```bash
# === POSTGRES (utilisé en interne Docker) ===
POSTGRES_USER=qoe
POSTGRES_PASSWORD=$(openssl rand -base64 32)  # 🔐 Génère un mot de passe FORT
POSTGRES_DB=qoe

# === DOMAINE PRINCIPAL (sans protocole) ===
PRIMARY_DOMAIN=qoe.fi

# === SUPABASE (Auth externe) ===
NEXT_PUBLIC_SUPABASE_URL=https://ton-projet.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# === STRIPE (paiements) - EN MODE LIVE ===
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# === RESEND (emails) ===
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@qoe.fi

# === OPENAI (optionnel) ===
OPENAI_API_KEY=sk-...

# === TOLGEE (i18n) ===
NEXT_PUBLIC_TOLGEE_API_KEY=tgpk_...
NEXT_PUBLIC_TOLGEE_API_URL=https://app.tolgee.io
```

> ⚠️ **Ne jamais commiter `.env.docker`** — il est dans `.gitignore`.

### 4. Tester en local (optionnel mais recommandé)

```bash
# Lance le stack dev complet
npm run docker:dev

# Vérifie que :
# - http://localhost:3000 répond (qoe.fi local)
# - http://localhost:3001 répond (start.qoe.fi local)
# - http://localhost:3002/health retourne OK
```

---

## 🌍 Setup du VPS

### 1. Connexion SSH

```bash
ssh user@ton-vps-ip
```

### 2. Installation Docker (si pas déjà fait)

```bash
# Mise à jour des paquets
sudo apt update && sudo apt upgrade -y

# Installation Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Ajout de ton user au groupe docker (pour ne pas avoir à faire sudo)
sudo usermod -aG docker $USER
newgrp docker

# Vérification
docker --version
docker compose version
```

### 3. Création du dossier de l'app

```bash
sudo mkdir -p /opt/qoe.fi
sudo chown $USER:$USER /opt/qoe.fi
cd /opt/qoe.fi
```

### 4. Clone du code

```bash
# Option A : Via Git
git clone https://github.com/ton-user/qoe.fi.git .

# Option B : Via SCP (si pas de repo)
# Sur ton PC :
# scp -r ./qoe.fi/* user@ton-vps-ip:/opt/qoe.fi/
```

### 5. Création de l'env de production

```bash
cd /opt/qoe.fi
nano .env.docker
# Colle les valeurs préparées plus haut
```

> 🔐 **Sécurité** : restreint les permissions de `.env.docker` :
```bash
chmod 600 .env/docker
```

### 6. Ouverture des ports (firewall)

```bash
# UFW (Ubuntu)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp   # SSH
sudo ufw enable

# Vérifier
sudo ufw status
```

> Si tu utilises un autre firewall (iptables, firewalld), adapte.

---

## 🌐 Configuration DNS

Connecte-toi à ton registrar (OVH, Cloudflare, Gandi, etc.) et ajoute :

### Records A

| Type | Host | Value | TTL |
|------|------|-------|-----|
| A | @ | `IP_DE_TON_VPS` | 3600 |
| A | www | `IP_DE_TON_VPS` | 3600 |
| A | * | `IP_DE_TON_VPS` | 3600 (wildcard pour tenants) |
| A | start | `IP_DE_TON_VPS` | 3600 |
| A | dashboard | `IP_DE_TON_VPS` | 3600 |
| A | admin | `IP_DE_TON_VPS` | 3600 |
| A | api | `IP_DE_TON_VPS` | 3600 |

### Vérification

```bash
# Sur ton PC ou VPS
nslookup qoe.fi
dig start.qoe.fi +short
```

> ⏱️ La propagation peut prendre 5-30 min, parfois jusqu'à 48h (rare).

### ⚠️ Cloudflare (optionnel mais recommandé)

Si tu utilises Cloudflare comme DNS :
1. Mets le proxy **activé** (icône orange) pour avoir le WAF
2. Cloudflare gère alors le HTTPS, Caddy utilise HTTP interne
3. Mais pour `*.qoe.fi` wildcard, le proxy marche bien aussi

---

## 🚀 Premier déploiement

### 1. Lancer le script de déploiement

```bash
cd /opt/qoe.fi
bash scripts/deploy.sh
```

> Le script va :
> 1. Backup de la DB
> 2. Pull des changements
> 3. Build des images (5-10 min au premier build)
> 4. Démarrage de tous les services
> 5. Health checks

### 2. Suivre les logs

```bash
# En parallèle, dans un autre terminal SSH
cd /opt/qoe.fi
npm run docker:prod:logs
```

### 3. Status des containers

```bash
npm run docker:prod:ps
```

Tu dois voir 8 services en status `Up` ou `healthy` :

```
NAME                 STATUS              PORTS
qoefi-caddy          Up (healthy)        0.0.0.0:80->80, 443->443
qoefi-web            Up (healthy)
qoefi-console        Up (healthy)
qoefi-api            Up (healthy)
qoefi-workers        Up
qoefi-db             Up (healthy)
qoefi-redis          Up (healthy)
qoefi-migrate        Exited (0)          (normal : one-shot)
```

---

## ✅ Vérification post-déploiement

### Tests de base

```bash
# 1. Health check API
curl -I https://api.qoe.fi/health
# → 200 OK, {"status":"ok"}

# 2. Landing accessible
curl -I https://start.qoe.fi
# → 200 OK

# 3. Home (redirige selon auth)
curl -I https://qoe.fi
# → 200 OK (ou 307 redirect vers /login)

# 4. SSL valide
openssl s_client -connect qoe.fi:443 -servername qoe.fi < /dev/null 2>/dev/null | openssl x509 -noout -subject
# → Tu dois voir "CN = qoe.fi" et un issuer Let's Encrypt

# 5. Certificat wildcard
openssl s_client -connect start.qoe.fi:443 -servername start.qoe.fi < /dev/null 2>/dev/null | openssl x509 -noout -subject
# → CN = *.qoe.fi (ou qoe.fi, selon config Caddy)
```

### Tests fonctionnels

1. **Landing** : ouvre https://start.qoe.fi dans un navigateur
2. **Inscription** : va sur https://qoe.fi et inscris-toi
3. **Feed** : connecté, tu dois voir le feed (vide si première visite)
4. **Admin** : connecte-toi en superadmin, vérifie https://admin.qoe.fi
5. **Tenant** : un créateur doit pouvoir personnaliser son `*.qoe.fi`

### Vérification des logs

```bash
# Logs de tous les services
npm run docker:prod:logs

# Logs d'un service spécifique
npm run docker:prod:logs:caddy
```

---

## 🔄 Mises à jour futures

### Workflow simple

```bash
# Sur ton PC : commit + push
git add .
git commit -m "feat: nouvelle feature"
git push origin main

# Sur le VPS : pull + deploy
ssh user@ton-vps-ip
cd /opt/qoe.fi
bash scripts/deploy.sh
```

### Redémarrer un seul service (après un fix rapide)

```bash
# Redémarrer uniquement web
npm run docker:prod:web

# Redémarrer uniquement console
npm run docker:prod:console
```

### Rebuild complet (changement de deps)

```bash
npm run docker:prod:rebuild
```

---

## ↩️ Rollback

Si un déploiement casse quelque chose, voici comment revenir en arrière.

### Rollback rapide (image précédente)

```bash
# Liste les images disponibles
docker images | grep qoefi

# Rollback web par exemple
docker compose up -d --no-deps web:<tag-précédent>
```

### Rollback complet (depuis backup DB)

```bash
# ⚠️ DESTRUCTIF : écrase la DB actuelle
# 1. Arrêter les services qui écrivent dans la DB
docker compose stop web console api workers

# 2. Restaurer le backup
LATEST_BACKUP=$(ls -t /backups/qoe_*.sql.gz | head -1)
docker exec -i qoefi-db psql -U qoe -d qoe < <(gunzip -c "$LATEST_BACKUP")

# 3. Rollback le code
git checkout <commit-précédent>

# 4. Rebuild + restart
npm run docker:prod:rebuild
```

> 💡 **Astuce** : toujours tester les déploiements en **staging** d'abord si possible.

---

## 🆘 Troubleshooting

### "DNS ne résout pas"

```bash
# Vérifier la propagation
nslookup qoe.fi 8.8.8.8
dig qoe.fi @8.8.8.8

# Si pas résolu : attendre 30 min, vérifier la config DNS
```

### "Caddy ne peut pas obtenir le certificat"

```bash
npm run docker:prod:logs:caddy
# Cherche "acme" ou "challenge" dans les logs

# Causes possibles :
# 1. DNS pas propagé → attendre
# 2. Port 80/443 bloqué par firewall
# 3. Let's Encrypt rate-limited (max 5 certifs/semaine)
```

### "Container restart en boucle"

```bash
# Identifier le service
docker compose ps

# Voir les logs
docker compose logs console

# Souvent : variable d'env manquante ou DB pas healthy
```

### "Out of memory"

Augmente la RAM du VPS OU réduis les `deploy.resources.limits` dans `docker-compose.yml`.

### "Migration failed"

```bash
# Voir le détail
docker compose logs migrate

# Reset DB (⚠️ PERTE DE DONNÉES)
docker compose down -v
docker compose up migrate
```

---

## 📋 Checklist finale

Avant de dire "c'est en prod !", vérifie :

- [ ] `.env.docker` rempli avec des **vraies clés** (pas sk_test, pas dev)
- [ ] DNS résolu sur l'IP du VPS
- [ ] `npm run docker:prod:ps` montre tous les services healthy
- [ ] `https://api.qoe.fi/health` retourne 200
- [ ] `https://start.qoe.fi` charge en < 3s
- [ ] SSL valide (pas d'erreur dans le navigateur)
- [ ] Backups cron configurés
- [ ] Monitoring (Sentry / Uptime Kuma) configuré
- [ ] Cloudflare devant (optionnel mais recommandé)

---

**Tu as terminé ! 🎉** Tu peux maintenant partager ton URL à tes premiers utilisateurs.

Questions ? Relis [DOCKER.md](./DOCKER.md) ou [MIGRATION.md](./MIGRATION.md).
