# 🧾 Formalités à préparer AVANT le déploiement sur le VPS

> **Objectif** : tout ce qui doit être provisionné, réservé ou configuré **en amont** du jour J —
> comptes tierces, clés API, URLs de callback/webhook, secrets, DNS, SMTP… — pour ne rien
> chercher en pleine bascule.
>
> Ce doc **complète** `docs/DEPLOYMENT.md` (procédure technique/`bootstrap.sh`, réseaux Docker,
> pièges) et `docs/AUTH_PRODUCTION_CHECKLIST.md` (auth). Il ne répète pas la mécanique Docker ;
> il liste **quels comptes/clés/URLs tu dois détenir** avant de lancer le déploiement.

---

## 0️⃣ La règle d'or

1. **Le repo n'est pas public** → prévoir dès maintenant le moyen de transférer le code sur le
   VPS (`tar | ssh`, ou pousser sur GitHub en privé). Pas le jour J.
2. **`.env.docker` diverge de `.env.docker.example`** (vestiges SENTRY/GrowthBook dans l'exemple).
   La liste de référence **réelle** est dans [`docs/DEPLOYMENT.md` → §Variables](./DEPLOYMENT.md). Renseigne-la AVANT.
3. **Un secret exposé pendant le debug = rotation obligatoire** avant la mise en prod.
4. **Garde les clés hors Git** : `.env`, `.env.docker`, clés de signing Supabase
   (`signing_keys.json`), certs Let's Encrypt → jamais commités.

---

## 1️⃣ 📋 Tableau récapitulatif des comptes / clés tierces

| Service | Usage dans le projet | Où l'obtenir | Clé / identifiant requis |
|---|---|---|---|
| **Domaine** `qoe.fi` | Identité + DNS de tout le stack | Registrar actuel (Hetzner) / **Netcup** (transfert DNS décidé) | Zone DNS + NS + compte |
| **Supabase self-hosted** | DB + Auth + Storage + Realtime | Le stack Supabase dans `/var/www/supabase` | voir §Auth |
| **Google OAuth** | Connexion sociale (seul provider activé dans `supabase/config.toml`) | console.cloud.google.com | `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `_SECRET` |
| **SMTP (GoTrue)** | Emails d'auth : confirmation, reset, magic link, invite | **self-hosté** (Postfix/OpenDKIM sur le VPS) | host, port, user, pass, from |
| **Mailer sécurité** | Emails **transactionnels de sécurité** (alerte login, mdp, archive RGPD) | **self-hosté** — le code pointe Resend, **à migrer en SMTP** (§4) | `SMTP_*` + `EMAIL_FROM` |
| **Newsletter créateurs** | Envoi de masse aux abonnés | **self-hosté** — adaptateur `EmailProvider` à écrire dans le worker (§4) | `EMAIL_PROVIDER` + `SMTP_*` |
| **Jina / Embedding** | Recherche sémantique + recommandations (inférence **locale**) | Téléchargé au bootstrap | **aucune clé** — juste le modèle `jina-embeddings-v3-Q8_0.gguf` (≈600 Mo) + `EMBEDDING_URL` |
| **OpenAI** | IA (résumés, image analysis, Supabase Studio AI) | platform.openai.com | `OPENAI_API_KEY` |
| **Anthropic** | IA (rédaction) | console.anthropic.com | `ANTHROPIC_API_KEY` |
| **Umami** | Analytics self-hosté | Créé dans le stack | user admin + password + `UMAMI_HASH_SALT` + `NEXT_PUBLIC_UMAMI_WEBSITE_ID` |
| **Meilisearch** | Full-text search (interne) | Générable | `MEILI_MASTER_KEY` |
| **Stripe** | Paiements créateurs | dashboard.stripe.com | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — ⚠️ **pas encore en place** : tout est à créer le jour où on l'active (voir §8) |
| **VPS / hébergeur** | Tout le stack | Netcup (Debian 13, 4 cœurs / 8 Go) | accès root, IP, PTR/reverse DNS |

> ⚠️ **GrowthBook / Sentry / PostHog / Tolgee** : présents dans `.env` de dev et/ou
> `config.toml` mais **pas requis en prod** (SENTRY_DSN, GROWTHBOOK_*, NEXT_PUBLIC_POSTHOG_*,
> NEXT_PUBLIC_TOLGEE_*) → laisser vide sauf si tu en as vraiment besoin.

---

## 2️⃣ 🌍 Domaine & DNS

> ✅ **État : le DNS pointe déjà vers le nouveau VPS** (Netcup). La zone est recréée chez
> Netcup, les NS sont pointés, les records A/wildcard mènent à l'IP du VPS. Il reste à
> vérifier la propagation (et le TTL à 300 s) avant la bascule TLS.

| Action | Détail |
|---|---|
| Vérifier la propagation | `dig +short A qoe.fi` depuis plusieurs points (`dig @8.8.8.8`) |
| Records **A** (TTL 300 s) | `qoe.fi`, `www`, `hi`, `api`, `studio`, `admin`, `umami`, `auth`, `cdn`, `base.admin`, `*` (wildcard → tenants) → IP du VPS |
| MX / SPF / TXT mail | **ne pas toucher** (mail chez Hostinger) |
| Google site verification TXT | `5G2LP8qdCURCY_GzijCkVe7CaXxsEDGr73pl_II-0fM` |

**PTR / reverse DNS** + ping SPF : à faire chez Netcup **après** le déploiement (réputation
mail), sinon les emails partent en spam.

---

## 3️⃣ 🔐 Auth — la liste d'amont la plus sensible

### Supabase self-hosted — env à fournir au stack (`.env` dans `/var/www/supabase/docker`)

Secrets **à générer** (base fraîche) — `openssl rand -base64 32` :

| Variable | Contrainte |
|---|---|
| `JWT_SECRET` | ≥ 32 chars base64 |
| `ANON_KEY` / `SERVICE_ROLE_KEY` | JWT signés avec `JWT_SECRET` (claims `role`, `iss=supabase`) |
| `SECRET_KEY_BASE` | ≥ 32 chars |
| `SIGNING_KEY` | clé de rotation des refresh tokens |
| `REALTIME_DB_ENC_KEY` | **exactement 16 caractères** (AES-128) sinon realtime restart en boucle ⚠️ |
| Storage encryption key | pour les objets storage |
| Clés `anon`/`service_role` | à reporter dans `.env.docker` racine |

> Mode d'auth : **legacy HS256**. Ne pas remplir `SUPABASE_PUBLISHABLE_KEY` /
> `SUPABASE_SECRET_KEY` (= clés anon/service_role) → doublons qui font planter Kong
> (`keyauth_credentials declared twice`). Voir `docs/DEPLOYMENT.md` §Leçon n°2.

### OAuth Google (⚠️ encore en phase de TEST)

- ⚠️ **Google n'est pas opérationnel** : il est désactivé par défaut et ne doit être activé
  qu'une fois le consent screen passé en **Production** et le callback testé.
- **OAuth consent screen** → application de type **Production** (pas "Testing") sinon tokens de 7 j.
- Enregistrer l'URL de callback **exacte** :
  `https://auth.qoe.fi/auth/v1/callback`
- Autoriser aussi les origines (`https://qoe.fi`, `https://*.qoe.fi`).
- Reporter dans le stack Supabase : `GOOGLE_CLIENT_ID` / `GOOGLE_SECRET` → consommés par
  `SUPABASE_AUTH_EXTERNAL_GOOGLE_*`.
- `skip_nonce_check = false` en prod (déjà le cas dans `config.toml`).
- `email_optional = false`.
- ⚠️ **Piège GoTrue** : les providers OAuth se configurent dans le stack Supabase
  (env `GOTRUE_EXTERNAL_GOOGLE_ENABLED`…) — une désactivation **effective** côté GoTrue
  exige un restart du container auth. C'est pourquoi on ne touche pas au stack pour un
  toggle : on coupe l'affichage + le flux applicatif.

### 🎛️ Toggle des méthodes de connexion depuis l'admin (AUTH_METHODS)

La clé **`AUTH_METHODS`** (SystemConfig, JSON `{google, apple, password, magicLink}`) pilote
le formulaire de login :

- **Admin** → `admin.qoe.fi/admin/config` → section « Méthodes de connexion » : toggles
  Google / Apple / Mot de passe / Lien magique (superadmin).
- **Lecture** : le formulaire (`LoginFormBento`) charge `GET /v1/home/config` et n'affiche
  que les méthodes activées. Clé absente/invalide → tout activé (fallback sûr).
- **Défaut seedé** : `{"google":false,"apple":false,"password":true,"magicLink":true}`
  (Google/Apple coupés tant qu'ils ne sont pas opérationnels).
- ⚠️ Ce toggle contrôle l'**affichage et le flux applicatif** — il ne coupe pas le provider
  dans GoTrue. Pour une coupure dure, désactiver le provider dans le stack Supabase.

### GoTrue — `site_url` / redirects (PROD !)

`supabase/config.toml` local pointe vers `http://lvh.me:3010` + `http://*.lvh.me:*`.
En prod le stack self-hosté doit exposer **l'URL réelle** :
`site_url = https://qoe.fi`, `additional_redirect_urls = ["https://qoe.fi/**", "https://*.qoe.fi/**"]`
et **retirer** les URLs HTTP locales de la allow-list. Cookie partagé sur **`.qoe.fi`**
(`Secure`, `HttpOnly`, `SameSite=Lax`).

### MFA

TOTP installé (`enroll_enabled/verify_enabled = true`). **Pas de recovery codes** (Supabase) →
prévoir un 2e facteur TOTP sur un autre appareil. Seuil de mot de passe : ≥ 12 chars,
`lower_upper_letters_digits_symbols`.

### Webhook GoTrue → API

Le backend écoute `POST /v1/webhooks/supabase` — configurer dans le stack Supabase
(GoTrue) l'appel vers `https://api.qoe.fi/v1/webhooks/supabase` pour les événements auth
(signup, login, user.deleted…) si tu veux l'audit/sync côté API.

---

## 4️⃣ 📧 Emails — solution SELF-HOSTÉE (décision : pas de Resend/Brevo)

> 🏠 **Décision prise : tout le mail passe par une solution self-hostée sur le VPS.**
> Voici la recommandation et le plan de branchement. Les 3 canaux à servir :

| Canal | Émetteur | Besoin |
|---|---|---|
| **Auth / Supabase** (confirmation, reset, invite, magic link) | GoTrue | un serveur SMTP (`host:port`, user, pass) |
| **Transactionnels sécurité** (alerte login, mdp modifié, archive RGPD) | `@qoe/auth/mailer` | SMTP (ou HTTP) — le code pointe actuellement Resend |
| **Newsletters créateurs** | worker asynq Go | un adaptateur `EmailProvider` à écrire (contrat `docs/notification-delivery.md`) |

### Quelle solution self-hostée choisir ?

**Recommandation : un relais SMTP Postfix léger + OpenDKIM** sur le VPS (ou Maddy si tu
veux un binaire unique). C'est le plus adapté pour ce projet :

- **Postfix + OpenDKIM** — ~40 Mo de RAM, config en 30 min (relais sortant + DKIM/SPF/DMARC),
  parfait pour du transactionnel. Tous les émetteurs (GoTrue, mailer, worker) s'y connectent
  en SMTP standard. ✅ **recommandé ici**
- **Maddy** (single binary) — alternative moderne, plus simple à déployer, gère DKIM + SPF
  nativement. Bon second choix. ✅
- **Mailcow / Postal** — boîtes aux lettres + UI web + gestion des bounces… beaucoup plus
  lourd (MySQL/RabbitMQ/plusieurs containers) : **surdimensionné** tant qu'on ne fait que de
  l'envoi sortant.

**Le vrai enjeu d'un mail self-hosté, c'est la réputation** : il faut impérativement
- **PTR / reverse DNS** chez Netcup (valeur = `mail.qoe.fi` ou le hostname du VPS),
- un enregistrement **SPF** qui inclut l'IP du VPS (attention : le SPF actuel mentionne
  `_spf.mail.hostinger.com` — il faudra **fusionner** les deux),
- **DKIM** (OpenDKIM signe `qoe.fi`),
- **DMARC** (`v=DMARC1; p=quarantine; rua=…`),
- un **hostname A** propre (`mail.qoe.fi`) et l'envoyer à la place de l'IP si possible,
- un volume d'envoi raisonnable (newsletter aux créateurs = volume faible au début : OK).

### Branchement par canal

| Canal | Où configurer |
|---|---|
| **GoTrue** | `.env` du stack Supabase : `SMTP_HOST=127.0.0.1` (ou `mail` du réseau Docker), `SMTP_PORT=587`, `SMTP_USER`/`SMTP_PASS`, `SMTP_ADMIN_EMAIL`… |
| **mailer sécurité** | `@qoe/auth/mailer.ts` — **à modifier** : passer de l'API Resend à un SMTP (nodemailer ou fetch brut) piloté par `SMTP_*` ; `EMAIL_FROM` inchangé |
| **Newsletter/notifs** | écrire l'adaptateur `EmailProvider` (SMTP) dans le worker Go, l'enregistrer sous `EMAIL_PROVIDER=smtp` ; variables `NOTIFICATION_DELIVERY_ENABLED`/`EMAIL_PROVIDER` prévues |

### 🎛️ Choix du fournisseur — switch local / Hostinger / Resend

> ✅ **Implémenté** : `EMAIL_PROVIDER` (lu par le mailer `@qoe/auth` **et** le worker Go)
> bascule entre les relais sans redéploiement. Résolution si `EMAIL_PROVIDER` absent :
> `RESEND_API_KEY` → resend ; sinon `SMTP_HOST` → smtp ; sinon log simulé (dev).

| `EMAIL_PROVIDER` | Variables requises | Cas d'usage |
|---|---|---|
| `smtp` (défaut si `SMTP_HOST`) | `SMTP_HOST`, `SMTP_PORT` (587/465/25), `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` (`true` pour 465), `EMAIL_FROM` | **Postfix local** sur le VPS (dès que Netcup a ouvert le port 25) ; **Hostinger** (`smtp.hostinger.com:587`) ; SendGrid… |
| `resend` (défaut si `RESEND_API_KEY`) | `RESEND_API_KEY`, `EMAIL_FROM` | **En attendant le port 25 ouvert** chez Netcup, ou pour un volume cloud |
| *(vide)* | aucune | dev → email simulé dans les logs |

- **GoTrue (emails d'auth)** garde son propre SMTP, configuré dans le `.env` du stack
  Supabase — il peut pointer vers le **même** relais (Postfix local ou Hostinger) avec des
  identifiants dédiés.
- **Cohérence** : le worker Go et le mailer TS lisent les mêmes `EMAIL_PROVIDER`/`SMTP_*` —
  un seul fichier `.env.docker` à maintenir.

> ⚠️ **Amorçage** : le fanout de newsletter (worker Go) crée les `Subscriber` + tâches asynq,
> mais l'**expéditeur email n'est pas encore branché** au code Go — c'est l'adaptateur à
> écrire. Ne pas promettre une newsletter qui ne part pas.
>
> **Avant la bascule** : tester l'envoi depuis le VPS (`echo test | sendmail toto@…`),
> vérifier DKIM (`opendkim-testmsg`) et que le mail n'atterrit pas en spam (test mailbox
> Gmail/Proton).

---

## 5️⃣ 🧠 IA, embeddings & recherche

### Embeddings locaux (Jina) — ✅ **confirmé local**, pas de clé, mais du disque + de la RAM

- Modèle `jina-embeddings-v3-Q8_0.gguf` ≈ **600 995 424 octets**, SHA-256 vérifié par
  `bootstrap.sh` (`da95bb31…`). Présent dans `/root/migration/` en option, sinon téléchargé.
- Service `embedding` = llama.cpp, **~1 Go de RAM** pour l'inférence → compté dans le sizing.
- `EMBEDDING_URL` doit être l'URL **complète** `…/v1/embeddings` pour le seed/`embed-all`.
- Variables : `EMBEDDING_MODEL=jina-embeddings-v3`, `EMBEDDING_INDEX_TASK=retrieval.passage`,
  `EMBEDDING_QUERY_TASK=retrieval.query`, `EMBEDDING_DIMS` (dégradé si absent → check du code).
- Risque : si `EMBEDDING_URL` absent → `/search/semantic` renvoie **503** (fallback lexical OK),
  et les tâches d'embedding asynq sont **skippées**. L'inférence locale est **optionnelle au boot**,
  mais requise pour la reco sémantique.

### LLM externes

- `OPENAI_API_KEY` : media-engine (analyse/description d'images), résumés, **et** Supabase Studio AI.
- `ANTHROPIC_API_KEY` : rédaction / autres features IA.
- Toujours **côté serveur** — jamais dans une `NEXT_PUBLIC_*`.

---

## 6️⃣ 📊 Umami (analytics self-hosté) — configuration simplifiée

> 🔍 **Analyse de l'existant** : le code (TS `packages/analytics` et Go `internal/umami`)
> supporte **deux** modes d'auth API — `UMAMI_API_KEY` (clé statique) **ou** login
> `UMAMI_USERNAME`/`UMAMI_PASSWORD` (token caché 4h). Le login est le mode « bizarre » qui
> accumule les variables d'env inutiles dans `.env.docker`. **La version propre : une seule
> clé d'API Umami.**

### Ce qui appartient à QUI

| Variable | Conteneur | Rôle |
|---|---|---|
| `NEXT_PUBLIC_UMAMI_SCRIPT_URL=https://umami.qoe.fi/script.js` | apps Next | script côté navigateur |
| `NEXT_PUBLIC_UMAMI_WEBSITE_ID` | apps Next | UUID du site à tracker |
| `UMAMI_API_URL=http://umami:3000/api` | api/worker Go + TS | base de l'API stats |
| `UMAMI_API_KEY` | api/worker Go + TS | **clé d'API statique** (créée dans l'UI Umami) — remplace login/mot de passe |
| `UMAMI_USERNAME` / `UMAMI_PASSWORD` | (optionnel) | à **supprimer** si on passe à la clé d'API |
| `UMAMI_HASH_SALT`, `UMAMI_DATABASE_URL`, `POSTGRES_*` | **seulement** le container `umami`/`umami-db` | config interne d'Umami — pas dans l'env des apps |

### Procédure (post-boot, une seule fois)

1. Créer l'admin (1er compte = admin) dans l'UI `umami.qoe.fi`.
2. **Settings → API Keys → New key** → copier la clé dans `UMAMI_API_KEY` (mode clé unique,
   plus de login programmatique).
3. Créer le **website** qoe.fi → son **UUID** → `NEXT_PUBLIC_UMAMI_WEBSITE_ID`.
4. `NEXT_PUBLIC_UMAMI_SCRIPT_URL=https://umami.qoe.fi/script.js`.
5. Ne laisser dans `.env.docker` que `UMAMI_API_URL` + `UMAMI_API_KEY` + les deux
   `NEXT_PUBLIC_UMAMI_*` (optionnel : conserver `UMAMI_USERNAME`/`PASSWORD` en secours).

---

## 7️⃣ 🔍 Meilisearch (✅ local)

- Full-text search, **réseau interne uniquement** (`MEILISEARCH_HOST=http://meilisearch:7700`),
  tourne sur le même VPS — **aucun compte externe**, juste `MEILI_MASTER_KEY` à générer
  (≥ 16 chars). La synchro est faite par le worker (tasks asynq).

---

## 8️⃣ 💳 Stripe (⚠️ PAS ENCORE EN PLACE)

> **Aucun compte Stripe n'est branché pour l'instant.** Rien à faire le jour J — mais voici
> la marche à suivre quand on l'activera (à garder dans ce doc pour plus tard) :

| Item | Valeur |
|---|---|
| Clés | `STRIPE_SECRET_KEY=sk_live_…`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_…` |
| Webhook entrant | `POST https://api.qoe.fi/v1/webhooks/stripe` → créer dans le dashboard, copier le **secret** `whsec_…` dans `STRIPE_WEBHOOK_SECRET` ⚠️ |
| Événements à abonner | checkout.session.completed, customer.subscription.*, invoice.paid/payment_failed, customer.deleted (selon tes besoins billing) |
| Connect | `stripeAccountId` par tenant → vérifier le flux onboarding Connect si tu t'en sers |
| Feature flag | passer `FEATURE_BILLING`/`FEATURE_PAYWALL` à `true` (défauts activés) |

> Le jour venu : créer le compte Stripe, récupérer les clés **live**, créer le webhook live,
> recopier `whsec_…`, puis tester un checkout en réel. D'ici là, laisser les variables vides.

---

## 9️⃣ 🗄️ Storage / CDN

- Buckets Supabase : `articles-media`, `media-branding`, `user-media` (limite 50 MiB).
  Le seed les crée via l'API Storage ; en base fraîche vérifier qu'ils existent.
- `cdn.qoe.fi` → Nginx Host (images/stockage public, cache local) — cert dédié/laisser le
  domaine pointer. Optionnel mais recommandé pour décharger le reader.

---

## 🔟 🗝️ Autres secrets à générer d'avance

```bash
# À faire UNE fois, à conserver dans ton vault (1Password/Pass) :
openssl rand -base64 32   # JWT_SECRET / SECRET_KEY_BASE / QOE_INTERNAL_SECRET / SSO_JWT_SECRET
openssl rand -base64 24   # MEILI_MASTER_KEY / UMAMI_HASH_SALT
openssl rand -hex 8       # REALTIME_DB_ENC_KEY → doit faire EXACTEMENT 16 chars
# Mots de passe : POSTGRES_PASSWORD (postgres), UMAMI_PASSWORD, admin
```

Variables racine `.env.docker` (rappel, cf. DEPLOYMENT.md) :
`DATABASE_URL`/`DIRECT_URL` (Prisma → `supabase-db`), `API_DATABASE_URL` (**sans** `?schema=public`),
`NEXT_PUBLIC_SUPABASE_URL=https://auth.qoe.fi`, `ANON`/`SERVICE_ROLE`, `SUPABASE_JWT_SECRET`,
`QOE_INTERNAL_SECRET`, `SSO_JWT_SECRET`, `REDIS_URL`, tous les `NEXT_PUBLIC_*_URL`,
`UMAMI_*`, `STRIPE_*`, `OPENAI_*`, `ANTHROPIC_*`, `RESEND_API_KEY`/`EMAIL_FROM`.

---

## 1️⃣1️⃣ ✅ Checklist de GO (à cocher avant la bascule DNS)

**Comptes / clés**
- [ ] Quartz : domaine qoe.fi transféré chez Netcup, records A/MX/SPF/Vérif-Google en place
- [ ] Google Cloud Console : consent screen **Production** + callback `https://auth.qoe.fi/auth/v1/callback` — puis activation **via l'admin** (toggle `AUTH_METHODS`) uniquement quand Google sera opérationnel
- [ ] **Stripe : rien à faire pour l'instant** (pas encore en place — voir §8)
- [ ] **Email self-hosté** : Postfix/OpenDKIM installé + PTR/reverse DNS + SPF fusionné + DKIM/DMARC + test d'envoi réel (voir §4)
- [ ] OpenAI / Anthropic : clés live prêtes
- [ ] Modèle Jina `.gguf` présent (ou téléchargement prévu par le bootstrap)

**Secrets générés**
- [ ] `JWT_SECRET`, anon/service_role (JWT), `SECRET_KEY_BASE`, signing key, `REALTIME_DB_ENC_KEY` (16 chars), storage key
- [ ] `MEILI_MASTER_KEY`, `UMAMI_HASH_SALT`, `QOE_INTERNAL_SECRET`, `SSO_JWT_SECRET`, mots de passe DB/admin

**Fichiers `.env` complets** (référentiel : DEPLOYMENT.md §Variables, PAS `.env.docker.example`)
- [ ] `.env.docker` racine est prêt et cohérent avec le stack Supabase (`supabase/docker/.env`)
- [ ] Symlink `.env → .env.docker` prévu par bootstrap

**Post-boot (à ne pas oublier le jour J)**
- [ ] `ALTER EXTENSION vector SET SCHEMA public;` puis migrate (leçon n°4)
- [ ] Baseline `goose_db_version` si base déjà migrée par Prisma (leçon n°4bis)
- [ ] Umami : admin créé, **clé d'API** générée (→ `UMAMI_API_KEY`), website créé → `NEXT_PUBLIC_UMAMI_WEBSITE_ID`, `UMAMI_API_URL` + script URL posés (voir §6)
- [ ] Certs Let's Encrypt : nominatifs (HTTP-01) + wildcard `*.qoe.fi` (DNS-01 Netcup) + `base.admin.qoe.fi` (dédié, Basic Auth + Tailscale)
- [ ] Seed + `embed-all` lancés, comptages vérifiés (500 users / 200 articles / 700 pensées / 500 auth.users)
- [ ] PTR / reverse DNS + SPF (réputation mail)

**Vérifs de fin** — cf. `docs/DEPLOYMENT.md` §Vérifications de bout en bout
- [ ] `/health`, `/home`, `hi`, `umami`, `auth/v1/health` répondent
- [ ] Login réel avec un compte seedé → access_token OK
- [ ] TLS signé Let's Encrypt, pas de clé service_role dans le bundle/HTML/logs

---

## 1️⃣2️⃣ 📎 Références utiles

- [`docs/DEPLOYMENT.md`](./DEPLOYMENT.md) — procédure 8 étapes, pièges, réseaux Docker, TLS/DNS, seed
- [`docs/AUTH_PRODUCTION_CHECKLIST.md`](./AUTH_PRODUCTION_CHECKLIST.md) — release gates auth
- [`docs/ACCOUNT_SECURITY_PLAN.md`](./ACCOUNT_SECURITY_PLAN.md) — plan sécurité compte
- [`docs/notification-delivery.md`](./notification-delivery.md) — contrat EmailProvider / notifications
- [`docs/STUDIO_DEVELOPER_SECURITY.md`](./STUDIO_DEVELOPER_SECURITY.md) — sécurité studio
- [`docs/openapi/app-api.yaml`](./openapi/app-api.yaml) — endpoints webhooks Stripe/Supabase