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
| **SMTP (GoTrue)** | Emails d'auth : confirmation, reset, magic link, invite | Resend / Brevo / SendGrid | host, port, user, pass, from |
| **Resend** | Emails **transactionnels de sécurité** (alerte login, mdp, archive RGPD) | resend.com | `RESEND_API_KEY` (+ `EMAIL_FROM`, `EMAIL_FROM_NAME`) |
| **Brevo** | Newsletter créateurs (marketing) | brevo.com | `BREVO_API_KEY` (API française 🇫🇷) |
| **Jina / Embedding** | Recherche sémantique + recommandations (inférence **locale**) | Téléchargé au bootstrap | **aucune clé** — juste le modèle `jina-embeddings-v3-Q8_0.gguf` (≈600 Mo) + `EMBEDDING_URL` |
| **OpenAI** | IA (résumés, image analysis, Supabase Studio AI) | platform.openai.com | `OPENAI_API_KEY` |
| **Anthropic** | IA (rédaction) | console.anthropic.com | `ANTHROPIC_API_KEY` |
| **Umami** | Analytics self-hosté | Créé dans le stack | user admin + password + `UMAMI_HASH_SALT` + `NEXT_PUBLIC_UMAMI_WEBSITE_ID` |
| **Meilisearch** | Full-text search (interne) | Générable | `MEILI_MASTER_KEY` |
| **Stripe** | Paiements créateurs | dashboard.stripe.com | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` |
| **VPS / hébergeur** | Tout le stack | Netcup (Debian 13, 4 cœurs / 8 Go) | accès root, IP, PTR/reverse DNS |

> ⚠️ **GrowthBook / Sentry / PostHog / Tolgee** : présents dans `.env` de dev et/ou
> `config.toml` mais **pas requis en prod** (SENTRY_DSN, GROWTHBOOK_*, NEXT_PUBLIC_POSTHOG_*,
> NEXT_PUBLIC_TOLGEE_*) → laisser vide sauf si tu en as vraiment besoin.

---

## 2️⃣ 🌍 Domaine & DNS (à réserver absolument en premier)

La zone doit exister **avant** le chiffrement TLS. Voir `docs/DEPLOYMENT.md` §DNS pour le détail.

| Action | Détail |
|---|---|
| Vérifier le transfert DNS chez **Netcup** | la zone recréée à l'identique, NS pointés (`ns1/netcup.net`…) |
| Records **A** (TTL 300 s) | `qoe.fi`, `www`, `hi`, `api`, `studio`, `admin`, `umami`, `auth`, `cdn`, `base.admin`, `*` (wildcard → tenants) → IP du VPS |
| MX / SPF / TXT mail | **ne pas toucher** (mail chez Hostinger) |
| Google site verification TXT | `5G2LP8qdCURCY_GzijCkVe7CaXxsEDGr73pl_II-0fM` |

**PTR / reverse DNS** + ping SPF : à faire chez Netcup **après** la bascule (réputation mail),
sinon les emails partent en spam.

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

### OAuth Google

- **OAuth consent screen** → application de type **Production** (pas "Testing") sinon tokens de 7 j.
- Enregistrer l'URL de callback **exacte** :
  `https://auth.qoe.fi/auth/v1/callback`
- Autoriser aussi les origines (`https://qoe.fi`, `https://*.qoe.fi`).
- Reporter dans le stack Supabase : `GOOGLE_CLIENT_ID` / `GOOGLE_SECRET` → consommés par
  `SUPABASE_AUTH_EXTERNAL_GOOGLE_*`.
- `skip_nonce_check = false` en prod (déjà le cas dans `config.toml`).
- `email_optional = false`.

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

## 4️⃣ 📧 Emails — 3 tuyaux distincts (à ne pas confondre)

