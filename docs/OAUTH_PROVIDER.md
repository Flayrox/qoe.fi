# 🔐 qoe.fi comme fournisseur d'identité OAuth 2.1 / OpenID Connect

Permet à des applications tierces d'afficher **« Se connecter avec qoe.fi »**.
qoe.fi est un **OpenID Provider** : l'API Go détient les clients, les codes,
les tokens et le consentement. Supabase reste le fournisseur d'identité *de*
qoe.fi (les JWT internes), tandis que ce module émet ses propres `id_token` ES256.

> Ne pas confondre avec `docs/AUTH_OAUTH.md` (Google/Apple pour se connecter **à**
> qoe.fi). Ici, c'est qoe.fi qui joue le rôle de Google/Apple **pour** les autres.

---

## Architecture

```
Application tierce (RP)
   │  ① redirige vers  /oauth/authorize  (apps/core)
   ▼
Écran de consentement (apps/core)
   │  ② GET/POST /v1/oauth/authorize  (JWT Supabase de l'utilisateur)
   ▼
API Go (apps/api) — autorité OAuth
   │  • valide client / redirect / PKCE / scopes
   │  • mint codes + tokens (hashés en base), signe les id_token ES256
   ▼
Application tierce  ←  code / access_token / refresh_token / id_token

Gestion des apps :  apps/studio  → /developer/oauth  (via /v1/oauth/clients)
Approbation admin :  apps/admin   → /admin/oauth       (Prisma, rôle superadmin)
```

- **Backend-of-record** : l'API Go (`apps/api/internal/modules/oauth`).
- **Écran de consentement** : `apps/core/src/app/oauth/authorize`.
- **Gestion des apps** : `apps/studio/src/app/(creator)/developer/oauth`.
- **Approbation** : `apps/admin/src/app/(admin)/admin/oauth`.

---

## Endpoints publics (RFC)

| Méthode | Chemin | Rôle |
|---|---|---|
| GET | `/.well-known/openid-configuration` | Discovery OIDC |
| GET | `/.well-known/jwks.json` | Clé publique ES256 (`kid`) |
| POST | `/v1/oauth/token` | Token (authorization_code + refresh_token) |
| POST | `/v1/oauth/introspect` | Introspection (RFC 7662) |
| POST | `/v1/oauth/revoke` | Révocation (RFC 7009) |
| GET/POST | `/v1/oauth/userinfo` | UserInfo OIDC (Bearer) |

Endpoints internes (JWT Supabase) : `GET/POST /v1/oauth/authorize` (consentement)
et `GET/POST/DELETE /v1/oauth/clients[/{id}...]` (gestion Studio).

### Profil de sécurité

- `response_type=code` uniquement, **PKCE obligatoire** (`S256` ou `plain`).
- `redirect_uri` en **correspondance exacte** avec l'allowlist du client.
- `sub` **pairwise** (`HMAC-SHA256(userID, clientId public)`), `aud` = `clientId` public.
- Secrets clients **hashés** (SHA-256 hex) ; les tokens aussi.
- **Rotation des refresh tokens** + révocation de la famille en cas de replay.
- `nonce` stocké avec le code et rejoué dans l'`id_token` (anti-replay OIDC).
- `at_hash` / `c_hash` dans l'`id_token`.
- Rate-limit dédié sur `/v1/oauth/token` (30 req/min/IP) en plus du global.

### Scopes supportés

| Scope | Contenu |
|---|---|
| `openid` | Identifiant de connexion (requis pour l'OIDC) |
| `profile` | `name`, `preferred_username`, `picture`, `pronouns` |
| `email` | `email`, `email_verified` |

---

## Configuration (variables d'environnement)

| Variable | Défaut dev | Rôle |
|---|---|---|
| `OAUTH_ISSUER` | `http://localhost:8090` | Origine canonique (`iss`) + endpoints absolus |
| `OAUTH_AUTHORIZE_URL` | `http://localhost:3010/oauth/authorize` | Page de consentement (apps/core) |
| `OAUTH_SIGNING_KEY` | *(vide → clé éphémère)* | Clé privée ES256 PEM (PKCS8/SEC1) |

> ⚠️ En production multi-instances, fournir une **clé de signature stable**
> (`OAUTH_SIGNING_KEY`), sinon chaque redémarrage régénère un `kid` et invalide
> les `id_token` déjà émis. Générer une P-256 :
> `openssl ecparam -genkey -name prime256v1 -noout -out ec.pem`.

---

## Quotas configurables (SystemConfig)

Les seuils ne sont **pas codés en dur** : l'API Go les lit dans `SystemConfig`
(préfixe `OAUTH_*`, éditables depuis `/admin/config`). Valeurs par défaut :

| Clé | Défaut | Rôle |
|---|---|---|
| `OAUTH_MAX_CLIENTS_PER_USER` | 3 | Apps max par compte |
| `OAUTH_MAX_REDIRECT_URIS` | 10 | Redirect URIs max par app |
| `OAUTH_MAX_ACTIVE_TOKENS_PER_USER` | 50 | Sessions actives max |
| `OAUTH_AUTH_CODE_TTL` | 60 | TTL code (secondes) |
| `OAUTH_ACCESS_TOKEN_TTL` | 3600 | TTL access token (secondes) |
| `OAUTH_REFRESH_TOKEN_TTL` | 2592000 | TTL refresh token (30 j) |
| `OAUTH_ID_TOKEN_TTL` | 3600 | TTL id_token |
| `OAUTH_ALLOW_INSECURE_REDIRECT` | false | Autorise `http://localhost` (dev) |

---

## Intégrer un client (côté RP)

1. Créer l'app dans Studio → `/developer/oauth` (nécessite l'accès API approuvé).
2. Noter le `clientId` + `clientSecret` (affiché une seule fois).
3. Redirect l'utilisateur vers l'endpoint d'autorisation :
   ```
   https://qoe.fi/oauth/authorize?response_type=code&client_id=...&
     redirect_uri=https://monapp.com/cb&scope=openid%20profile&
     state=xyz&nonce=abc&code_challenge=...&code_challenge_method=S256
   ```
4. Échanger le `code` (avec `code_verifier`) sur `POST /v1/oauth/token`
   (Basic `client_id:client_secret`).
5. Valider l'`id_token` (JWKS `/.well-known/jwks.json`) : `iss`, `aud`, `nonce`,
   `exp`, `at_hash`/`c_hash`.

---

## Maintenance

- **Purge périodique** : boucle `oauth.Cleanup` (1 h) supprime les codes
  usés/expirés et les tokens révoqués > 7 j (`DeleteExpiredOAuthArtifacts`,
  `DeleteRevokedOAuthTokens`).
- **Tests** : `go test ./internal/modules/oauth/` (flot PKCE complet, rotation,
  introspection, révocation, hachage des secrets) + smoke discovery dans
  `cmd/server/router_integration_test.go`.
