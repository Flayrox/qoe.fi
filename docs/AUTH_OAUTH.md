# 🔐 Activation OAuth Google & Apple

Connexion sociale via Supabase Auth. Le **code est déjà prêt** côté web
(`LoginFormBento` → `handleOAuth` → `/auth/callback`) : il ne reste que la
**configuration des providers** dans l'instance Supabase ciblée.

> ⚠️ Les providers se configurent **par instance Supabase**. Local (self-hosté)
> et prod (self-hosté) ont chacun leurs propres credentials.

---

## 📐 Comment ça marche (rappel)

```
LoginFormBento (bouton Google/Apple)
  → supabase.auth.signInWithOAuth({ provider, redirectTo })
  → Supabase (GoTrue) redirige vers Google/Apple
  → Google/Apple redirige vers  <SUPABASE_URL>/auth/v1/callback   ← LE point à autoriser
  → GoTrue échange le code
  → redirige vers  redirectTo = {origin}/auth/callback?next=...
  → notre route /auth/callback échange le code + syncUserFromAuth
```

**Seule l'URI `https://<SUPABASE_URL>/auth/v1/callback` doit être déclarée
chez Google/Apple** (pas notre `/auth/callback`, qui est un redirect interne
Supabase).

---

## 🚦 Garantie « pas de skip de l'onboarding »

- Nouveau compte (Google/Apple **ou** email) → `syncUserFromAuth` retourne
  `needsOnboarding: true` → redirection vers `/onboarding` (core).
- Callback **core** (`apps/core/src/app/auth/callback`) : `next = /onboarding`.
- Callback **tenants** (`apps/tenants/src/app/auth/callback`) : nouveau compte
  → `${getMainAppUrl(host)}/onboarding` au lieu de l'article.
- Studio : le layout `(creator)` re-redirige aussi vers l'onboarding tant que
  `hasCompletedOnboarding` est faux.

---

## 🔑 Google

### 1. Créer le client OAuth
1. https://console.cloud.google.com/ → projet (ou nouveau projet)
2. **APIs & Services → Credentials → Create credentials → OAuth client ID**
3. Type : **Web application**
4. **Authorized redirect URIs** → ajouter :
   - Prod : `https://auth.qoe.fi/auth/v1/callback`
   - Local self-hosté : `http://localhost:54321/auth/v1/callback` (Kong local)
5. Copier **Client ID** et **Client secret**

### 2. Brancher sur Supabase
- **Prod (VPS)** : Supabase Studio (`base.admin.qoe.fi`) → **Authentication →
  Providers → Google** → Enable, coller Client ID + Secret.
- **Local** : la page Providers du Studio local est bugguée (voir
  `docs/LOCAL_SUPABASE.md`) → passer par `supabase/config.toml`
  `[auth.external.google]` + secrets dans `supabase/.env`, puis
  `supabase stop && supabase start`.

> Google demande aussi l'écran de consentement (OAuth consent screen) et, pour
> un usage public, la vérification de l'app. En interne/test : "External" +
> ajouter tes emails en "test users" suffit.

---

## 🍎 Apple Sign-In

### 1. Apple Developer
1. https://developer.apple.com/account → **Certificates, Identifiers & Profiles**
2. **Identifiers → App IDs** : ton bundle id (ou un dédié auth)
3. **Identifiers → Services IDs** : créer un Services ID (ex. `com.qoefi.auth`)
   - cocher **Sign In with Apple**, configurer le domaine + return URL
4. **Keys** : créer une **Key** avec **Sign In with Apple** activé → télécharger
   le `.p8` (une seule fois) + noter le **Key ID**
5. Noter le **Team ID** (en haut à droite du compte)

### 2. Générer le client secret (JWT)
Le "client secret" d'Apple est un **JWT ES256** signé avec le `.p8` :
- `iss` = Team ID
- `sub` = Services ID
- `aud` = `https://appleid.apple.com`
- `exp` = maintenant + 6 mois max
- `iat` = maintenant

Supabase Studio peut le générer si tu lui fournis les 4 champs (certaines
versions) ; sinon le générer avec un script (openssl + les claims).

### 3. Brancher sur Supabase
- **Prod (VPS)** : Supabase Studio (`base.admin.qoe.fi`) → **Authentication →
  Providers → Apple** → Enable : Services ID, Team ID, Key ID, Client Secret (JWT).
- **Local** : Apple exige HTTPS → non testable en local ; configurer uniquement
  sur le VPS. (Pour mémoire, le chemin local serait `supabase/config.toml`
  `[auth.external.apple]`, mais inutilisable sans domaine HTTPS.)
- **Authorized redirect** : `https://auth.qoe.fi/auth/v1/callback` (prod).

---

## 🌐 Récap redirect URIs

| Instance | URL Supabase | Redirect URI autorisée chez Google/Apple |
|---|---|---|
| Prod (self-hosté) | `https://auth.qoe.fi` | `https://auth.qoe.fi/auth/v1/callback` |
| Local (self-hosté) | `http://localhost:54321` | `http://localhost:54321/auth/v1/callback` |

> ⚠️ Apple exige du **HTTPS** sur le domaine réel en prod. En local, Apple
> Sign-In est compliqué à tester (pas de `localhost`) : tester Apple
> uniquement sur le VPS, Google en local.

---

## ✅ Checklist de mise en service

- [ ] Credentials Google créés (Client ID + Secret) + redirect URI ajoutée
- [ ] Credentials Apple créés (Services ID, Team ID, Key ID, .p8 → secret JWT)
- [ ] Providers activés dans Supabase (local **et** prod)
- [ ] Tester : signup Google sur core → doit arriver sur `/onboarding`
- [ ] Tester : signup Google depuis un article tenant → onboarding, pas l'article
- [ ] Tester : compte existant Google → retour sur l'article (pas d'onboarding)
