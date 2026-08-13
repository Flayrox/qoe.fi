# 🚀 Guide de déploiement production — qoe.fi

> **État post-refacto** : `pnpm` (pas `npm`), source unique Prisma dans `packages/db/prisma/`,
> 11 services Docker avec 2 réseaux isolés.

---

## 📋 Pré-déploiement

### Vérification structure monorepo

```bash
# À la racine du projet
ls -la
# Tu dois voir : apps/ workers/ packages/ docker/ pnpm-workspace.yaml turbo.json
```

### Configuration Supabase (Cloud)

1. Crée un projet sur [supabase.com](https://supabase.com)
2. Active l'extension `vector` dans `Database → Extensions`
3. Note :
   - `Project URL` (ex: `https://xxx.supabase.co`)
   - `anon public` key
   - `service_role` key (⚠️ secret)
4. Configure les redirections auth : `https://qoe.fi/auth/callback`

### Configuration Stripe

1. Crée un compte sur [stripe.com](https://stripe.com)
2. Active ton compte (KYC + IBAN)
3. Note tes clés :
   - `sk_live_...` (secret)
   - `pk_live_...` (public)
   - `whsec_...` (webhook secret — à créer)
4. Crée les produits/prix pour les abonnements créateurs

### Configuration Resend

1. Crée un compte sur [resend.com](https://resend.com)
2. Vérifie ton domaine (`qoe.fi` + DKIM + DMARC)
3. Note ta clé `re_...`

### Configuration Tolgee

1. Crée un projet sur [tolgee.io](https://tolgee.io)
2. Note ta clé `tgpk_...`

---

## ⚙️ Variables d'environnement

Crée un fichier `.env.docker` à la racine (généralement situé dans `/var/www/qoe.fi/` sur le VPS) :

```bash
# === BASE DE DONNÉES (Connexion directe à Supabase DB) ===
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<Mot_de_passe_généré_par_supabase>
POSTGRES_DB=postgres

# Connexion directe à la DB sur le port 5433 (bypasse le pooler Supavisor pour les processus internes)
DATABASE_URL="postgresql://postgres:<Mot_de_passe_généré_par_supabase>@host.docker.internal:5433/postgres"
DIRECT_URL="postgresql://postgres:<Mot_de_passe_généré_par_supabase>@host.docker.internal:5433/postgres"

# === DOMAINE PRINCIPAL (sans protocole) ===
PRIMARY_DOMAIN=qoe.fi

# === SUPABASE AUTO-HÉBERGÉ (Sous-domaines dédiés) ===
# URL de l'API / Gateway Kong
NEXT_PUBLIC_SUPABASE_URL="https://admin-supabase.qoe.fi"
# Clés cryptographiques générées lors de l'initialisation de Supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# === STRIPE (paiements) - EN MODE LIVE ===
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# === RESEND (emails) ===
RESEND_API_KEY=re_...

# === OPENAI (optionnel) ===
OPENAI_API_KEY=sk-...

# === TOLGEE (i18n) ===
NEXT_PUBLIC_TOLGEE_API_KEY=tgpk_...
NEXT_PUBLIC_TOLGEE_URL=https://app.tolgee.io

# === REDIS (interne Docker) ===
REDIS_URL=redis://redis:6379

# === APP URL (pour OAuth redirects) ===
NEXT_PUBLIC_APP_URL=https://qoe.fi
```

> ⚠️ **Ne commit JAMAIS `.env.docker`**. Il est listé dans `.gitignore`.

---

## 🧪 Test en local avant prod

```bash
# Lance le stack dev complet
pnpm docker:dev

# Vérifie que :
# - http://localhost:4000 répond (qoe.fi local via Docker dev)
# - http://localhost:4040 répond (start.qoe.fi local via Docker dev)
# - http://localhost:4002/health retourne OK
```

---

## 🖥️ Déploiement sur VPS

### Prérequis VPS

- **OS** : Ubuntu 22.04 LTS (ou Debian 12)
- **RAM** : 4 GB minimum (8 GB recommandé pour la prod)
- **CPU** : 2 vCPU minimum
- **Stockage** : 40 GB SSD minimum
- **IP publique** : statique
- **Ports ouverts** : 22 (SSH), 80 (HTTP), 443 (HTTPS)

### Étape 1 : Préparer le VPS

```bash
# Connexion SSH
ssh user@ton-vps-ip

# Mise à jour
sudo apt update && sudo apt upgrade -y

# Installation Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Déconnecte-toi / reconnecte-toi pour appliquer le groupe
# Vérification
docker --version
docker compose version
```

### Étape 2 : Cloner le projet

```bash
cd /var/www  # Répertoire recommandé

# Option A : Via Git
git clone https://github.com/Flayrox/qoe.fi.git .

# Option B : Via SCP (si pas de repo public)
# Sur ton PC :
# scp -r ./qoe.fi/* user@ton-vps-ip:/var/www/qoe.fi/
```

### Étape 3 : Installer & configurer Supabase en auto-hébergé

Pour éviter les frais récurrents et garder une maîtrise souveraine des données, Supabase est hébergé localement sur le VPS dans son propre environnement Docker.

1. **Cloner le dépôt officiel Supabase** :

   ```bash
   cd /var/www
   git clone --depth 1 https://github.com/supabase/supabase.git
   cd supabase/docker
   cp .env.example .env
   ```

2. **Générer les clés cryptographiques de sécurité** :

   ```bash
   # Génère les secrets JWT, clés d'API (anon & service_role) et mots de passe système uniques
   sh utils/generate-keys.sh --update-env
   sh utils/add-new-auth-keys.sh --update-env
   ```

3. **Configurer les variables personnalisées et le serveur SMTP (Hostinger)** :
   Configure ton fichier `/var/www/supabase/docker/.env` avec les valeurs adaptées :

   ```ini
   # --- Domaines personnalisés ---
   API_EXTERNAL_URL="https://admin-supabase.qoe.fi"
   STUDIO_DEFAULT_ORGANIZATION="Qoe Admin"
   STUDIO_DEFAULT_PROJECT="qoe.fi"

   # --- Serveur SMTP Hostinger ---
   SMTP_ADMIN_EMAIL="noreply@qoe.fi"
   SMTP_HOST="smtp.hostinger.com"
   SMTP_PORT=587
   SMTP_USER="noreply@qoe.fi"
   SMTP_PASS="<Mot_de_passe_smtp>"
   SMTP_SENDER_NAME="Qoe.fi Auth"
   ```

4. **Exposer le port Postgres direct (5433)** :
   Modifie le service `db` dans `/var/www/supabase/docker/docker-compose.yml` pour mapper le port `5433` du VPS vers le port `5432` du conteneur. Cela permet à Prisma et au script de migration de l'application principale de s'y connecter directement et de manière robuste :

   ```yaml
   db:
     container_name: supabase-db
     image: supabase/postgres:17.6.1.136
     restart: unless-stopped
     ports:
       - '5433:5432'
     # ... reste de la configuration du service
   ```

5. **Démarrer les conteneurs de la stack Supabase** :
   ```bash
   docker compose up -d
   # 11 conteneurs officiels démarrent de manière isolée et s'auto-surveillent.
   ```

### Étape 4 : Configurer le Reverse Proxy Nginx & Caching de Storage

1. **Créer la configuration de cache pour les fichiers médias (Nginx NVMe Cache)** :
   Crée `/etc/nginx/conf.d/cache.conf` pour stocker localement les assets statiques issus du Storage de Supabase :

   ```nginx
   proxy_cache_path /var/cache/nginx/supabase_storage levels=1:2 keys_zone=supabase_storage_cache:10m max_size=10g inactive=24h use_temp_path=off;
   ```

2. **Configurer les serveurs virtuels Nginx (`/etc/nginx/sites-available/qoe.conf`)** :
   Nous sécurisons l'interface de gestion (Studio) par un Basic Auth Nginx (`qoe-admin:8db7e120f26ba09f`) et configurons la redirection vers Kong (API) et Caddy (App principale) :
   ```nginx
   # --- 1. Supabase API & Kong (admin-supabase.qoe.fi) ---
   server {
       server_name admin-supabase.qoe.fi;
       listen 80; listen [::]:80; # TLS géré par Caddy/Let's Encrypt de manière automatisée ou Nginx

       location /storage/v1/object/public/ {
           proxy_pass http://127.0.0.1:8000;
           proxy_cache supabase_storage_cache;
           proxy_cache_valid 200 302 1d;
           proxy_cache_valid 404 1m;
           add_header X-Proxy-Cache $upstream_cache_status;
           proxy_ignore_headers Cache-Control Set-Cookie;
       }

       location / {
           proxy_pass http://127.0.0.1:8000;
           proxy_set_header Host $host;
       }
   }

   # --- 2. Supabase Studio Dashboard (admin-studio.qoe.fi) ---
   server {
       server_name admin-studio.qoe.fi;
       listen 80; listen [::]:80;

       location / {
           auth_basic "Accès Restreint Admin";
           auth_basic_user_file /etc/nginx/.htpasswd;
           proxy_pass http://127.0.0.1:8002;
           proxy_set_header Host $host;
       }
   }

   # --- 3. Application Principale (qoe.fi / *.qoe.fi) ---
   server {
       server_name qoe.fi *.qoe.fi;
       listen 80; listen [::]:80;
       location / {
           proxy_pass http://127.0.0.1:8080; # Transmet à Caddy
           proxy_set_header Host $host;
       }
   }

   # --- 4. CDN d'Images & Stockage (cdn.qoe.fi) ---
   server {
       server_name cdn.qoe.fi;
       listen 80; listen [::]:80;

       # 🔒 Restreindre uniquement aux fichiers publics du bucket
       location /storage/v1/object/public/ {
           proxy_pass http://127.0.0.1:8000; # Redirige vers Kong Supabase
           proxy_cache supabase_storage_cache;
           proxy_cache_valid 200 302 1d;
           proxy_cache_valid 404 1m;
           add_header X-Proxy-Cache $upstream_cache_status;
           proxy_ignore_headers Cache-Control Set-Cookie;
       }

       # 🚫 Bloquer le reste pour sécuriser l'API / configuration
       location / {
           return 403;
       }
   }
   ```
   _Active le site avec `sudo ln -s /etc/nginx/sites-available/qoe.conf /etc/nginx/sites-enabled/` et redémarre Nginx : `sudo nginx -t && sudo systemctl restart nginx`._

### Étape 5 : Migrer les données de l'ancienne DB Cloud vers la DB locale

1. **Exporter le schéma public de production** :
   ```bash
   docker run --rm --network host -v /tmp:/tmp postgres:17 pg_dump "postgresql://postgres:<mdp_cloud>@db.xxx.supabase.co:5432/postgres" -n public --clean --no-owner --no-privileges -f /tmp/public_dump.sql
   ```
2. **Exporter les données d'authentification (auth) et de métadonnées de stockage (storage)** :
   ```bash
   docker run --rm --network host -v /tmp:/tmp postgres:17 pg_dump "postgresql://postgres:<mdp_cloud>@db.xxx.supabase.co:5432/postgres" -n auth --data-only --no-owner --no-privileges -f /tmp/auth_data_dump.sql
   docker run --rm --network host -v /tmp:/tmp postgres:17 pg_dump "postgresql://postgres:<mdp_cloud>@db.xxx.supabase.co:5432/postgres" -n storage --data-only --no-owner --no-privileges -f /tmp/storage_data_dump.sql
   ```
3. **Restaurer dans la nouvelle instance Supabase auto-hébergée** (en utilisant le binaire `psql` libre du conteneur) :
   ```bash
   # Activer pgvector dans le schéma public
   docker exec -i supabase-db /usr/lib/postgresql/bin/psql -U supabase_admin -d postgres -c "create extension if not exists vector with schema public;"

   # Restaurer le schéma public
   docker exec -i supabase-db /usr/lib/postgresql/bin/psql -U supabase_admin -d postgres < /tmp/public_dump.sql

   # Restaurer les tables auth & storage en ignorant temporairement les triggers de contraintes
   echo "SET session_replication_role = 'replica';" | cat - /tmp/auth_data_dump.sql > /tmp/auth_data_dump_replica.sql
   docker exec -i supabase-db /usr/lib/postgresql/bin/psql -U supabase_admin -d postgres < /tmp/auth_data_dump_replica.sql

   echo "SET session_replication_role = 'replica';" | cat - /tmp/storage_data_dump.sql > /tmp/storage_data_dump_replica.sql
   docker exec -i supabase-db /usr/lib/postgresql/bin/psql -U supabase_admin -d postgres < /tmp/storage_data_dump_replica.sql
   ```

### Étape 6 : Configurer l'environnement de l'application et lancer les conteneurs

1. **Écrire le fichier `/var/www/qoe.fi/.env.docker`** avec les secrets générés ci-dessus.
2. **Ouvrir les ports indispensables sur le VPS** :
   ```bash
   # UFW (Ubuntu)
   sudo ufw allow 22/tcp    # SSH
   sudo ufw allow 80/tcp    # HTTP
   sudo ufw allow 443/tcp   # HTTPS
   sudo ufw enable
   ```
3. **Premier déploiement du monorepo** :
   ```bash
   cd /var/www/qoe.fi
   # Build de toutes les applications (Next.js, Hono API, Workers)
   pnpm docker:prod:build

   # Lancement en arrière-plan (sans recréer de DB locale car la DB est celle de Supabase !)
   pnpm docker:prod:up
   ```

### Étape 7 : Configurer le DNS

Chez ton registrar (Cloudflare, Hostinger, OVH, etc.), pointe les entrées DNS vers l'adresse IP de ton VPS Hetzner :

| Type | Nom                | Valeur     | TTL |
| ---- | ------------------ | ---------- | --- |
| A    | `@` (qoe.fi)       | `<IP_VPS>` | 300 |
| A    | `*` (*.qoe.fi)     | `<IP_VPS>` | 300 |
| A    | `admin-supabase`   | `<IP_VPS>` | 300 |
| A    | `admin-studio`     | `<IP_VPS>` | 300 |
| A    | `cdn` (cdn.qoe.fi) | `<IP_VPS>` | 300 |

> ⚠️ Le wildcard `*` est **obligatoire** pour la gestion dynamique des sous-domaines des créateurs.

### Étape 8 : Vérifier le SSL et la connectivité

**Caddy et Nginx obtiennent les certificats Let's Encrypt de manière transparente** dès la propagation DNS complétée.

```bash
# Tester que l'API et l'authentification répondent sur les sous-domaines configurés
curl -I https://admin-supabase.qoe.fi/auth/v1/health
```

---

## ✅ Validation finale

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
# → "CN = qoe.fi" + issuer Let's Encrypt

# 5. Certificat wildcard
openssl s_client -connect start.qoe.fi:443 -servername start.qoe.fi < /dev/null 2>/dev/null | openssl x509 -noout -subject
# → CN = *.qoe.fi (ou qoe.fi, selon config Caddy)
```

---

## 📊 Monitoring

### Logs

```bash
# Logs de tous les services
pnpm docker:prod:logs

# Logs d'un service spécifique
pnpm docker:prod:logs:caddy       # Caddy (SSL)
pnpm docker:prod:logs:web         # Web (blogs créateurs)
pnpm docker:prod:logs:landing     # Landing (vitrine)
pnpm docker:prod:logs:feed        # Feed (flux lecteur + auth)
pnpm docker:prod:logs:dashboard   # Dashboard (studio créateur)
pnpm docker:prod:logs:admin       # Admin (cockpit superadmin)
pnpm docker:prod:logs:api         # API Hono
pnpm docker:prod:logs:workers     # Workers BullMQ
```

### État

```bash
pnpm docker:prod:ps       # Liste + état
pnpm docker:prod:stats    # CPU/RAM par container (via docker stats)
```

### Shell dans un container

```bash
pnpm docker:prod:shell    # Shell dans feed
pnpm docker:prod:db       # psql dans db
```

---

## 🔄 Workflow de mise à jour

```bash
# Sur ton PC : commit + push
git add .
git commit -m "feat: ..."
git push

# Sur le VPS : pull + deploy
ssh user@ton-vps-ip
cd /opt/qoe.fi
git pull
pnpm docker:prod:rebuild   # Rebuild + restart
```

---

## 🔧 Maintenance

### Restart d'un service

```bash
# Redémarrer un service Next.js spécifique
pnpm docker:prod:web         # Blogs créateurs
pnpm docker:prod:landing     # Site vitrine
pnpm docker:prod:feed        # Feed & auth
pnpm docker:prod:dashboard   # Espace créateur
pnpm docker:prod:admin       # Panel superadmin

# Redémarrer l'API ou les workers
pnpm docker:prod:api
pnpm docker:prod:workers
```

### Backup

```bash
# Backup manuel
pnpm docker:backup
# → Fichier dans /backups/qoe_YYYYMMDD_HHMMSS.sql.gz

# Cron automatique (tous les jours à 3h du matin)
ssh user@ton-vps-ip
crontab -e
# Ajoute :
0 3 * * * /opt/qoe.fi/scripts/backup-postgres.sh >> /var/log/qoefi-backup.log 2>&1
```

### Rollback

```bash
# Liste les images disponibles
docker images | grep qoefi

# Rollback web par exemple
docker compose up -d --no-deps web:<tag-précédent>
```

### Restore depuis backup

```bash
# ⚠️ DESTRUCTIF : écrase la DB actuelle
# 1. Arrêter les services qui écrivent dans la DB
docker compose stop web landing feed dashboard admin api workers

# 2. Restaurer le backup
LATEST_BACKUP=$(ls -t /backups/qoe_*.sql.gz | head -1)
gunzip -c "$LATEST_BACKUP" | docker compose exec -T db psql -U qoe -d qoe

# 3. Rollback le code
git checkout <commit-précédent>

# 4. Rebuild + restart
pnpm docker:prod:rebuild
```

---

## 🆘 Troubleshooting

### DNS ne se propage pas

```bash
# Vérifier la propagation
nslookup qoe.fi 8.8.8.8

# Si pas résolu : attendre 30 min, vérifier la config DNS
```

### SSL ne s'obtient pas

```bash
pnpm docker:prod:logs:caddy
# Cherche "acme" ou "challenge" dans les logs

# Causes possibles :
# 1. DNS pas propagé → attendre
# 2. Port 80/443 bloqué par firewall
# 3. Let's Encrypt rate-limited (max 5 certifs/semaine)
```

### Container unhealthy

```bash
# Identifier le service
pnpm docker:prod:ps

# Voir les logs
pnpm docker:prod:logs:feed
# Souvent : variable d'env manquante ou DB pas healthy
```

### DB migrations échouent

```bash
# Voir le détail
pnpm docker:prod:logs:migrate

# Reset DB (⚠️ PERTE DE DONNÉES)
docker compose down -v
pnpm docker:prod:up
```

### "Out of memory" sur le VPS

```bash
# Vérifier la conso
docker stats

# Augmenter la RAM du VPS (recommandé : 4 GB minimum)
# OU limiter les workers Node
```

---

## 📋 Checklist de déploiement

- [ ] VPS 4 GB+ avec Docker installé
- [ ] Ports 22, 80, 443 ouverts
- [ ] DNS wildcard `*.qoe.fi` → IP VPS
- [ ] `.env.docker` configuré avec toutes les clés
- [ ] `pnpm docker:prod:build` successful
- [ ] `pnpm docker:prod:up` lance tous les services
- [ ] `pnpm docker:prod:ps` montre tous les services healthy
- [ ] `https://api.qoe.fi/health` retourne 200
- [ ] `https://qoe.fi` charge (HTTP 200)
- [ ] `https://start.qoe.fi` charge
- [ ] Certificat SSL wildcard valide (Let's Encrypt)
- [ ] Backup Postgres configuré (cron)
- [ ] Stripe webhook configuré
- [ ] Supabase redirect URLs configurées

---

## 🔐 Sécurité post-déploiement

```bash
# 1. SSH : désactiver password auth, forcer clés SSH
sudo nano /etc/ssh/sshd_config
# PasswordAuthentication no
sudo systemctl restart sshd

# 2. Fail2ban (anti-bruteforce)
sudo apt install fail2ban
sudo systemctl enable fail2ban

# 3. Auto-update security patches
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# 4. Surveiller les logs SSH
sudo tail -f /var/log/auth.log
```

---

## 📖 Liens utiles

- [README.md](./README.md) — Vitrine du projet
- [GETTING_STARTED.md](./GETTING_STARTED.md) — Démarrage rapide Mac/Win
- [DEV.md](./DEV.md) — Workflow dev quotidien (3 étapes)
- [ACTIVATION.md](./ACTIVATION.md) — Comment démarrer
- [DOCKER.md](./DOCKER.md) — Architecture Docker détaillée
- [HANDOFF.md](./HANDOFF.md) — Contexte complet
- [MIGRATION.md](./MIGRATION.md) — Historique de la migration
