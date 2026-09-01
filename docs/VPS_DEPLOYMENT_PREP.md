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
| **Domaine** `qoe.fi` | Identité + DNS de tout le stack | **Zone DNS chez Hetzner** (NS `*.ns.hetzner.*`, export du 31/08/2026) | Zone DNS + NS + compte |
| **Supabase self-hosted** | DB + Auth + Storage + Realtime | Le stack Supabase dans `/var/www/supabase` | voir §Auth |
| **Google OAuth** | Connexion sociale (seul provider activé dans `supabase/config.toml`) | console.cloud.google.com | `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` / `_SECRET` |
| **SMTP (GoTrue)** | Emails d'auth : confirmation, reset, magic link, invite | **self-hosté** — Stalwart sur le VPS (§4) | host, port, user, pass, from |
| **Mailer sécurité** | Emails **transactionnels de sécurité** (alerte login, mdp, archive RGPD) | **self-hosté** — ✅ migré en SMTP, switch `EMAIL_PROVIDER` (§4) | `SMTP_*` + `EMAIL_FROM` |
| **Newsletter créateurs** | Envoi de masse aux abonnés | **self-hosté** — ✅ adaptateur `EmailProvider` SMTP écrit dans le worker (§4) | `EMAIL_PROVIDER` + `SMTP_*` |
| **Jina / Embedding** | Recherche sémantique + recommandations (inférence **locale**) | Téléchargé au bootstrap | **aucune clé** — juste le modèle `jina-embeddings-v3-Q8_0.gguf` (≈600 Mo) + `EMBEDDING_URL` |
| **OpenAI** | IA (résumés, image analysis, Supabase Studio AI) | platform.openai.com | `OPENAI_API_KEY` |
| **Anthropic** | IA (rédaction) | console.anthropic.com | `ANTHROPIC_API_KEY` |
| **Umami** | Analytics self-hosté | Créé dans le stack | admin (1er compte) + **clé d'API** → `UMAMI_API_KEY` + `NEXT_PUBLIC_UMAMI_WEBSITE_ID` |
| **Meilisearch** | Full-text search (interne) | Générable | `MEILI_MASTER_KEY` |
| **Stripe** | Paiements créateurs | dashboard.stripe.com | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — ⚠️ **pas encore en place** : tout est à créer le jour où on l'active (voir §8) |
| **VPS / hébergeur** | Tout le stack | Netcup (Debian 13, 4 cœurs / 8 Go) | accès root, IP, PTR/reverse DNS |

> ⚠️ **GrowthBook / Sentry / PostHog / Tolgee** : présents dans `.env` de dev et/ou
> `config.toml` mais **pas requis en prod** (SENTRY_DSN, GROWTHBOOK_*, NEXT_PUBLIC_POSTHOG_*,
> NEXT_PUBLIC_TOLGEE_*) → laisser vide sauf si tu en as vraiment besoin.

---

## 2️⃣ 🌍 Domaine & DNS — état actuel (zone exportée le 31/08/2026)

> ✅ La zone est hébergée chez **Hetzner** (NS `hydrogen/oxygen/helium.ns.hetzner.*`) et
> pointe déjà vers le VPS `159.195.110.239`. Recopie fidèle de ce qui est en place :

```
;; $ORIGIN qoe.fi — TTL 3600
@       IN A     159.195.110.239        ; racine
*       IN A     159.195.110.239        ; wildcard (tenants, api, studio…)
*.admin IN A     159.195.110.239        ; base.admin.qoe.fi, etc.
docs    IN A     72.60.93.27            ; site docs — autre serveur, ne pas toucher
mail    IN A     159.195.110.239        ; mail.qoe.fi → le VPS (Stalwart)
mail    IN AAAA  2a0a:4cc0:60:dd5:286d:20ff:fe2e:db86
@       IN MX 10 mail.qoe.fi.           ; ✅ déjà sur le VPS
@       IN TXT  "v=spf1 mx a:mail.qoe.fi ~all"   ; ✅ couvre l'IP du VPS
_dmarc  IN TXT  "v=DMARC1; p=quarantine; rua=mailto:admin@qoe.fi"   ; ✅
@       IN TXT  "google-site-verification=5G2LP8qdCURCY_GzijCkVe7CaXxsEDGr73pl_II-0fM"
```

| Statut | Action |
|---|---|
| ✅ | **MX** → `mail.qoe.fi` (le VPS) : prêt pour Stalwart (envoi **et** réception) |
| ✅ | **SPF** `v=spf1 mx a:mail.qoe.fi ~all` : couvre l'IP du VPS — rien à fusionner (le SPF réel ne mentionne **pas** Hostinger) |
| ✅ | **DMARC** `p=quarantine` déjà posé |
| ⏳ | **DKIM** : TXT `default._domainkey.qoe.fi` (`v=DKIM1; k=rsa; p=…`) → à publier **dès que Stalwart aura généré les clés** — tu me le dis et on le met |
| ⏳ | **PTR / reverse DNS** de `159.195.110.239` → `mail.qoe.fi` : à demander au **provider qui détient l'IP** (Netcup d'après nos notes) |
| ⏳ | **Port 25** (sortant pour l'envoi, entrant pour la réception) : à ouvrir chez Netcup — en attendant, switch Hostinger/Resend (§4.4) |
| ℹ️ | Propagation : `dig +short A qoe.fi` depuis plusieurs points ; TTL 3600 → 300 avant la bascule si besoin |
| ⚠️ | **Ancien VPS `178.104.197.3`** : son vieux Caddy sert encore `*.qoe.fi` (dashboard Supabase : icône Supabase + redirection `/project/default`, 404 sur les routes du studio créateur). Après la bascule DNS, un **cache DNS périmé** (navigateur/OS/routeur) peut retomber dessus → « 404 partout » / icône Supabase / `/project/default` par intermittence. Correctif : vider le cache DNS (ou attendre ≤ TTL 3600), et **retirer/commenter les blocs `qoe.*` de l'ancien Caddy** (vérifié 2026-09-01 : zéro 404 servi par le nouveau VPS, tout venait de l'ancien) |

