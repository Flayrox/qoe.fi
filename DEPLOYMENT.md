# 🚀 Guide de déploiement production — qoe.fi

> **État post-refacto** : `pnpm` (pas `npm`), source unique Prisma dans `packages/db/prisma/`,
> 8 services Docker avec 2 réseaux isolés.

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

Crée un fichier `.env.docker` à la racine :

```bash
# === POSTGRES (utilisé en interne Docker) ===
POSTGRES_USER=qoe
POSTGRES_PASSWORD=<Génère_un_mdp_fort_64_chars>
POSTGRES_DB=qoe
POSTGRES_PORT=5432

# === DOMAINE PRINCIPAL (sans protocole) ===
PRIMARY_DOMAIN=qoe.fi

# === SUPABASE (Auth externe) ===
NEXT_PUBLIC_SUPABASE_URL=https://ton-projet.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

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

> ⚠️ **Ne commit JAMAIS `.env.docker`**. Il est dans `.gitignore` par défaut.

---

## 🧪 Test en local avant prod

```bash
# Lance le stack dev complet
pnpm docker:dev

# Vérifie que :
# - http://localhost:4000 répond (qoe.fi local via Docker dev)
# - http://localhost:4001 répond (start.qoe.fi local via Docker dev)
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
cd /opt  # ou /var/www, ou /home/user

# Option A : Via Git
git clone https://github.com/ton-user/qoe.fi.git .

# Option B : Via SCP (si pas de repo)
# Sur ton PC :
# scp -r ./qoe.fi/* user@ton-vps-ip:/opt/qoe.fi/
```

### Étape 3 : Configurer l'env
```bash
cd /opt/qoe.fi
cp .env.docker.example .env.docker
nano .env.docker
# Colle les valeurs préparées plus haut
```

### Étape 4 : Ouvrir les ports
```bash
# UFW (Ubuntu)
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (redirect HTTPS)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# Vérifier
sudo ufw status
```

### Étape 5 : Premier déploiement
```bash
# Build toutes les images
pnpm docker:prod:build

# Lance en arrière-plan
pnpm docker:prod:up

# Vérifier
pnpm docker:prod:ps
# → Tous les services doivent être "healthy"
```

### Étape 6 : Initialiser la base de données
```bash
# Le service `migrate` s'exécute one-shot au démarrage
# Pour seed :
pnpm docker:seed
```

### Étape 7 : Configurer le DNS

Chez ton registrar (Cloudflare, OVH, Gandi, etc.) :

| Type | Nom | Valeur | TTL |
|------|-----|--------|-----|
| A | `@` | `<IP_VPS>` | 300 |
| A | `*` | `<IP_VPS>` | 300 |
| AAAA | `@` | `<IP_V6_VPS>` | 300 (optionnel) |
| AAAA | `*` | `<IP_V6_VPS>` | 300 (optionnel) |

> ⚠️ Le wildcard `*` est **obligatoire** pour les sous-domaines `*.qoe.fi`.

### Étape 8 : Vérifier le SSL
**Caddy obtient les certificats Let's Encrypt automatiquement** dès que le DNS est propagé (5-30 min).

```bash
# Vérifier la propagation
nslookup qoe.fi 8.8.8.8
nslookup start.qoe.fi 8.8.8.8

# Tu dois voir "CN = qoe.fi" et un issuer Let's Encrypt
openssl s_client -connect qoe.fi:443 -servername qoe.fi < /dev/null 2>/dev/null | openssl x509 -noout -subject
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
pnpm docker:prod:logs:web         # Web app
pnpm docker:prod:logs:console     # Console app
pnpm docker:prod:logs:api         # API
pnpm docker:prod:logs:workers     # Workers BullMQ
```

### État
```bash
pnpm docker:prod:ps       # Liste + état
pnpm docker:prod:stats    # CPU/RAM par container (via docker stats)
```

### Shell dans un container
```bash
pnpm docker:prod:shell    # Shell dans console
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
# Redémarrer uniquement web
pnpm docker:prod:web

# Redémarrer uniquement console
pnpm docker:prod:console

# Redémarrer uniquement api
pnpm docker:prod:api

# Redémarrer uniquement workers
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
docker compose stop web console api workers

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
pnpm docker:prod:logs:console
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
- [ACTIVATION.md](./ACTIVATION.md) — Comment démarrer
- [DOCKER.md](./DOCKER.md) — Architecture Docker détaillée
- [HANDOFF.md](./HANDOFF.md) — Contexte complet
- [MIGRATION.md](./MIGRATION.md) — Historique de la migration
