# 🔑 Inventaire des accès & secrets — QOE

> ⚠️ **AUCUNE valeur en clair dans ce fichier** (il est versionné dans git).
> Les valeurs réelles vivent **sur le VPS** (`159.195.110.239`) dans les fichiers
> listés ci-dessous. Pour tout re-dumper en 30 s :
>
> ```bash
> bash scripts/print-credentials.sh
> ```
>
> (ce script affiche les valeurs réelles dans ton terminal — ne pas committer sa sortie)

---

## 📋 Tableau récapitulatif

| # | Service / secret | Où ça vit (VPS) | Clé(s) | Récupération | Stockage |
|---|---|---|---|---|---|
| 1 | **PostgreSQL Supabase** (postgres) | `/var/www/supabase/docker/.env` | `POSTGRES_PASSWORD` | `grep ^POSTGRES_PASSWORD /var/www/supabase/docker/.env` | **Clair** dans le `.env` (600 root) |
| 2 | **JWT GoTrue** (signature tokens) | idem | `JWT_SECRET` | `grep ^JWT_SECRET /var/www/supabase/docker/.env` | **Clair** dans le `.env` |
| 3 | **Clés API Supabase** (anon / service_role) | idem | `ANON_KEY`, `SERVICE_ROLE_KEY` (+ `*_ASYMMETRIC`) | `grep -E "^(ANON_KEY|SERVICE_ROLE_KEY)=" …` | **Clair** (JWT HS256) |
| 4 | **Supabase Studio (dashboard)** | idem | `DASHBOARD_USERNAME`, `DASHBOARD_PASSWORD` | `grep ^DASHBOARD_ …` | **Clair** dans le `.env` |
| 5 | **DB QOE** (même postgres) | `/var/www/qoe.fi/.env.docker` | `DATABASE_URL` | `grep ^DATABASE_URL …` | **Clair** (contient le mot de passe postgres) |
| 6 | **Secret interne API↔worker** | idem | `QOE_INTERNAL_SECRET` | `grep ^QOE_INTERNAL_SECRET …` | **Clair** |
| 7 | **Meilisearch** (full-text) | idem | `MEILI_MASTER_KEY` | `grep ^MEILI_MASTER_KEY …` | **Clair** |
| 8 | **SMTP relay** (`relay@qoe.fi`) — envoi Stalwart | `.env.docker` **et** `.env` supabase | `SMTP_USER`, `SMTP_PASS` | `grep -E "^(SMTP_USER|SMTP_PASS)=" …` | **Clair côté apps** ; **hashé** côté Stalwart (RocksDB `/var/lib/stalwart`) |
| 9 | **Stalwart recovery admin** | `/etc/stalwart/stalwart.env` | `STALWART_RECOVERY_ADMIN` (`admin:<pw>`) | `grep STALWART_RECOVERY_ADMIN /etc/stalwart/stalwart.env` | **Clair** (file root, 600) |
| 10 | **Cert TLS Stalwart** (PEM) | `/etc/stalwart/certs/` | `qoe.fi.pem` / `qoe.fi.key` | `ls /etc/stalwart/certs/` | Fichiers PEM (chown `stalwart:stalwart`) |
| 11 | **Umami admin** | `.env.docker` | `UMAMI_USERNAME`, `UMAMI_PASSWORD`, `UMAMI_HASH_SALT` | `grep ^UMAMI_ …` | **Clair** dans le `.env` ; **hashé bcrypt** dans la DB umami (`user` table) |
| 12 | **Mots de passe utilisateurs QOE** | DB Supabase `auth.users` | `encrypted_password` | `docker exec supabase-db psql -U postgres -c "SELECT left(encrypted_password,7) FROM auth.users;"` | **Hashé bcrypt** (`$2a$10$`) — irrécupérable |
| 13 | ~~Caddy Basic Auth `qoe-admin`~~ | ~~Caddyfile~~ | — | — | ~~Hashé bcrypt~~ **supprimé le 01/09** (remplacé par Tailscale) |
| 14 | **Certs Let's Encrypt** (qoe.fi + SAN) | `/etc/letsencrypt/live/qoe.fi/` | fullchain/privkey | `ls /etc/letsencrypt/live/qoe.fi/` | PEM — **renouvellement automatisé** (timer certbot + hooks Caddy/Stalwart, dry-run OK 01/09) |
| 15 | **Tailscale** (tailnet `tail28842e.ts.net`) | VPS = nœud `studio` (100.117.195.127) ; dashboards admin → `admin.qoe.fi` + `studio/umami/mail.admin.qoe.fi` (Caddy + dnsmasq, §16 prep) ; fallbacks `http://100.117.195.127:3000/3001/3002/28080` | compte `belaidpourlescoursmerci@` | `tailscale status` | Identité device ; **clé d'auth révoquée le 01/09** (plus nécessaire après le join) |
| 16 | **OpenAI / Anthropic** | `.env.docker` | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | `grep ^OPENAI_API_KEY …` | **Vides pour l'instant** (pas branchés) |
| 17 | **GHCR GitHub App** | — | token d'installation 1 h | `bash scripts/ghcr-login.sh` | Minté à chaque deploy (voir §15 du prep) |