> ⚠️ **Corrections vs versions précédentes** : la zone est chez **Hetzner** (pas Netcup), le
> MX pointe **déjà** vers le VPS (pas Hostinger), et le SPF réel n'inclut pas Hostinger.
> Les §1 et §11 sont alignés ci-dessous.

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

> ⚠️ **Pièges vérifiés en prod (v2.189)** :
> 1. **`new URL(request.url).origin` n'est pas fiable derrière Caddy** : Next.js reconstruit
>    `request.url` avec l'adresse de bind du container (`0.0.0.0:3000`) et ignore le header
>    `Host`. Les routes `/auth/callback` (core + tenants) doivent construire leur base de
>    redirection depuis `x-forwarded-host`/`host` (+ `x-forwarded-proto`) — corrigé dans
>    le code (`getPublicBase`). Sans ça, l'échec du callback redirige vers
>    `https://0.0.0.0:3000/login?error=auth-code-error`. Même piège dans les **middlewares
>    studio/admin** (`request.nextUrl.href` → `?redirect=0.0.0.0:3000`) et dans
>    `requireUser` (`headers().get('host')` → adresse de bind) : tous corrigés le 01/09
>    (headers proxy + repli `getMonorepoUrl`).
> 1bis. **`studio` est un nom DNS AMBIGU sur le réseau qoefi-public** : `supabase-studio`
>    porte aussi l'alias `studio` (ajouté pour `base.admin.qoe.fi`) → le
>    `reverse_proxy studio:3000` de Caddy tombait AU HASARD sur le dashboard Supabase
>    (redirections `/project/default` + 404 intermittentes). Corrigé : `reverse_proxy
>    qoefi-studio:3000` (nom de container unique) dans `docker/caddy/Caddyfile`.
> 2. **Les magic links sont à usage unique et remplacés à chaque nouvelle demande**
>    (`one_time_tokens` a une contrainte `UNIQUE(user_id, token_type)` + delete avant
>    insert). Recliquer « Recevoir un lien magique » (ou double-cliquer) **invalide le lien
>    précédent** → `error_code=otp_expired`. Le formulaire bloque les soumissions pendant
>    le chargement ; si l'utilisateur reçoit plusieurs emails, seul le dernier lien est
>    valable. Le token vérifié est `sha224(email + otp)` préfixé `pkce_` en PKCE — pas un
>    JWT, donc pas de lien avec `GOTRUE_JWT_SECRET`.

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

### Quelle solution self-hostée choisir ? — ✅ **Stalwart Mail Server** (choisi)

**Décision actée : Stalwart Mail Server** (binaire unique Rust, édition Community). C'est
le haut du panier du mail self-hosté moderne : SMTP sortant **et** entrant, IMAP/JMAP,
**DKIM natif** (génération des clés + signature), vérification SPF/DMARC + politique,
quarantaine, UI d'admin web (`:8080`), ~50-100 Mo de RAM, un seul service à déployer.
Il remplace à la fois Postfix, OpenDKIM **et** Maddy.

- **Branchement** : tous nos émetteurs (GoTrue, mailer TS, worker Go) s'y connectent en SMTP
  standard — `127.0.0.1:25` **sans auth** (relais local de confiance) ou `:587` avec un
  compte dédié (`relay@qoe.fi`). Nos clients SMTP (Go + TS) gèrent déjà 25/587/465.
- **Jour J** : installer Stalwart, créer le compte relay, générer les **clés DKIM** dans
  l'UI → on publie ensuite le TXT `default._domainkey.qoe.fi` (§2). En bonus, `admin@qoe.fi`
  reçoit les rua DMARC + les bounces sur le même serveur (IMAP).
- **⚠️ Point de vigilance** : le **port 25** (sortant pour envoyer, entrant pour recevoir)
  doit être ouvert chez Netcup. Tant que ce n'est pas fait → switch Hostinger/Resend (§4.4).