| Canal | Fournisseur | Clé | Envoi |
|---|---|---|---|
| **Auth / Supabase** (confirmation, reset, invite, magic link) | SMTP (Resend/Brevo/SendGrid) | config SMTP du stack Supabase | via GoTrue |
| **Transactionnels sécurité** (alerte login, mdp modifié, archive RGPD) | **Resend** | `RESEND_API_KEY` + `EMAIL_FROM` | via `@qoe/auth/mailer` |
| **Newsletters créateurs** | **Brevo** | `BREVO_API_KEY` (API française) | via le worker asynq |

> ⚠️ **Amorçage** : le fanout de newsletter (worker Go) crée les `Subscriber` + tâches asynq,
> mais l'**expéditeur email n'est pas encore branché** au code Go — c'est un adaptateur à
> écrire (contrat `EmailProvider`). En attendant, l'envoi réel peut être délégué :
> - aux notifications (`NOTIFICATION_DELIVERY_ENABLED` + un provider `EMAIL_PROVIDER`), ou
> - à Brevo manuellement depuis son dashboard.
> **Décision à prendre avant le déploiement** pour ne pas promettre une newsletter qui ne part pas.

**Avant la bascule** : valider domaine d'expédition chez Resend/Brevo (DKIM/SPF), tester que
l'expéditeur `security@qoe.fi` / `nom@qoe.fi` est vérifié (évite les rejets + spam).

---

## 5️⃣ 🧠 IA, embeddings & recherche

### Embeddings locaux (Jina) — **pas de clé, mais du disque + de la RAM**

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

## 6️⃣ 📊 Umami (analytics self-hosté)

- Service `umami` + `umami-db` (Postgres dédié).
- **À provisionner après le premier boot** :
  1. Créer l'admin (login session → 1er compte créateur = admin).
     `UMAMI_USERNAME` / `UMAMI_PASSWORD` / `UMAMI_HASH_SALT` (salt sel à générer).
  2. Créer un **website** pour qoe.fi → récupérer son **UUID** → `NEXT_PUBLIC_UMAMI_WEBSITE_ID`.
  3. `NEXT_PUBLIC_UMAMI_SCRIPT_URL=https://umami.qoe.fi/script.js`.
- Auth API : soit `UMAMI_API_URL` + `UMAMI_API_KEY` (cloud), soit
  `UMAMI_API_URL=http://umami:3000/api` + `UMAMI_USERNAME`/`UMAMI_PASSWORD` (self-hosted v2).
- Viser le site vite (le stats tracking dépend de la bonne `WEBSITE_ID`).

---

## 7️⃣ 🔍 Meilisearch

- Full-text search, **réseau interne uniquement** (`MEILISEARCH_HOST=http://meilisearch:7700`).
- `MEILI_MASTER_KEY` à générer (≥ 16 chars). La synchro est faite par le worker (tasks asynq).

---

## 8️⃣ 💳 Stripe (paiements)

| Item | Valeur |
|---|---|
| Clés | `STRIPE_SECRET_KEY=sk_live_…`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_…` |
| Webhook entrant | `POST https://api.qoe.fi/v1/webhooks/stripe` → créer dans le dashboard, copier le **secret** `whsec_…` dans `STRIPE_WEBHOOK_SECRET` ⚠️ |
| Événements à abonner | checkout.session.completed, customer.subscription.*, invoice.paid/payment_failed, customer.deleted (selon tes besoins billing) |
| Connect | `stripeAccountId` par tenant → vérifier le flux onboarding Connect si tu t'en sers |

> Pendant le dev/Staging utiliser `sk_test_` puis **ne pas oublier** de basculer en `sk_live_`
> le jour J (et de recréer le webhook live + son secret).

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
- [ ] Google Cloud Console : OAuth consent screen **Production** + callback `https://auth.qoe.fi/auth/v1/callback`
- [ ] Stripe : webhook live `https://api.qoe.fi/v1/webhooks/stripe` + `whsec_…`
- [ ] Resend : domaine d'expédition vérifié (DKIM/SPF) + `RESEND_API_KEY`
- [ ] Brevo : clé API + domaine validé (pour les newsletters) *(décidé ?)*
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
- [ ] Créer l'admin Umami + website → `NEXT_PUBLIC_UMAMI_WEBSITE_ID`
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