---

## ✅ Hashé vs clair — la réponse courte

| Élément | Statut |
|---|---|
| Mots de passe utilisateurs (GoTrue `auth.users`) | ✅ **Hashé** — bcrypt `$2a$10$`, irrécupérable |
| Mot de passe Umami admin (DB `user`) | ✅ **Hashé** — bcrypt `$2b$10$` |
| Compte SMTP relay chez Stalwart (RocksDB) | ✅ **Hashé** (Stalwart) — seule copie en clair = `SMTP_PASS` des `.env` |
| ~~Basic Auth Caddy qoe-admin~~ | ✅ était hashé (bcrypt `$2a$14$`, irrécupérable) — **supprimé** |
| **Tous les `.env` (JWT, postgres, meili, internal, umami, relay)** | ⚠️ **En clair par nature** — c'est le fonctionnement des env files. Protégés par perms `600` root (vérifié 01/09) |
| Clés JWT (anon/service_role) | Clair (JWT signé HS256 avec `JWT_SECRET`) — exposable côté client pour anon, **jamais** service_role |

**Donc : les secrets « utilisateur » sont hashés ; les secrets « infrastructure » sont en clair dans les `.env`
(root-only), ce qui est le standard.** Le vrai risque n'est pas le stockage mais la **rotation** (voir plus bas).

---

## 🧯 En cas d'oubli / de perte

- **Mot de passe utilisateur QOE** → impossible à récupérer (bcrypt). Réinitialiser via GoTrue
  (admin : API `admin/users` + reset) ou via le flow « mot de passe oublié » (SMTP GoTrue).
- **Supabase Studio (dashboard)** → `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD` dans le `.env` supabase
  (pas de hash — c'est l'auth du dashboard studio).
- **Stalwart recovery admin** → `STALWART_RECOVERY_ADMIN` dans `/etc/stalwart/stalwart.env`
  (format `admin:<mot-de-passe>`, sert aussi d'auth Basic pour l'admin UI et les appels JMAP).
- **Accès dashboards via Tailscale** → `https://admin.qoe.fi` (admin plateforme) et
  `https://studio/umami/mail.admin.qoe.fi` (résolus via le split DNS Tailscale →
  nameserver `100.117.195.127`, domaine `admin.qoe.fi` — action owner requise dans la
  console Tailscale). Fallbacks sans split DNS : `http://100.117.195.127:3000`
  (supabase), `:3001` (umami), `:3002` (admin), `:28080` (stalwart).

---

## 🔁 Rotation & hygiène (recommandations)

- [x] **Clé d'auth Tailscale révoquée** le 01/09 (elle avait circulé en clair) — le nœud reste dans le tailnet.
- [x] **Ajouter le nameserver Tailscale** (Console → DNS → Nameservers) : `100.117.195.127`
      restreint au domaine `admin.qoe.fi` — requis pour `admin.qoe.fi` + `studio/umami/mail.admin.qoe.fi`. ✅ déjà en place (vérifié 02/09 : nslookup → 100.117.195.127 + dig @100.117.195.127 OK).
- [ ] **Rotation** : `POSTGRES_PASSWORD`, `JWT_SECRET`, `MEILI_MASTER_KEY`, `QOE_INTERNAL_SECRET`,
      `SMTP_PASS` relay, `DASHBOARD_PASSWORD`, `UMAMI_PASSWORD` — dans un vault (1Password/Pass) ;
      les `.env` ne sont PAS un vault.
- [ ] `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` : générer uniquement quand les LLM seront branchés.
- [ ] Vérifier les perms des `.env` après chaque transfert manuel :
      `ls -l /var/www/qoe.fi/.env.docker` doit être `-rw------- root root`
      (piège : un tar depuis macOS ramène un uid 501 — corrigé le 01/09, à surveiller).
- [ ] À l'échéance **2026-11-29** : renouvellement du cert Let's Encrypt qoe.fi (voir §13/§14 du prep).