**Le vrai enjeu d'un mail self-hosté, c'est la réputation** : il faut impérativement
- **PTR / reverse DNS** de `159.195.110.239` → `mail.qoe.fi` (à demander au provider de l'IP),
- **SPF** — ✅ déjà OK dans la zone réelle (`mx a:mail.qoe.fi` couvre le VPS) ; ajouter
  l'include du provider seulement si on bascule un jour l'envoi sur Hostinger/Resend,
- **DKIM** — clés générées par Stalwart, TXT à publier ensuite,
- **DMARC** — ✅ déjà posé (`p=quarantine`),
- un volume d'envoi raisonnable (newsletter aux créateurs = volume faible au début : OK).

### Branchement par canal

| Canal | Où configurer |
|---|---|
| **GoTrue** | `.env` du stack Supabase : `SMTP_HOST=127.0.0.1` (ou `mail` du réseau Docker), `SMTP_PORT=25` (ou `587` + compte relay), `SMTP_USER`/`SMTP_PASS` (vide si relais local), `SMTP_ADMIN_EMAIL`… |
| **mailer sécurité** | ✅ **migré** : `@qoe/auth/mailer.ts` lit `EMAIL_PROVIDER` → `smtp` (client minimal sans dépendance, testé) ou `resend` ; `SMTP_*` + `EMAIL_FROM` |
| **Newsletter/notifs** | ✅ **adaptateur écrit** : `EmailProvider` SMTP dans le worker Go + drain de la boîte d'envoi (`NOTIFICATION_DELIVERY_ENABLED=true`, testé) |

### 🎛️ Choix du fournisseur — switch local / Hostinger / Resend

> ✅ **Implémenté** : `EMAIL_PROVIDER` (lu par le mailer `@qoe/auth` **et** le worker Go)
> bascule entre les relais sans redéploiement. Résolution si `EMAIL_PROVIDER` absent :
> `RESEND_API_KEY` → resend ; sinon `SMTP_HOST` → smtp ; sinon log simulé (dev).

| `EMAIL_PROVIDER` | Variables requises | Cas d'usage |
|---|---|---|
| `smtp` (défaut si `SMTP_HOST`) | `SMTP_HOST`, `SMTP_PORT` (587/465/25), `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE` (`true` pour 465), `EMAIL_FROM` | **Stalwart local** (`127.0.0.1:25` sans auth, ou `:587` + compte relay) dès que Netcup ouvre le port 25 ; **Hostinger** (`smtp.hostinger.com:587`) ; SendGrid… |
| `resend` (défaut si `RESEND_API_KEY`) | `RESEND_API_KEY`, `EMAIL_FROM` | **En attendant le port 25 ouvert** chez Netcup, ou pour un volume cloud |
| *(vide)* | aucune | dev → email simulé dans les logs |

- **GoTrue (emails d'auth)** garde son propre SMTP, configuré dans le `.env` du stack
  Supabase — il peut pointer vers le **même** relais (Postfix local ou Hostinger) avec des
  identifiants dédiés.
- **Cohérence** : le worker Go et le mailer TS lisent les mêmes `EMAIL_PROVIDER`/`SMTP_*` —
  un seul fichier `.env.docker` à maintenir.

> ✅ **Amorçage** : le fanout de newsletter crée les `Subscriber` + tâches asynq, et le worker
> draine maintenant la boîte d'envoi (adaptateur SMTP/Resend implémenté + testé). À activer
> en prod via `NOTIFICATION_DELIVERY_ENABLED=true`.
>
> **Avant la bascule** : tester l'envoi depuis le VPS, vérifier la signature **DKIM** de
> Stalwart et que le mail n'atterrit pas en spam (test mailbox Gmail/Proton).

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

> ✅ **En prod de test (staging), ça marchera** : les stats lecteurs (lecture maison,
> `ReadingSession`) ne dépendent pas d'Umami, et les stats Umami (visiteurs, référents,
> appareils, récurrents, heatmap) **dégradent proprement en données vides** si le container
> est down — pas de crash. Les créateurs voient leurs analytics dès que les variables
> ci-dessus pointent vers le container Umami (le worker crée un website Umami par publication
> automatiquement — rien à faire côté créateur). Deux précautions : **pinner la version de
> l'image Umami** (les requêtes SQL dépendent de `session.distinct_id` de la version) et
> utiliser un **website Umami dédié au staging** (`NEXT_PUBLIC_UMAMI_WEBSITE_ID` ≠ prod) pour
> ne pas mélanger les stats de test avec celles de prod.

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
openssl rand -base64 24   # MEILI_MASTER_KEY / UMAMI_HASH_SALT (container Umami seul)
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
- [x] Quartz : zone DNS chez Hetzner OK — A/wildcard/MX/SPF/DMARC/Vérif-Google en place, **PTR ✓ + TXT DKIM (ed25519 + RSA) ✓ publiés** (vérifié `dig` le 2026-08-31)
- [ ] Google Cloud Console : consent screen **Production** + callback `https://auth.qoe.fi/auth/v1/callback` — puis activation **via l'admin** (toggle `AUTH_METHODS`) uniquement quand Google sera opérationnel
- [ ] **Stripe : rien à faire pour l'instant** (pas encore en place — voir §8)
- [x] **Email self-hosté** : **Stalwart** installé + compte relay + PTR ✓ + TXT DKIM publiés ✓ + **test d'envoi réel : 10/10 chez mail-tester (2026-08-31)** — SPF/DKIM/DMARC = PASS (voir §4)
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
- [x] Certs Let's Encrypt : nominatifs (HTTP-01) OK + tenants `*.qoe.fi` **on-demand TLS** (fait le 01/09, §13 point 5)
- [x] **Dashboards admin tailnet-only** : admin.qoe.fi + studio/umami/mail.admin.qoe.fi via Caddy (IP tailnet, abort hors tailnet) + DNS dnsmasq + firewall (§16, 01/09)
- [x] **Inventaire des accès** : `docs/CREDENTIALS.md` + `bash scripts/print-credentials.sh` (ou `deploy-prod.sh --credentials`)
- [ ] Seed + `embed-all` lancés, comptages vérifiés (500 users / 200 articles / 700 pensées / 500 auth.users)
- [x] PTR / reverse DNS + SPF (réputation mail) — `159.195.110.239` → `mail.qoe.fi` ✓ (vérifié `dig -x`)

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
- [`docs/CREDENTIALS.md`](./CREDENTIALS.md) — inventaire des accès & secrets (hashé/clair, où ça vit, rotation)
- [`scripts/print-credentials.sh`](../scripts/print-credentials.sh) — dump des valeurs réelles (`deploy-prod.sh --credentials`)
---

## 1️⃣3️⃣ 🚀 RETOUR D'EXPÉRIENCE — PREMIER DÉPLOIEMENT (2026-08-31)

### Carte des ports (prod — volontairement non standards)

| Service | Port hôte | Pourquoi ce port |
|---|---|---|
| Caddy (web/TLS) | 80 / 443 | OBLIGATOIRES (web public, HTTP-01/ALPN) |
| Kong (API Supabase) | **18000** / **18443** | libère 8000/8443 pour d'autres projets |
| Pooler (Postgres poolé) | **15432** / **16543** | libère 5432/6543 (le port 5432 est LE plus conflictuel) |
| Stalwart admin UI | **28080** | libère 8080 |
| Stalwart mail | 25 / 465 / 587 / 993 / 995 / 4190 | OBLIGATOIRES (MX, submission, IMAP/POP3/Sieve standards) |
| Les apps qoe (core/studio/admin/api…) | aucun | réseau Docker interne uniquement, tout passe par Caddy |

⚠️ **Piège POSTGRES_PORT** : dans `supabase/docker/.env`, `POSTGRES_PORT` est le port **interne** du Postgres
(`PGPORT`, utilisé par TOUS les services Supabase). Ne le changez pas pour "déplacer" le port exposé :
modifiez plutôt `POOLER_PORT_HOST` (mappage hôte du pooler). En interne, supabase-db reste sur 5432
et les apps qoe pointent `supabase-db:5432`.

### DNS — état vérifié le 2026-08-31 (zone Hetzner)

1. ✅ **`admin IN A 159.195.110.239`** — publié (la wildcard `*.admin` ne couvre pas `admin.qoe.fi` lui-même,
   d'où le record dédié).
2. ✅ **DKIM TXT** (générés par Stalwart, les deux publiés) :
   ```
   v1-ed25519-20260831._domainkey.qoe.fi. IN TXT "v=DKIM1; k=ed25519; h=sha256; p=OQFISSHTUori5sA6LBGcrJvyJVe2GxyKHI9hsvCPbAg="
   v1-rsa-20260831._domainkey.qoe.fi. IN TXT ("v=DKIM1; k=rsa; h=sha256; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1Jgc5Gkce4+OA++UbKMMjTF6QnC93M22xmZrh+hNI7to3yCyfctKn5mGjxF/PiY3FgJdEuo9aVOFZR5iNP1lkEQ7y+L4qER3NX6SGV4OPFdkKOa8x2Jjqo5SWr8AqnYTshYfMyO7Odn/1c+gbSkDVmjolcstE645ot3FfDEi43okgFR/QeVH5yQ" "QmUmfbSIvvFYImdRiMIzFr77SiQntWZgzSoGZAiZAMyGdlTrV8xAqyd7Tf3WxYZjh7+fFzc2qEzO7EsxbCTIlkY+s6vwNsaJT1gYyfFjUFCzJeI3g3ItqBR4mMhXtpev69t1mxpLw8OlHoHjHg9ycmSlaLGSlGwIDAQAB")
   ```
   Les enregistrements TLSA/DANE de Stalwart **restent en attente** : sans DNSSEC, ils sont inopérants → §14 (backlog).
3. ✅ **PTR / reverse DNS** `159.195.110.239` → `mail.qoe.fi` — actif (vérifié `dig -x`).
4. ✅ **Résultat test d'envoi réel** (mail-tester, 31/08) : **10/10** — SPF `Pass` (helo=mail.qoe.fi,
   client-ip=159.195.110.239), DKIM `pass` ×2 (RSA-2048 + ed25519), DMARC `pass` (p=quarantine).
   Seul minus : `SPF_HELO_NONE` (pas de SPF sur `mail.qoe.fi`) → +0.001, voir §14.
5. ✅ **TLS des tenants `*.qoe.fi` — RÉSOLU le 01/09 via On-Demand TLS** (plus besoin du wildcard DNS-01) :
   le bloc `*.qoe.fi` du Caddyfile passe en `tls { on_demand }` + global `on_demand_tls { ask http://localhost:8080/check }`
   (endpoint interne :8080 non publié qui répond 200 — seul `ask` existe en Caddy ≥ 2.9, `interval`/`burst` supprimés,
   vécu en crash-loop le 01/09 !). Caddy émet un cert Let's Encrypt **HTTP-01 par sous-domaine** au 1er hit
   (ephe.qoe.fi : émis en ~6 s le 01/09, SAN `DNS:ephe.qoe.fi` ✅, renewé auto). Limite LE 50 certs/semaine = OK
   pour un petit volume de tenants. Seuls les hosts couverts par un bloc de site déclenchent l'émission.
   ➕ **Renouvellement du cert nominatif qoe.fi** (échéance 2026-11-29, partagé avec Stalwart) :
   **automatisé le 01/09** — pre-hook certbot `stop-caddy.sh` (libère le port 80 pour l'authenticator
   standalone) + deploy hooks `restart-caddy.sh` (redémarre Caddy) et `10-stalwart-cert.sh` (copie le
   nouveau cert vers `/etc/stalwart/certs/` + restart Stalwart). Chaîne validée par `certbot renew --dry-run`.

### Emails — ce qui a été mis en place (Stalwart)

- **Stalwart 0.16.20** installé (systemd, RocksDB dans `/var/lib/stalwart`), admin UI sur **28080**.
- **Cert TLS réel** : celui de Let's Encrypt (`/etc/letsencrypt/live/qoe.fi/`) copié dans
  `/etc/stalwart/certs/` (chown **stalwart:stalwart** — le process tourne sous l'utilisateur `stalwart`,
  un key 600 root rend le cert injoignable !), ajouté comme objet `Certificate` (id `jcoduzpaaaqa`),
  `defaultCertificateId` pointé dessus, `useTls: true` sur le listener `submission587` → **STARTTLS**.
  Vérifié le 31/08 : le cert servi sur 465 == celui du disque (LE, `CN=qoe.fi`, val. 21/08 → 19/11/2026).
- ✅ **`mail.qoe.fi` ajouté au cert LE** (réémission `--expand` le 2026-08-31 — SAN : qoe.fi, www, api, auth, admin,
  cdn, hi, **mail**, studio, umami ; valable jusqu'au **2026-11-29**, clé ECDSA). Vérifié en externe : chaîne LE +
  hostname OK sur **465/993/995**. Caddy (container) a été arrêté ~30 s le temps du challenge (authenticator standalone).
- 🛠️ **Méthode de mise à jour du cert Stalwart (PIÈGE — vécu le 31/08)** : le cert servi par Stalwart est stocké dans
  l'objet `Certificate` en base (RocksDB) : `certificate` = PEM **embarqué** (`{"@type":"Text","value":...}`),
  mais `privateKey` = **référence fichier** (`{"@type":"File","filePath":"/etc/stalwart/certs/qoe.fi.key"}`).
  Copier les fichiers ne suffit PAS (certbot émis, Stalwart servait encore l'ancien cert). Procédure :
  1. Copier les nouveaux PEM dans `/etc/stalwart/certs/` (chown **stalwart:stalwart**, 644/600) ;
  2. `POST /jmap` avec `"using":["urn:ietf:params:jmap:core","urn:stalwart:jmap"]` et
     `["x:Certificate/set",{"accountId":"b","update":{"jcoduzpaaaqa":{"certificate":{"@type":"Text","value":"<nouveau fullchain>"}}}},"c0"]`
     (auth Basic `admin:<pw>` extrait de `STALWART_RECOVERY_ADMIN`) ;
  3. `systemctl restart stalwart`.
- ⚠️ **Renouvellement auto à fiabiliser** : la conf `qoe.fi-0001.conf` est en `authenticator = standalone` alors que
  Caddy occupe 80/443 → le timer certbot **échouera** au prochain renouvellement (échéance 2026-11-29). Correctifs :
  hook systemd stop/start Caddy autour de `certbot renew`, ou (recommandé) basculer en **DNS-01 Hetzner** — chantier
  commun avec le wildcard `*.qoe.fi` (voir §14).
- **Compte relay** `relay@qoe.fi` + alias `noreply@qoe.fi` (l'expéditeur doit être un alias du compte AUTH).
- **GoTrue** : `SMTP_HOST=qoe.fi` (PAS l'IP — le cert doit matcher le hostname !), port 587, user/pass relay.
  Go refuse l'AUTH PLAIN sur une connexion non chiffrée ("unencrypted connection") → STARTTLS obligatoire.
- **Worker Go + mailer TS** : `EMAIL_PROVIDER=smtp`, `SMTP_HOST=host.docker.internal` (depuis un container,
   PAS 127.0.0.1 qui est le container lui-même), `SMTP_PORT=587`, user/pass relay,
   `NOTIFICATION_DELIVERY_ENABLED=true`.
- ⚠️ Le **port 25 sortant** de Netcup s'est avéré **ouvert** → envoi direct vers Gmail OK (testé).
  Si un fournisseur le bloque, basculer `EMAIL_PROVIDER=resend` ou `smtp` → `smtp.hostinger.com:587`.

#### 🎨 Templates email GoTrue — versionnés dans le repo (`docker/gotrue-templates/`)

- Depuis **GoTrue v2.164+**, le mécanisme est **par fichier/URL** : `GOTRUE_MAILER_TEMPLATES_MAGIC_LINK`,
  `..._CONFIRMATION`, `..._RECOVERY`, `..._EMAIL_CHANGE`, `..._REAUTHENTICATION` (le chemin de *dossier*
  `GOTRUE_MAILER_TEMPLATES_PATH` est obsolète). Les **sujets** sont dans les `GOTRUE_MAILER_SUBJECTS_*`.
- Les templates vivent dans **un service nginx `templates`** du réseau docker Supabase (méthode officielle du
  stack moderne : **URL** `http://templates/magic_link.html`, pas de volume fichier — le fetch URL est la seule
  voie fiable en v2.189, le path fichier est ignoré). Déployé une fois, à recréer si le stack est recréé :
  `docker compose -f docker-compose.templates.yml up -d` (fichier présent dans `/var/www/supabase/docker`).
- ⚠️ **Limite GoTrue (source v2.189, `mailmeclient`) : `mail.SetBody("text/html", body)`** → un seul corps
  HTML, **pas de partie texte** (pénalité `MIME_HTML_ONLY` mail-tester, mineure). Les `.txt` du repo servent
  de référence, ils ne sont pas envoyés.
- 🌐 **Langue** : les templates GoTrue sont **globaux par instance** (pas de choix par utilisateur) — le repo
  fournit une base **FR** (langue de l'app). Pour des emails transactionnels par langue utilisateur, il faudrait
  les envoyer via notre propre mailer (le worker) au lieu de GoTrue — c'est le design retenu pour les
  **newsletters** (template du créateur, langue de l'abonné gérée par l'app).
- Si un template est modifié dans le repo → `scp -r docker/gotrue-templates/ root@VPS:/var/www/supabase/docker/gotrue-templates/`
  puis `docker compose -f docker-compose.templates.yml up -d --force-recreate templates`.

### CLI Stalwart — pièges rencontrés

- Le CLI (v1.0.12) vs serveur (0.16.20) : le `create`/`apply` CLI **aplatit les objets imbriqués**
  (ex. `certificate: {"@type":"Text","value":...}`) → il faut passer par **JMAP direct** pour créer un cert :
  `POST /jmap` avec `"using":["urn:ietf:params:jmap:core","urn:stalwart:jmap"]`,
  `["x:Certificate/set", {"accountId":"b", "create": {...}}]`. Les `update` simples (bind, useTls) marchent
  avec `stalwart-cli update` (`--field "bind={\"[::]:28080\":true}"`).
- Le mot de passe admin réel est `STALWART_ADMIN_FULL_PW` (16 car.) ; `STALWART_ADMIN_PW` (24 car.)
  est le **recovery** admin (stoké dans `/etc/stalwart/stalwart.env`).
- URL CLI après changement de port : `--url http://127.0.0.1:28080`.

### Umami v3 (3.3.1) — différences vs la doc

- **Les API keys ont été supprimées** en v3 → `UMAMI_API_KEY` inutilisé (self-hosted). Auth = login
  username/password (`UMAMI_USERNAME`/`UMAMI_PASSWORD`) — le client Go se logue, token caché 4h.
- **`UMAMI_API_URL` doit être défini** en prod (`https://umami.qoe.fi/api`) — sinon défaut = cloud Umami !
- **`UMAMI_DATABASE_URL`** requis pour récurrents/heatmap (lecture DB `umami-db:5432`).
- L'admin bootstrap = `admin`/`umami` (le container n'accepte pas de vars d'admin) → changer le mot de passe
  via le **SQL direct** (bcrypt, table `user`) pour matcher `UMAMI_PASSWORD` de `.env.docker`.
- Provisioning auto : worker crée un website par publication (`publication Ephe → website db1246c6…` ✅).

---

## 1️⃣4️⃣ 🗂️ Backlog — tâches différées

> 📄 **Chantiers détaillés (bunny.net CDN/storage, DNS Hetzner vs Bunny, plan de test du
> renouvellement LE) → [`docs/ROADMAP_INFRA.md`](./ROADMAP_INFRA.md)** — audit du code, comparatifs
> et checklists de bascule prêts à l'emploi.

- [ ] **DNS : migrer la zone `qoe.fi` vers un provider gérant DNSSEC** (Hetzner Console DNS ne le supporte pas —
  vérifié 2026-08-31, seuls les records DS entrants sont possibles). **Sans zone signée, les enregistrements
  TLSA/DANE sont inopérants** (Gmail applique DANE en dur depuis 2023, mais DANE exige DNSSEC pour faire confiance
  au TLSA). Quand la migration sera faite :
  1. Publier le TLSA de Stalwart pour le port 25 :
     `_25._tcp.mail.qoe.fi. IN TLSA 3 1 1 64dccc0207215369aed8aaf048ad9851df989c63a04794479e1db9a3bf3745df`
     (hash du SPKI du cert LE **actuel** — il change au prochain renouvellement → prévoir `certbot --reuse-key`
     AVANT de publier, sinon mettre à jour le TLSA à chaque renouvellement).
  2. Retester la délivrabilité (mail-tester + vrai Gmail) après publication.
- [x] **Cert : `mail.qoe.fi` aux SAN** — fait le 2026-08-31 (`--expand`, valable jusqu'au 2026-11-29) — cf. §13
  « Emails » pour la procédure de mise à jour Stalwart (JMAP, le PEM est en base).
- [x] **Renouvellement LE fiable** : ✅ **résolu le 01/09** — pre-hook `stop-caddy.sh` (arrête Caddy pendant
  le challenge → libère le port 80 pour l'authenticator standalone) + deploy hooks `restart-caddy.sh` (Caddy)
  et `10-stalwart-cert.sh` (copie → `/etc/stalwart/certs/`) — **dry-run validé le 01/09** (2 certs renew OK).
  ⚠️ Piège corrigé le 01/09 : Caddy + hook Stalwart lisaient `live/qoe.fi` (cert hérité de la migration du
  21/08) alors que certbot renouvelle `live/qoe.fi-0001` → le chemin `-0001` est désormais utilisé partout
  (Caddyfile `qoe_cert` + hook Stalwart). L'option (a) **DNS-01 Hetzner** (un seul PEM pour Caddy + Stalwart
  + mail) reste le chantier propre quand on voudra, mais **n'est plus urgente** (voir l'item DNS-01 ci-dessous).
- [ ] **DNS-01 Hetzner — pour mémoire (PAS urgent)** : le challenge **DNS-01** de Let's Encrypt prouve la
  propriété du domaine via un record **TXT** (`_acme-challenge.qoe.fi`) posé dans le DNS public — contrairement
  à HTTP-01 / TLS-ALPN-01 (LE vient se connecter chez toi), **aucun port n'a besoin d'être libre** et ça
  permet les certs **wildcard** (`*.qoe.fi`). Brancher certbot sur l'API Hetzner = token API (console Hetzner)
  + plugin `certbot-dns-hetzner` ; certbot pose/retire le TXT automatiquement à chaque renouvellement.
  Intérêt chez nous : un seul PEM pour Caddy + Stalwart + mail, sans le ballet port 80/pre-hook. **Pas urgent**
  (la chaîne standalone + pre-hook marche, dry-run validé 01/09). ⚠️ **Deviendra caduc si on bouge le DNS
  chez Bunny** (plugin certbot/Caddy Bunny DNS à la place). Devient **obligatoire** seulement si on veut
  masquer les `*.admin.qoe.fi` du DNS public (NXDOMAIN) — LE ne pourrait alors plus valider par connexion.
- [ ] **CDN/Stockage images → Bunny.net** (objectif : décharger le VPS + livraison edge mondiale) :
  - Aujourd'hui : `cdn.qoe.fi` → `supabase-kong` (`/storage/v1/object/public`) — storage auto-hébergé sur le
    VPS (bande passante + disque locaux, pas de cache edge).
  - Cible : **Bunny Storage Zone** (origin) + **Pull Zone** (CDN) ; `cdn.qoe.fi` → CNAME vers la pull zone.
  - Au moment de s'y mettre : créer le compte Bunny + Storage/Pull Zones, migrer les objets (sync depuis le
    bucket Supabase), basculer l'URL de base du storage côté code (repérer où les URLs de médias sont
    construites), CNAME DNS, purge + smoke tests. Garder Supabase Storage en write-path pendant la transition.
  - ⚠️ Les URLs de médias sont probablement stockées telles quelles en base → prévoir des **URLs stables**
    (le CNAME `cdn.qoe.fi` doit rester inchangé) ; renommer le bucket/zone avant, pas après.
  - Coût : pay-as-you-go (€/GB stockage + €/GB bande passante — grille à vérifier au moment venu).
- [ ] **Backups offsite → serveur Hetzner** (objectif : survivre à un sinistre du VPS) :
  - Aujourd'hui : `deploy-prod.sh` dump Postgres + `.env.docker` → `/root/migration/pre-<ts>/` **sur le VPS
    lui-même** → disque mort ou serveur compromis = backups perdus avec les données.
  - Cible : destination distante Hetzner — **Storage Box** (S3-compatible ; recommandé : géré, pas d'OS à
    maintenir) ou petit VPS CX (rsync/restic). Mécanique prévue : **restic** (chiffré + dédup) via timer
    systemd, rétention 7 daily / 4 weekly / 6 monthly, **test de restauration périodique**.
  - Contenu : dump Postgres, `.env`/`.env.docker`, `/etc/letsencrypt/`, `/etc/stalwart/`, volumes docker
    (redis, meili, umami-db, caddy_data), `data/updates` (OTA).
  - ⚠️ La passphrase restic + clé de chiffrement doivent vivre dans le vault (1Password), PAS seulement sur
    le VPS.
- [ ] **DNS `qoe.fi` → Bunny DNS ?** (à décider, PAS urgent) : Bunny DNS est **gratuit** (≤ 500 domaines,
  requêtes illimitées), **anycast**, avec **API** et **DNSSEC supporté** — le DNSSEC débloquerait l'item
  TLSA/DANE du mail (bloqué chez Hetzner Console DNS qui ne signe pas). Un seul fournisseur pour DNS + CDN
  + storage. ⚠️ Garder les pieds sur terre : (1) les records A/MX continueront de pointer vers l'IP du VPS
  → **l'IP reste publique de toute façon** (le SMTP 25/465/587/993/995 doit être joignable directement ;
  aucun CDN devant le mail) ; (2) l'anti-DDoS Bunny ne couvre que le **trafic HTTP qui passe par son edge**
  (images, éventuellement une pull zone devant les frontends) — pas le mail, pas les connexions directes.
  Bénéfices réels : DNSSEC/DANE + gratuit + consolidation. Si bougé : ré-export de la zone (A/CNAME/MX/TXT/
  wildcards), bascule NS chez le registrar, surveiller la propagation. **Indépendant** du chantier CDN images
  (Bunny Storage se fait sans bouger le DNS).
- [ ] **SPF sur le host HELO `mail.qoe.fi`** : publier `v=spf1 a -all` (couvre A + AAAA du VPS) pour lever
  le point `SPF_HELO_NONE` de mail-tester (mineur : +0.001, le score reste 10/10 sans).

---

## 1️⃣5️⃣ 🚄 Déploiement CI + GHCR (2026-09-01) — plus de build sur le VPS

**Flux** : `push main` → GitHub Actions build les 8 images (workflow
`.github/workflows/build-images.yml`) et les pousse sur `ghcr.io/flayrox/qoefi-*`
(tenants, hi, core, studio, admin, migrate + api/worker) → `scripts/deploy-prod.sh`
fait un simple `docker compose pull` + backup DB + goose + `up -d` + smoke (< 1 min,
contre ~15 min de build sur le VPS avant).

- **Dockerfile** : le `--force --concurrency=1` (rebuild intégral à chaque fois) a été retiré —
  Turborepo ne rebuild que les packages changés (cache `/app/.turbo` monté ; `globalEnv` +
  `globalDependencies` dans `turbo.json` invalident le hash si une `NEXT_PUBLIC_*` change).
  `SKIP_ENV_VALIDATION=true` est posé dans le stage builder (le runtime reçoit le vrai
  `.env.docker` via `env_file` compose).
- **Valeurs build CI** : seules les `NEXT_PUBLIC_*` **publiques** (URLs + clé anon) sont dans le
  workflow — à garder synchronisées avec le `.env.docker` du VPS (source de vérité runtime).
- **🛡️ Effet de bord positif** : les builds viennent de GitHub (pas de fichiers `._*` macOS) →
  plus de risque goose/`._00001_init.sql` (le `_._*` exclus du tar + purge manuelle du 01/09).
- **⚡ Rebuild sélectif (01/09)** : `build-images.yml` ne se déclenche que si le code runtime
  change (`paths:` apps/packages/Dockerfile/lockfiles/turbo) — un commit e2e/docs/scripts-only
  ne déclenche plus 8 builds de ~10 min, et `.dockerignore` exclut `e2e/`, `scripts/`, `docs/`,
  `.github/`, `docker/` du contexte (le layer `COPY . .` n'est plus invalidé par un changement
  de doc). Le CI (`ci.yml`) continue de tourner sur CHAQUE push : seules les images sont
  économisées. `latest` reste sur le dernier commit runtime → `deploy-prod.sh` pull toujours
  des images cohérentes.
- **🔁 E2E Apps résilient** : les auth-gate specs (studio/admin) warm-up + retentent jusqu'à
  obtenir un 3xx stable (`e2e/lib/redirect.ts`) — Next dev peut répondre 5xx transitoire à la
  première requête (compilation), ce qui rendait le job flaky.

**Setup UNE FOIS — auth GHCR par GitHub App (PAS de PAT long-lived)** :
Le VPS ne détient aucune session permanente : `scripts/ghcr-login.sh` (appelé à chaque
`deploy-prod.sh`) signe un JWT avec la clé privée de l'app, l'échange contre un **token
d'installation TTL 1 h** et fait `docker login`.

1. GitHub → Settings → Developer settings → **GitHub Apps** → New GitHub App :
   - Permissions → **Packages : Read-only** (Metadata read s'ajoute automatiquement)
   - Pas de webhook, pas d'URL de callback (app « machine »)
2. **Generate a private key** → télécharger le `.pem` (jamais committé !).
3. Installer l'app sur le repo `Flayrox/qoe.fi`.
4. Récupérer `GHCR_INSTALLATION_ID` :
   ```bash
   # avec le JWT du helper (ou GET https://api.github.com/app/installations avec le Bearer JWT)
   curl -fsSL -H "Authorization: Bearer $JWT" -H 'Accept: application/vnd.github+json' \
     https://api.github.com/app/installations | jq -r '.[].id'
   ```
5. Sur le VPS (une fois) :
   ```bash
   install -m 600 qoe-ci.pem /root/ghcr-app.pem
   cat > /root/ghcr-app.env <<'EOF'
   GHCR_APP_ID=123456
   GHCR_INSTALLATION_ID=12345678
   GHCR_APP_SLUG=qoe-ci-bot
   EOF
   ```
   **Rotation/révocation** : régénérer la clé privée (Settings → app → Regenerate private key)
   ou désinstaller l'app — aucun token à invalider, la session meurt en 1 h.

**À tester au premier déploiement CI** : `bash scripts/deploy-prod.sh` (le pull exige que le
workflow ait poussé au moins une fois les images sur GHCR).

### 🎯 Déploiement CIBLÉ (01/09) — ne redéployer que ce qui a changé

Le script accepte désormais une **liste de services** : seule leur image est pullée et
leur container redémarré (le code est toujours synchronisé, backup + migrations + smoke
tests restent actifs, les autres containers ne bougent pas) :

```bash
bash scripts/deploy-prod.sh core studio     # fix front-only → < 1 min
bash scripts/deploy-prod.sh api worker      # backend only
bash scripts/deploy-prod.sh                 # tout (défaut)
```

Services valides : `tenants hi core studio admin api worker migrate`. Le pull/`up -d`
ciblé ne touche **que** les containers listés — pratique pour un hotfix `core` sans
redémarrer le reste de la stack. (Le build CI reste global : les 8 images passent quand
même, mais `latest` ne change que pour les services dont le code a changé, donc les
containers non listés ne sont pas recréés.)

---

## 1️⃣6️⃣ 🔐 Infra 01/09 — On-Demand TLS (tenants) + Supabase Studio sur Tailscale

### 🌐 TLS des tenants — « connexion non sécurisée » corrigée (Safari OK)

- **Cause** : le bloc `*.qoe.fi` servait le **cert statique `qoe.fi`** sur TOUS les
  sous-domaines → mismatch de nom → erreur navigateur sur `ephe.qoe.fi`.
- **Fix** : on-demand TLS par sous-domaine (§13 point 5) — `ephe.qoe.fi` a son propre
  cert LE (SAN `DNS:ephe.qoe.fi`, val. 01/09 → 30/11, renouvelé auto par Caddy).
- ⚠️ **Piège Caddy v2.11 vécu le 01/09** : les options globales `on_demand_tls`
  `interval` ET `burst` ont été **supprimées** → crash-loop au reload. Seule la forme
  `on_demand_tls { ask <url> }` est valide (endpoint `:8080` local non publié, cf.
  Caddyfile). Toujours `caddy validate` dans un conteneur jetable avant de recréer.

### 💻 Dashboards admin (studio / umami / mail) — TAILNET-ONLY (v2, soirée 01/09)

- **V1 (matin 01/09)** : Tailscale Serve → `https://studio.tail28842e.ts.net`.
- **V2 (soir 01/09)** : Serve retiré — **Caddy écoute aussi sur l'IP tailnet**
  (`100.117.195.127:80/443`, compose) et sert les dashboards avec des noms propres :
  - `admin.qoe.fi` → **admin plateforme** (Next.js admin) — tailnet-only depuis le 01/09
  - `studio.admin.qoe.fi` → supabase-studio (dashboard Supabase)
  - `umami.admin.qoe.fi` → umami (dashboard analytics)
  - `mail.admin.qoe.fi` → UI admin Stalwart (host:28080)
  Certs Let's Encrypt **HTTP-01/ALPN-01 auto** par Caddy (émis au reload, renouvelés
  auto) ; matcher `remote_ip 100.64/10` → tout autre client reçoit une **connexion
  fermée** (`abort` — plus de 404 « Not found » qui révèle l'existence du service ;
  le port 80 renvoie un 308 → https, donc masqué aussi).
- **DNS privé (dnsmasq)** : service systemd sur le host, écoute UNIQUEMENT sur
  `100.117.195.127:53` → `*.admin.qoe.fi` (et l'apex `admin.qoe.fi`) répond
  `100.117.195.127`.
  ⚠️ **Action owner (30 s)** : Console Tailscale → DNS → Nameservers → ajouter
  `100.117.195.127` restreint au domaine **`admin.qoe.fi`** (split DNS). Sans ça
  les appareils résolvent via le DNS public → IP publique → connexion fermée.
- **Firewall** : `scripts/tailnet-firewall.sh` (systemd `qoe-tailnet-firewall`) :
  INPUT Stalwart 28080/4190 (tailnet + docker + loopback, sinon DROP), DOCKER-USER
  Kong 18000/18443 + Pooler 15432/16543 (tailnet only), et **DNAT PREROUTING**
  `100.117.195.127:80/443` → conteneur Caddy (docker-proxy réécrirait l'IP source
  en 172.x → le matcher `remote_ip` ne verrait jamais les 100.x). ⚠️ À rejouer si
  `qoefi-caddy` est recréé — `deploy-prod.sh` le relance après chaque `up -d`.
- **Vérifié depuis l'extérieur (01/09)** : les 4 dashboards (admin.qoe.fi + les 3
  *.admin.qoe.fi) → **connexion fermée** (plus de 404 « Not found » révélateur), ports
  admin (28080, 4190, 18000/18443, 15432/16543) → **fermés**. `umami.qoe.fi` ne
  sert plus que `/script.js` + `/api/send` (tracking public) — l'API Go passe par
  `http://umami:3000/api` (docker interne, `UMAMI_API_URL` dans `.env.docker`).
- **Fallbacks sans split DNS (accès direct WireGuard, IP 100.64/10 non routable
  publiquement)** : `http://100.117.195.127:3000` (supabase-studio), `:3001` (umami),
  `:3002` (admin plateforme), `:28080` (UI Stalwart). Jamais sur une IP publique.
- **Basic Auth supprimé** : l'identité Tailscale EST l'authentification (tailnet privé).
- ⚠️ **Pourquoi pas coredns** : coredns 1.11/1.12 (port-map OU host-net) renvoie
  sur ce host des réponses DNS avec **ANCOUNT=0** (records présents mais compteur
  vide) → inutilisable. dnsmasq (`address=/admin.qoe.fi/<IP tailnet>`) = fiable.
  (Vécu le 01/09 ; `scripts/install-tailnet-dns.sh` régénère la config.)

### 🔑 Accès & secrets

- **Inventaire complet** : [`docs/CREDENTIALS.md`](./CREDENTIALS.md) — où vit chaque
  secret, hashé/clair, récupération, rotation.
- **Dump en 30 s** : `bash scripts/print-credentials.sh` (ou `deploy-prod.sh --credentials`).
- Résumé hashé/clair (vérifié 01/09) : mots de passe users = **bcrypt** (GoTrue `$2a$10$`,
  Umami `$2b$10$`, Stalwart hashé en RocksDB) ; `.env` = **en clair** par nature
  (perms `600` root, `.env.docker` re-chowné root le 01/09 — piège uid 501 du tar macOS).
- ✅ **Clé d'auth Tailscale révoquée** le 01/09 (elle avait circulé en clair dans le
  chat) — plus nécessaire : le nœud reste dans le tailnet indéfiniment.

### 📧 État des mails (vérifié le 01/09)

- **Stalwart** (systemd, host) : 25/465/587/993/995/4190 publics, banner
  `220 mail.qoe.fi Stalwart ESMTP` ✅, DKIM 10/10 (mail-tester 31/08).
- **Apps** : `EMAIL_PROVIDER=smtp`, `SMTP_HOST=host.docker.internal:587`, compte
  `relay@qoe.fi` — worker (newsletters/notifs) et mailer TS **envoient réellement**
  (`NOTIFICATION_DELIVERY_ENABLED=true`).
- **GoTrue** : `GOTRUE_SMTP_*` câblé sur le même relay, **mais**
  `ENABLE_EMAIL_AUTOCONFIRM=true` → les mails de confirmation/reset ne partent pas
  encore (comptes auto-confirmés). À basculer quand on veut de vraies confirmations.
- **Reste à faire** : SPF sur le host HELO (`SPF_HELO_NONE`, mineur), DANE/TLSA
  (bloqué par DNSSEC, §14). Le **renouvellement cert LE est automatisé** : timer
  certbot 2×/jour + pre-hook `stop-caddy.sh` (libère le port 80) + deploy hooks
  `restart-caddy.sh` (Caddy) et `10-stalwart-cert.sh` (copie vers `/etc/stalwart/certs/`
  + restart) — dry-run validé le 01/09.
