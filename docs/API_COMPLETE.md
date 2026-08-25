# 📡 qoe.fi — Documentation API complète (App + Créateurs)

> **Backend unique** : `apps/api` (Go `chi/v5`, `sqlc` + `pgx/v5`, `asynq`, `pgvector`) — `apps/api/cmd/server/main.go:120` = source de vérité du routage.
> **Dernière vérif code** : août 2026. Tous les exemples sont testés contre les handlers (`apps/api/internal/modules/*/handler.go`).
> **2 APIs sur 1 backend** :
>
> - **API App** (mobile `apps/mobile` + web) — JWT Supabase, `CombinedAuth` — `packages/sdk/src/client.ts:38`
> - **API Créateurs** (médias/CMS headless) — clés `qoe_live_*` + scopes — `docs/openapi/creators-api.yaml:1` + `VISION_CREATORS_API.md:1`

---

## 0. Conventions globales

### 0.1 Base URLs

| Env  | URL                     | Notes                         |
| ---- | ----------------------- | ----------------------------- |
| Prod | `https://api.qoe.fi`    | `Caddyfile.dev` -> `api:8080` |
| Dev  | `http://localhost:8080` | `go run ./cmd/server`         |

### 0.2 Auth — 3 modes (`apps/api/internal/middleware/auth.go`, `apikey.go`)

| Mode             | Header                                         | Middleware                | Quand                                                                                                                                                                                                                                     |
| ---------------- | ---------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Public**       | —                                              | —                         | `GET /healthz`, `GET /search/*`                                                                                                                                                                                                           |
| **OptionalAuth** | `Authorization: Bearer <JWT>` _optionnel_      | `auth.OptionalAuth`       | Lectures publiques avec paywall / `isFollowing` / `viewerUpvoted`. Si token présent il est validé (RS256/ES256 JWKS `SUPABASE_AUTH_URL/auth/v1/.well-known/jwks.json` ou fallback HS256 `sb_secret_…` base64), sinon on continue anonyme. |
| **CombinedAuth** | `Bearer <JWT>` **OU** `Bearer qoe_live_…`      | `auth.CombinedAuth(db)`   | Routes dashboard/app protégées. Clé API = hash SHA256 hex `GetApiKeyByHash`, `lastUsedAt` mis à jour, contexte `UserID+PublicationID+UmamiWebsiteID+Scopes` injecté. JWT bypass les scopes.                                               |
| **APIKeyAuth**   | `Bearer qoe_live_…` strict                     | `auth.APIKeyAuth(db)`     | `GET /v1/analytics/stats` en mode clé pure                                                                                                                                                                                                |
| **Interne**      | `x-qoe-internal-secret: <QOE_INTERNAL_SECRET>` | `events.requireSecret`    | `POST /internal/events/*`                                                                                                                                                                                                                 |
| **Stripe**       | `Stripe-Signature: t=…,v1=…`                   | `billing.verifySignature` | `POST /v1/webhooks/stripe` HMAC-SHA256 `t.body`, fenêtre ±300s                                                                                                                                                                            |

**Scopes clé API** (`apps/api/internal/middleware/apikey.go`) : `READ` | `WRITE` | `ANALYTICS` — défaut `AllScopes=[READ,WRITE,ANALYTICS]` si vide. Enforcés par `RequireAPIScope(scope)` -> `403 {"error":"Scope READ requis"}` sinon pass. JWT ne check pas les scopes (RBAC publication à la place).

### 0.3 Réponses & enveloppe

```ts
// apps/api/internal/response/response.go:14
200 OK  -> JSON quelconque
201 Created -> idem
400 {"error":"…"}  401 {"error":"…"} 403 {"error":"…"} 404 {"error":"…"} 500 {"error":"Internal Server Error"}
429 {"error":"Trop de requêtes. Réessayez dans un instant."} + Retry-After
// Certaines routes enveloppent {"data": …} (parité Hono). Le client officiel déplie auto :
json.data !== undefined ? json.data : json   // packages/sdk/src/client.ts:102
```

> **Côté mobile** `QoeApiClient.request()` retry GET/HEAD 3x avec backoff `400*2^(n)` sur `429`/`5xx` `packages/sdk/src/client.ts:55`.

### 0.4 Pagination — 3 dialectes

| Famille                               | Param in                                                        | Param out                                                              | Défaut                                              | Max | Fichier                                                                                             |
| ------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------- | --- | --------------------------------------------------------------------------------------------------- |
| **Feed / notifs / likes / followers** | `cursor` (offset int en string) + `limit`                       | `nextCursor: string`, `hasMore: bool`                                  | `limit=20` (feed), `30` (notifs), `50` (engagement) | 100 | `modules/feed/handler.go:95`, `modules/posts/handler.go:151`, `modules/notifications/handler.go:35` |
| **Bookmarks / highlights**            | `offset` (int) + `limit`                                        | tableau brut (pas de `nextCursor`) — client incrémente `offset+=limit` | `limit=20`                                          | 100 | `modules/highlights/handler.go:215`                                                                 |
| **Créateurs (Hono compat)**           | `page` (1-based) + `limit` + `category` slug + `published` bool | `{data:[], pagination:{total,page,limit,pages}}`                       | `page=1, limit=10`                                  | 100 | `modules/articles/handler.go:155`, `docs/openapi/creators-api.yaml:47`                              |

### 0.5 Rate limiting (`apps/api/internal/middleware/ratelimit.go`)

| Scope                 | Fenêtre                       | Clé Redis           | Réponse |
| --------------------- | ----------------------------- | ------------------- | ------- |
| Global public         | 120 req/min / IP              | `rl:{ip}:{bucket}`  | `429`   |
| Protégé               | 600 req/min / user (sinon IP) | `rl:{uid}:{bucket}` | `429`   |
| Token OAuth           | 30 req/min / IP               | `rl:{ip}:{bucket}`  | `429`   |
| _Bypass si Redis nil_ | —                             | —                   | pass    |

### 0.6 CORS

`Allow-Origin: http://localhost:3000-3003, https://qoe.fi, https://*.qoe.fi` — `Allow-Methods: GET,POST,PUT,PATCH,DELETE,OPTIONS` — `Allow-Headers: Authorization, Content-Type, X-Qoe-Signature` `apps/api/cmd/server/main.go:130`.

---

## 1. API App (mobile + web) — JWT / OptionalAuth

> Consommée via `QoeApiClient` `packages/sdk/src/client.ts:38` (`baseUrl = window.location.origin` ou `http://localhost:8080`). Types : `packages/sdk/src/types.ts:1`.

### 1.1 Health

```http
GET /healthz
GET /health
```

**Auth** : public. **Réponse** : `200 {"status":"ok"}` `apps/api/cmd/server/main.go:134`.

**Exemple**

```bash
curl http://localhost:8080/healthz
# {"status":"ok"}
```

```ts
const res = await fetch('http://localhost:8080/healthz').then((r) => r.json());
```

---

### 1.2 Feed — timelines

#### `GET /v1/feed/` — feed abonnements (following)

**Auth** : `CombinedAuth` (login requis). **Handler** : `modules/feed/handler.go:104`.
**Query** : `limit` 1-100 défaut 20, `cursor` offset défaut 0. `tab` ignoré (compat mobile).

**Réponse** `200` (`FeedResult` `packages/sdk/src/types.ts:134`) :

```json
{
  "items": [
    {
      "id": "slice-uuid",
      "rootPost": { "id":"…", "content":"…", "author":{…}, "liked":false, "reposted":false, "_count":{"likes":3} },
      "parentPost": null,
      "targetPost": {
        "id":"uuid","content":"Hello qoe.fi","authorId":"uuid","createdAt":"2026-08-21T10:00:00Z",
        "tags":["#qoe"],"imageUrl":null,"likeCount":3,"repostCount":1,"replyCount":2,
        "parentId":null,"rootId":null,"repostId":null,"replyRestriction":"everyone",
        "isPinned":false,"isHiddenByAuthor":false,
        "author":{"id":"uuid","name":"Ada","username":"ada","logoUrl":"https://…","isCertified":true,"isFollowing":false},
        "parent":null,"repost":null,
        "attachments":[{"id":"…","thoughtId":"…","type":"IMAGE","url":"https://…","altText":null,"width":1200,"height":800,"order":0}],
        "poll":null,
        "likes":[{"userId":"…"}],"reposts":[{"id":"…","userId":"…"}],
        "_count":{"likes":3,"replies":2,"reposts":1},"liked":false,"reposted":false
      },
      "isIncompleteThread": false,
      "hiddenIntermediateCount": 0
    }
  ],
  "nextCursor": "20",
  "hasMore": true
}
```

**Exemples**

```bash
curl -H "Authorization: Bearer $JWT" "http://localhost:8080/v1/feed?cursor=0&limit=20"
```

```ts
import { createQoeApiClient } from '@qoe/sdk';
const api = createQoeApiClient({ baseUrl: 'http://localhost:8080', getAuthToken: () => jwt });
const { ok, data, error } = await api.getFeed({ cursor: '0', limit: 20 });
if (ok) console.log(data.items[0].targetPost.content);
```

#### `GET /v1/feed/trending`

**Auth** : `OptionalAuth` (public, viewer optionnel). Handler `modules/feed/handler.go:117`. Même shape, pensées les plus engagées 7j.

```bash
curl "http://localhost:8080/v1/feed/trending?limit=10"
```

```ts
await api.getTrendingFeed({ limit: 10 });
```

#### `GET /v1/feed/articles` — articles récents (feed mobile)

**Auth** : `OptionalAuth`. Handler `modules/feed/handler.go:131`. `ArticleFeedResult` (`FeedArticle` miroir `ArticleCard` web).

**Réponse**

```json
{
  "items": [
    {
      "id": "uuid",
      "title": "Mon article",
      "slug": "mon-article",
      "content": "<html tronqué>",
      "isPremium": true,
      "visibility": "PUBLIC",
      "readingTime": 4,
      "createdAt": "2026-08-21T10:00:00Z",
      "publicationId": "uuid",
      "author": {
        "id": "…",
        "name": "Ada",
        "username": "ada",
        "logoUrl": "…",
        "isCertified": false
      },
      "publication": {
        "id": "…",
        "name": "Ada Lab",
        "slug": "ada-lab",
        "subdomain": "ada",
        "logoUrl": "…",
        "type": "PERSONAL"
      },
      "category": { "id": "…", "name": "Tech", "slug": "tech" }
    }
  ],
  "nextCursor": "20",
  "hasMore": true
}
```

```bash
curl "http://localhost:8080/v1/feed/articles?cursor=0&limit=20"
```

```ts
await api.getFeedArticles({ cursor: '0', limit: 20 });
```

#### `GET /v1/posts/{id}/thread` — fil complet

**Auth** : `OptionalAuth`. Handler `modules/feed/handler.go:78`. **Réponse** `200 {"post": ThreadData}` où `ThreadData = FeedPost & {replies: FeedPost[]}` triées date croissante, `parent` = chaîne d'ancêtres complète `root→…→parent` (août 2026).

```bash
curl -H "Authorization: Bearer $JWT" http://localhost:8080/v1/posts/POST_ID/thread
```

```ts
const { data } = await api.getThread('POST_ID');
console.log(data.post.replies.length, data.post.parent?.content);
```

#### `GET /v1/users/{username}/posts` — pensées d'un profil (public)

**Auth** : `OptionalAuth`. Résout `slug` OU `subdomain` -> propriétaire -> pensées publiques. `404` si introuvable. Même `FeedResult`.

```bash
curl "http://localhost:8080/v1/users/ada/posts?cursor=0&limit=20"
```

```ts
await api.getUserPosts('ada', { cursor: '0', limit: 20 });
```

#### `GET /v1/users/{username}/articles` — articles d'un profil (public)

**Auth** : `OptionalAuth`. `ArticleFeedResult`.

```bash
curl "http://localhost:8080/v1/users/ada/articles?cursor=0&limit=10"
```

```ts
await api.getProfileArticles('ada', { limit: 10 });
```

---

### 1.3 Pensées (posts) — CRUD & interactions (`modules/posts/handler.go:337`)

Toutes les shapes `FeedPost` = `Thought` unifiée (août 2026) `packages/sdk/src/types.ts:148` : plus de double shape `viewerLiked/viewerReposted`.

#### `POST /v1/posts` (alias `POST /v1/thoughts`)

**Auth** : `CombinedAuth`. Body `createThoughtInput` :

| Champ              | Type                                    | Requis                | Notes                                                           |
| ------------------ | --------------------------------------- | --------------------- | --------------------------------------------------------------- |
| `content`          | string                                  | oui si pas `repostId` | ≤500c, URLs externes comptées 20, internes 0                    |
| `tags`             | string[]                                | non                   | `["#qoe"]`                                                      |
| `imageUrl`         | string\|null                            | non                   | déprécié, préférer `attachments`                                |
| `parentId`         | string\|null                            | non                   | réponse (thread)                                                |
| `repostId`         | string\|null                            | non                   | citation si `content` non vide, repost pur sinon                |
| `replyRestriction` | string                                  | non                   | `everyone` (déf) \| `subscribers` \| `following` \| `mentioned` |
| `attachments`      | `[{url,type,altText,width,height}]`     | non                   | `type:"IMAGE"`                                                  |
| `poll`             | `{options:["A","B"], durationHours:24}` | non                   | 2-4 options                                                     |

**Réponse** `201 FeedPost`

**Exemples**

```bash
# Pensée simple
curl -X POST http://localhost:8080/v1/posts \
 -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
 -d '{"content":"Hello qoe.fi ! #qoe","tags":["#qoe"]}'

# Pensée avec image + sondage
curl -X POST http://localhost:8080/v1/posts \
 -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
 -d '{"content":"Quel est votre fav ?","attachments":[{"url":"https://cdn.qoe.fi/img.jpg","type":"IMAGE","width":1200,"height":800}],"poll":{"options":["A","B","C"],"durationHours":24}}'

# Citation (repost avec commentaire)
curl -X POST http://localhost:8080/v1/posts \
 -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
 -d '{"content":"Trop vrai 👏","repostId":"ORIGINAL_POST_ID"}'
```

```ts
await api.createThought('Hello qoe.fi !', { tags: ['#qoe'] });
await api.createThought('Trop vrai', { repostId: 'ORIGINAL_POST_ID' });
```

#### `GET /v1/posts/{id}`

**Auth** : `OptionalAuth`. `200 FeedPost`, `404`.

```bash
curl http://localhost:8080/v1/posts/POST_ID
```

```ts
await api.getThought('POST_ID');
```

#### `DELETE /v1/posts/{id}`

**Auth** : `CombinedAuth` (auteur uniquement). `200 {"deleted":true}`.

```bash
curl -X DELETE -H "Authorization: Bearer $JWT" http://localhost:8080/v1/posts/POST_ID
```

```ts
await api.deleteThought('POST_ID');
```

#### `POST /v1/posts/{id}/like` (alias `/v1/thoughts/{id}/like`)

**Auth** : `CombinedAuth`. Toggle idempotent. `200 {"liked":true|false}` (pas de compteur -> dériver localement + resync feed).

```bash
curl -X POST -H "Authorization: Bearer $JWT" http://localhost:8080/v1/posts/POST_ID/like
```

```ts
const { data } = await api.toggleLike('POST_ID'); // { liked: true }
```

#### `POST /v1/posts/{id}/repost` (alias `/v1/thoughts/{id}/repost`)

Idem -> `{"reposted":bool}`.

```bash
curl -X POST -H "Authorization: Bearer $JWT" http://localhost:8080/v1/posts/POST_ID/repost
```

```ts
await api.toggleRepost('POST_ID');
```

#### `POST /v1/posts/{id}/reply`

**Auth** : `CombinedAuth`. Body `{"content":"…"}` threadgate vérifié serveur. `201 FeedPost`.

```bash
curl -X POST -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
 -d '{"content":"Ma réponse"}' http://localhost:8080/v1/posts/POST_ID/reply
```

```ts
await api.replyToThought('POST_ID', 'Ma réponse');
```

#### `POST /v1/posts/{id}/bookmark` (alias `/v1/thoughts/{id}/bookmark`)

**Auth** : `CombinedAuth`. Toggle bookmark **article** (Go mappe `postId`->article, `targetType` ignoré). `200 {"bookmarked":bool}`.

```bash
curl -X POST -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
 -d '{"targetType":"article"}' http://localhost:8080/v1/posts/ARTICLE_ID/bookmark
```

```ts
await api.toggleBookmark('ARTICLE_ID', 'article');
```

#### `POST /v1/posts/{id}/pin`

Toggle épingle profil. `200 {"pinned":bool}`.

```bash
curl -X POST -H "Authorization: Bearer $JWT" http://localhost:8080/v1/posts/POST_ID/pin
```

```ts
await api.togglePin('POST_ID');
```

#### `GET /v1/posts/{id}/likes|reposts|quotes?cursor=&limit=`

**Auth** : `OptionalAuth` (public). `limit` 1-100 déf 50, `cursor` offset.

- `likes`/`reposts` -> `EngagementPage {items:[{id,name,username,logoUrl,isCertified,followedAt}], nextCursor, hasMore}`
- `quotes` -> `QuotesPage {items:[FeedPost], nextCursor, hasMore}` (posts avec `repostId` + `content` non vide)

```bash
curl "http://localhost:8080/v1/posts/POST_ID/likes?cursor=0&limit=20"
curl "http://localhost:8080/v1/posts/POST_ID/reposts?cursor=0&limit=20"
curl "http://localhost:8080/v1/posts/POST_ID/quotes?cursor=0&limit=20"
```

```ts
await api.getPostLikes('POST_ID', { cursor: 0, limit: 20 });
await api.getPostReposts('POST_ID', { cursor: 0 });
await api.getPostQuotes('POST_ID', { cursor: 0 });
```

#### `POST /v1/posts/{id}/poll/vote` & `/poll/unvote`

**Auth** : `CombinedAuth`. Vote remplace l'ancien (ON CONFLICT DO UPDATE). Unvote retire.

```bash
curl -X POST -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
 -d '{"optionId":"OPT_ID"}' http://localhost:8080/v1/posts/POST_ID/poll/vote
# -> 200 FeedPoll {id,thoughtId,expiresAt,isExpired,totalVotes,userVotedOptionId,options:[{voteCount,percentage}]}

curl -X POST -H "Authorization: Bearer $JWT" http://localhost:8080/v1/posts/POST_ID/poll/unvote
```

```ts
await api.votePoll('POST_ID', 'OPT_ID');
await api.unvotePoll('POST_ID');
```

#### `POST /v1/users/{id}/block` & `/mute`

Toggle idempotent `BlockedUser`/`MutedUser`. `200 {"blocked":bool}` / `{"muted":bool}`.

```bash
curl -X POST -H "Authorization: Bearer $JWT" http://localhost:8080/v1/users/USER_ID/block
curl -X POST -H "Authorization: Bearer $JWT" http://localhost:8080/v1/users/USER_ID/mute
```

```ts
await api.toggleBlockUser('USER_ID');
await api.toggleMuteUser('USER_ID');
```

#### `POST /v1/reports`

Body `{targetId, targetType:"thought|article|user|comment", reason, details?}` -> `200 {"success":true}` `pending` modération.

```bash
curl -X POST -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
 -d '{"targetId":"…","targetType":"thought","reason":"spam","details":"…"}' \
 http://localhost:8080/v1/reports
```

```ts
await api.createReport({ targetId: '…', targetType: 'thought', reason: 'spam' });
```

---

### 1.4 Utilisateurs & follow (`modules/creator/handler.go:722`)

#### `GET /v1/users/me`

**Auth** : `CombinedAuth`. **Réponse** enveloppée `data` :

```json
{
  "data": {
    "id": "uuid",
    "email": "ada@qoe.fi",
    "username": "ada",
    "name": "Ada",
    "role": "creator",
    "isCertified": false,
    "isShadowbanned": false,
    "isSuspended": false,
    "suspendReason": null,
    "forceStandardTheme": false,
    "onboardingText": null,
    "logoUrl": "https://…",
    "publicationId": "uuid",
    "advancedSettingsMode": false,
    "hasCompletedOnboarding": true,
    "apiAccessStatus": "approved",
    "apiApplicationReason": null,
    "walletBalanceCents": 0,
    "createdAt": "2026-08-21T10:00:00Z",
    "updatedAt": "…",
    "stats": { "followingCount": 5, "followersCount": 12 }
  }
}
```

```bash
curl -H "Authorization: Bearer $JWT" http://localhost:8080/v1/users/me
```

```ts
const { data } = await api.getMyProfile(); // MyProfileData
```

#### `GET /v1/users/{username}`

**Auth** : `OptionalAuth`. `username` = `slug` OU `subdomain`. Si viewer connecté, `isFollowing` réel.

```json
{
  "data": {
    "id": "pub-uuid",
    "ownerUserId": "user-uuid",
    "name": "Ada Lab",
    "slug": "ada-lab",
    "subdomain": "ada",
    "customDomain": null,
    "heroText": "…",
    "logoUrl": "…",
    "headerImageUrl": "…",
    "isCertified": false,
    "isFollowing": false,
    "pronouns": null,
    "createdAt": "…",
    "type": "PERSONAL",
    "_count": { "followers": 12, "following": 3, "articles": 42 }
  }
}
```

```bash
curl "http://localhost:8080/v1/users/ada"
curl -H "Authorization: Bearer $JWT" "http://localhost:8080/v1/users/ada" # isFollowing rempli
```

```ts
await api.getUserProfile('ada');
```

#### `POST /v1/users/{id}/follow`

**Auth** : `CombinedAuth`. `id` = `publicationId` OU `slug` résolu. Self-follow -> `400`. Toggle -> `200 {"data":{"following":bool,"followersCount":int}}` + notif `FOLLOW` (dédupliquée, prefs respectées) `modules/creator/handler.go:559`.

```bash
curl -X POST -H "Authorization: Bearer $JWT" http://localhost:8080/v1/users/PUB_ID/follow
```

```ts
await api.toggleFollowUser('PUB_ID');
```

#### `GET /v1/users/{username}/followers|following?cursor=&limit=`

**Auth** : `OptionalAuth` (mais viewer remplit `viewerFollows`). `limit` 50 déf, `cursor` offset.

```json
{
  "items": [
    {
      "id": "user-uuid",
      "publicationId": "pub-uuid",
      "name": "Bob",
      "username": "bob",
      "logoUrl": "…",
      "isCertified": false,
      "followedAt": "2026-08-21T10:00:00Z",
      "viewerFollows": false
    }
  ],
  "nextCursor": "50",
  "hasMore": false
}
```

```bash
curl -H "Authorization: Bearer $JWT" "http://localhost:8080/v1/users/ada/followers?cursor=0&limit=20"
curl "http://localhost:8080/v1/users/ada/following?cursor=0&limit=20"
```

```ts
await api.getUserFollowers('ada', { cursor: 0, limit: 20 });
await api.getUserFollowing('ada', { cursor: 0 });
```

---

### 1.5 Articles — lecture publique & paywall (`modules/articles/handler.go:426` + `content.go` zéro-fuite)

Le **contrat app** (paywall) est distinct du **contrat créateur** (CMS) : même handler, double mode `getBySlug` `handler.go:52`.

#### `GET /v1/articles/{slug}?publicationId=&viewerEmail=`

**Auth** : `OptionalAuth` (public). **Double dispatch** :

| Header                             | Comportement                                                                                                                                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Bearer qoe_live_…` + scope `READ` | **Mode créateur** -> `200 {"data": CreatorItem{contentHtml tronqué, category, paywallMeta}}` publication résolue depuis clé                                                                                  |
| sinon                              | **Mode public** -> `publicationId` **requis** (sinon `400`), `viewerEmail` optionnel pour entitlement. Troncature serveur **zéro-fuite** (marqueurs `<!--kg-gated-block-->`, `data-type="paywall-divider"`). |

**Réponse publique** :

```json
{
  "id": "uuid",
  "title": "Mon article",
  "slug": "mon-article",
  "content": "<html tronqué au paywall>",
  "isTruncated": true,
  "accessGranted": false,
  "visibility": "PAID_SUBSCRIBERS",
  "readingTime": 4,
  "isPremium": true,
  "createdAt": "2026-08-21T10:00:00Z",
  "updatedAt": "…",
  "paywallMeta": {
    "visibility": "PAID_SUBSCRIBERS",
    "teaserParagraphsCount": 3,
    "totalLengthBytes": 12000,
    "previewLengthBytes": 2400,
    "requiredTierId": null
  },
  "category": { "id": "…", "name": "Tech", "slug": "tech" },
  "author": { "id": "…", "name": "Ada", "username": "ada", "logoUrl": "…" },
  "publication": { "id": "…", "name": "Ada Lab", "slug": "ada-lab", "subdomain": "ada" }
}
```

**Status** : `400` si `publicationId` manquant, `404` si slug inconnu.

**Exemples**

```bash
# Public anonyme (tronqué)
curl "http://localhost:8080/v1/articles/mon-article?publicationId=PUB_ID"

# Abonné (contenu complet si entitlement)
curl "http://localhost:8080/v1/articles/mon-article?publicationId=PUB_ID&viewerEmail=ada@qoe.fi"

# Mode créateur (clé API -> CreatorItem)
curl -H "Authorization: Bearer qoe_live_XXX" "http://localhost:8080/v1/articles/mon-article"
# -> {"data":{"id":"…","title":"…","contentHtml":"<tronqué>","isTruncated":true,"visibility":"…","category":{…},"paywallMeta":{…}}}
```

```ts
await api.getArticle('mon-article', 'PUB_ID');
```

#### `GET /v1/articles/{id}/similar?limit=`

**Auth** : public. Recommandations `pgvector` `jina-embeddings-v3` `1024`. Vide si pas indexé (pas d'erreur). `404` si article inconnu.

```json
{
  "items": [
    {
      "id": "…",
      "title": "…",
      "slug": "…",
      "isPremium": true,
      "readingTime": 3,
      "createdAt": "…",
      "publicationId": "…",
      "authorId": "…",
      "authorName": "Ada",
      "authorUsername": "ada",
      "authorLogo": "…",
      "publicationName": "Ada Lab",
      "score": 0.87
    }
  ]
}
```

```bash
curl "http://localhost:8080/v1/articles/ARTICLE_ID/similar?limit=6"
```

```ts
await api.getSimilarArticles('ARTICLE_ID', 6);
```

#### Commentaires d'articles (talk)

| Méthode | Route                               | Auth                   | Body                              | Réponse                                                                           |
| ------- | ----------------------------------- | ---------------------- | --------------------------------- | --------------------------------------------------------------------------------- |
| GET     | `/v1/articles/{id}/comments`        | public                 | —                                 | `200 Comment[] {id,content,createdAt,author:{id,name,username,logoUrl},replies?}` |
| POST    | `/v1/articles/{id}/comments`        | `CombinedAuth` (WRITE) | `{"content":"…","parentId":"uuid" | null}`                                                                            | `201 Comment` |
| DELETE  | `/v1/articles/comments/{commentId}` | auteur uniquement      | —                                 | `200 {"success":true}` `403` sinon                                                |

```bash
curl "http://localhost:8080/v1/articles/ARTICLE_ID/comments"
curl -X POST -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
 -d '{"content":"Super article !"}' http://localhost:8080/v1/articles/ARTICLE_ID/comments
curl -X DELETE -H "Authorization: Bearer $JWT" http://localhost:8080/v1/articles/comments/COMMENT_ID
```

---

### 1.6 Bibliothèque & surlignages (`modules/highlights/handler.go:228`)

#### `GET /v1/bookmarks?offset=&limit=`

**Auth** : `CombinedAuth`. `limit` 20 déf, `max 100`, `offset` int.

**Réponse** `200 BookmarkItem[]` :

```json
[
  {
    "bookmarkId": "…",
    "bookmarkedAt": "2026-08-21T10:00:00Z",
    "articleId": "…",
    "articleTitle": "…",
    "articleSlug": "…",
    "readingTime": 4,
    "isPremium": true,
    "articleCreatedAt": "…",
    "publicationId": "uuid",
    "publicationName": "…",
    "publicationSlug": "…",
    "subdomain": "ada",
    "author": { "id": "…", "name": "Ada", "username": "ada", "logoUrl": "…" }
  }
]
```

```bash
curl -H "Authorization: Bearer $JWT" "http://localhost:8080/v1/bookmarks?offset=0&limit=20"
```

```ts
await api.getBookmarks({ offset: 0, limit: 20 });
```

#### `GET /v1/me/highlights?offset=&limit=` + `GET /v1/me/highlights/count`

Idem, mes surlignages. `count` = `len(MyHighlights 1000)`.

```json
[
  {
    "id": "…",
    "text": "…",
    "note": "ma note",
    "isPublic": false,
    "isOfficial": false,
    "upvotesCount": 0,
    "readerId": "…",
    "articleId": "…",
    "createdAt": "…",
    "articleTitle": "…",
    "articleSlug": "…",
    "publicationId": "…",
    "publicationName": "…",
    "publicationSlug": "…"
  }
]
```

```bash
curl -H "Authorization: Bearer $JWT" "http://localhost:8080/v1/me/highlights?offset=0&limit=20"
curl -H "Authorization: Bearer $JWT" http://localhost:8080/v1/me/highlights/count # {"count":12}
```

```ts
await api.getMyHighlights({ offset: 0, limit: 20 });
```

#### `GET /v1/articles/{id}/highlights`

**Auth** : `OptionalAuth` (publics + les siens privés, avec `viewerUpvoted`).

```json
[
  {
    "id": "…",
    "text": "…",
    "note": null,
    "isPublic": true,
    "isOfficial": false,
    "upvotesCount": 4,
    "readerId": "…",
    "articleId": "…",
    "createdAt": "…",
    "reader": { "id": "…", "name": "Ada", "username": "ada", "logoUrl": "…" },
    "viewerUpvoted": false,
    "commentsCount": 1
  }
]
```

```bash
curl "http://localhost:8080/v1/articles/ARTICLE_ID/highlights"
curl -H "Authorization: Bearer $JWT" "http://localhost:8080/v1/articles/ARTICLE_ID/highlights"
```

```ts
await api.getArticleHighlights('ARTICLE_ID');
```

#### `POST /v1/articles/{id}/highlights` + `DELETE /v1/highlights/{id}`

**Auth** : `CombinedAuth`. Body `{"text":"…","note":"…|null","isPublic":bool}` -> `201 Highlight`. Delete auteur uniquement -> `200 {"success":true}`.

```bash
curl -X POST -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
 -d '{"text":"Passage important","note":"À creuser","isPublic":true}' \
 http://localhost:8080/v1/articles/ARTICLE_ID/highlights

curl -X DELETE -H "Authorization: Bearer $JWT" http://localhost:8080/v1/highlights/HL_ID
```

```ts
await api.createHighlight('ARTICLE_ID', { text: '…', note: '…', isPublic: true });
await api.deleteHighlight('HL_ID');
```

#### `POST /v1/highlights/{id}/upvote`

Toggle -> `200 {"upvoted":bool,"upvotesCount":int}`.

```bash
curl -X POST -H "Authorization: Bearer $JWT" http://localhost:8080/v1/highlights/HL_ID/upvote
```

```ts
await api.toggleHighlightUpvote('HL_ID');
```

#### `GET/POST /v1/highlights/{id}/comments` & `DELETE /v1/highlights/comments/{commentId}`

- GET public (mais handler protégé actuellement), POST/DELETE protégés. Body `{"content":"…"}` -> `201 AnnotationComment`.

```bash
curl http://localhost:8080/v1/highlights/HL_ID/comments
curl -X POST -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
 -d '{"content":"Mon commentaire"}' http://localhost:8080/v1/highlights/HL_ID/comments
```

```ts
await api.getHighlightComments('HL_ID');
await api.createHighlightComment('HL_ID', 'Mon commentaire');
```

---

### 1.7 Notifications (`modules/notifications/handler.go:150`)

#### `GET /v1/notifications?filter=&limit=&cursor=`

**Auth** : `CombinedAuth`. `filter`: `all` (déf) | `mentions` (`MENTION`) | `replies` (`REPLY,COMMENT`) | `likes` (`LIKE`). `limit` 30 déf max 100, `cursor` offset.

**Réponse** groupée 48h (même `type+target` -> `senders` agrégés) :

```json
{
  "notifications": [
    {
      "id": "…",
      "type": "LIKE",
      "isRead": false,
      "createdAt": "…",
      "thoughtId": "…",
      "articleId": null,
      "commentId": null,
      "thought": { "id": "…", "content": "…", "createdAt": "…" },
      "article": { "id": "…", "title": "…", "slug": "…" },
      "publication": { "id": "…", "name": "…", "slug": "…" },
      "senders": [
        { "id": "…", "name": "Ada", "username": "ada", "logoUrl": "…", "isCertified": false }
      ],
      "totalCount": 3
    }
  ],
  "nextCursor": "30"
}
```

```bash
curl -H "Authorization: Bearer $JWT" "http://localhost:8080/v1/notifications?filter=all&limit=30&cursor=0"
```

```ts
await api.getNotifications({ filter: 'all', cursor: 0, limit: 30 });
```

#### `GET /v1/notifications/unread-count`

`200 {"count":3}`

```bash
curl -H "Authorization: Bearer $JWT" http://localhost:8080/v1/notifications/unread-count
```

```ts
await api.getUnreadNotificationCount();
```

#### `POST /v1/notifications/read`

Body `{"notificationIds":["uuid",…]}` **vide = tout marquer lu** (normalisé `[]`->`NULL` SQL).

```bash
curl -X POST -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
 -d '{"notificationIds":[]}' http://localhost:8080/v1/notifications/read

curl -X POST -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
 -d '{"notificationIds":["id1","id2"]}' http://localhost:8080/v1/notifications/read
```

```ts
await api.markNotificationsRead(); // tout
await api.markNotificationsRead(['id1', 'id2']);
```

#### `GET /v1/notifications/preferences` & `PATCH /v1/notifications/preferences`

Body PATCH merge partiel `{pushLikes:false, emailFollows:true, …}` allowlist : `emailLikes,pushLikes,emailReplies,pushReplies,emailComments,pushComments,emailMentions,pushMentions,emailFollows,pushFollows,emailReposts,pushReposts,emailMedia,pushMedia` (déf `true`).

```bash
curl -H "Authorization: Bearer $JWT" http://localhost:8080/v1/notifications/preferences
curl -X PATCH -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
 -d '{"pushLikes":false,"pushReplies":false}' http://localhost:8080/v1/notifications/preferences
```

#### `POST /v1/notifications/media-invite` & `/media-member-joined`

Body `{"recipientId":"uuid","publicationId":"uuid"}` sender = user auth -> `200 {"success":true}`.

```bash
curl -X POST -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
 -d '{"recipientId":"USER_ID","publicationId":"PUB_ID"}' \
 http://localhost:8080/v1/notifications/media-invite
```

---

### 1.8 Recherche (`modules/search/handler.go:125`)

| Route                            | Auth   | Query                                                | Réponse                                                                                                          |
| -------------------------------- | ------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `GET /search/articles?q=`        | public | `q` (vide -> `hits:[]`), `Limit:10` hard Meilisearch | `200 {"hits":[…],"estimatedTotalHits":int}` (maps bruts meilisearch)                                             |
| `GET /search/semantic?q=&limit=` | public | `q`, `limit` déf 10                                  | `200 {"items": SemanticItem[]}` ou `503 {"error":"Recherche sémantique indisponible"}` si `EMBEDDING_URL` absent |

```bash
curl "http://localhost:8080/search/articles?q=climat"
curl "http://localhost:8080/search/semantic?q=intelligence%20artificielle&limit=5"
```

```ts
await api.searchArticles('climat');
// semantic via fetch direct (pas dans QoeApiClient)
await fetch('http://localhost:8080/search/semantic?q=IA&limit=5').then((r) => r.json());
```

---

### 1.9 Settings (profil créateur app) (`modules/settings/handler.go:232`)

| Méthode | Route                                     | Auth                                                     | Body / Query                                                                                                                                                                                               | Réponse                                      |
| ------- | ----------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| GET     | `/v1/settings/subdomain/check?subdomain=` | public                                                   | `subdomain` regex `^[a-z0-9]+(?:-[a-z0-9]+)*$` 3-30, blacklist `admin,api,www…`                                                                                                                            | `200 {"available":bool,"reason"?:string}`    |
| PATCH   | `/v1/settings/profile`                    | `CombinedAuth`                                           | `{"publicationId":"…", name, heroText, accentColor, layoutStyle, logoUrl, headerImageUrl, fontFamily, themeMode, footerText, seoTitle, seoDescription, supportUrl, allowIndexing, onboardingText}` partiel | `200 GetUserForSettingsRow`                  |
| POST    | `/v1/settings/subdomain`                  | `CombinedAuth`                                           | `{"publicationId":"…","subdomain":"ada"}`                                                                                                                                                                  | `200 {"success":true,"subdomain":"ada"}`     |
| PUT     | `/v1/settings/navigation`                 | `CombinedAuth`                                           | `{"publicationId":"…","links":[{"label":"…","url":"https://…"}]}` `isExternal=url.startsWith(http)`                                                                                                        | `200 {"success":true}`                       |
| PUT     | `/v1/settings/social`                     | `CombinedAuth`                                           | `{"publicationId":"…","links":[{"platform":"twitter","url":"https://…"}]}`                                                                                                                                 | `200 {"success":true}`                       |
| POST    | `/v1/settings/api-application`            | `CombinedAuth`                                           | `{"reason":"≥10 chars"}`                                                                                                                                                                                   | `200 {"success":true}`                       |
| POST    | `/v1/settings/api-keys`                   | `CombinedAuth` (`apiAccessStatus==approved` sinon `403`) | `{"name"?:string,"scopes"?:["READ","WRITE","ANALYTICS"]}` vide -> `AllScopes`                                                                                                                              | `200 {"apiKey":"qoe_live_…"}` **affiché 1x** |
| DELETE  | `/v1/settings/api-keys/{id}`              | `CombinedAuth`                                           | —                                                                                                                                                                                                          | `200 {"success":true}`                       |
| POST    | `/v1/settings/onboarding`                 | `CombinedAuth`                                           | `{"name","heroText","subdomain","layoutStyle"}` -> crée/link publication perso slugifié                                                                                                                    | `200 {"success":true}`                       |

**Exemples**

```bash
curl "http://localhost:8080/v1/settings/subdomain/check?subdomain=ada"

curl -X PATCH -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
 -d '{"publicationId":"PUB_ID","name":"Ada Lab","heroText":"Hello"}' \
 http://localhost:8080/v1/settings/profile

curl -X POST -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
 -d '{"name":"prod","scopes":["READ","WRITE"]}' http://localhost:8080/v1/settings/api-keys
# -> {"apiKey":"qoe_live_abc123..."}  # Copie immédiate, hashé en base

curl -X DELETE -H "Authorization: Bearer $JWT" http://localhost:8080/v1/settings/api-keys/KEY_ID
```

---

## 2. API Créateurs (CMS headless / intégration média)

> Spec source : `docs/openapi/creators-api.yaml:1` (contrat cible). Impl Go : `modules/articles/*` + `modules/creator/*` + `modules/webhooks/*` + `modules/analytics/*`.
> Auth : `Bearer qoe_live_*` (délivrée après revue manuelle `apiAccessStatus=approved`). Scopes enforcés. Une clé = une publication = isolation sécurité.

### 2.1 Articles — contrat créateur complet

#### `GET /v1/articles?page=&limit=&category=&published=`

**Auth** : `CombinedAuth` + `RequireAPIScope(READ)`. **2 modes** `modules/articles/handler.go:155` :

- **Clé API** (`PublicationID` en contexte) -> **contrat créateur paginé** (contenu tronqué, publiés par défaut) :

```json
{
  "data": [
    {
      "id": "uuid",
      "title": "Mon article",
      "slug": "mon-article",
      "contentHtml": "<p>tronqué au paywall</p>",
      "isTruncated": true,
      "visibility": "PAID_SUBSCRIBERS",
      "readingTime": 4,
      "isPremium": true,
      "createdAt": "2026-08-21T10:00:00Z",
      "updatedAt": "…",
      "category": { "id": "…", "name": "Tech", "slug": "tech", "description": null },
      "paywallMeta": {
        "visibility": "PAID_SUBSCRIBERS",
        "teaserParagraphsCount": 3,
        "totalLengthBytes": 12000,
        "previewLengthBytes": 2400,
        "requiredTierId": null
      }
    }
  ],
  "pagination": { "total": 42, "page": 1, "limit": 10, "pages": 5 }
}
```

Query : `page` 1-based déf 1, `limit` 1-100 déf 10, `category` slug filtre, `published` bool déf `true` (seuls publiés si `true`).

- **JWT dashboard** -> tableau brut `ArticleResponse[]` 100 max, brouillons inclus, récents d'abord (parité Prisma).

**Exemples**

```bash
# Clé API : page 1 des publiés tech
curl -H "Authorization: Bearer qoe_live_XXX" \
 "http://localhost:8080/v1/articles?page=1&limit=10&category=tech&published=true"

# Clé API : brouillons inclus
curl -H "Authorization: Bearer qoe_live_XXX" \
 "http://localhost:8080/v1/articles?page=1&published=false"

# JWT : tout (dashboard studio via goFetch)
curl -H "Authorization: Bearer $JWT" "http://localhost:8080/v1/articles?publicationId=PUB_ID"
```

#### `POST /v1/articles`

**Auth** : `CombinedAuth` + `WRITE`. RBAC `owner/editor/writer/viewer` + média `PermCreateArticle`. `writer` ne peut pas `published:true` -> créé `DRAFT`.

**Body** `createInput` `handler.go:103` :

```json
{
  "publicationId": "uuid (req)",
  "title": "Hello (req)",
  "slug": "hello (auto-slugify si vide)",
  "content": "# Hello\nWorld",
  "contentFormat": "markdown|html (req si content fourni, validé via IsValidContentFormat)",
  "isPremium": false,
  "visibility": "PUBLIC|MEMBERS_ONLY|PAID_SUBSCRIBERS|TIER_SPECIFIC (déf PUBLIC)",
  "categoryId": "uuid|null",
  "tierId": "uuid|null",
  "seoTitle": "…",
  "seoDescription": "…",
  "readingTime": 4,
  "published": false,
  "status": "DRAFT|SUBMITTED|PUBLISHED (déf DRAFT, MEDIA workflow gates)"
}
```

**Réponse** `201 ArticleResponse` (ou `201 {"id":"…"}` si fetch échoue).

**Exemples**

```bash
# Markdown (Ghost/Payload)
curl -X POST -H "Authorization: Bearer qoe_live_XXX" -H "Content-Type: application/json" \
 -d '{"publicationId":"PUB_ID","title":"Hello","content":"# Hello\nWorld","contentFormat":"markdown","visibility":"PUBLIC","published":false}' \
 http://localhost:8080/v1/articles

# HTML (WordPress) + paywall + premium
curl -X POST -H "Authorization: Bearer qoe_live_XXX" -H "Content-Type: application/json" \
 -d '{"publicationId":"PUB_ID","title":"Premium","content":"<p>Teaser</p><!--kg-gated-block--><p>Payant</p>","contentFormat":"html","isPremium":true,"visibility":"PAID_SUBSCRIBERS","categoryId":"CAT_ID","readingTime":5}' \
 http://localhost:8080/v1/articles

# Publication directe (editor/owner uniquement)
curl -X POST -H "Authorization: Bearer qoe_live_XXX" -H "Content-Type: application/json" \
 -d '{"publicationId":"PUB_ID","title":"Direct","content":"…","contentFormat":"markdown","published":true,"status":"PUBLISHED"}' \
 http://localhost:8080/v1/articles
```

```js
// Node
await fetch('http://localhost:8080/v1/articles', {
  method: 'POST',
  headers: { Authorization: 'Bearer qoe_live_XXX', 'Content-Type': 'application/json' },
  body: JSON.stringify({
    publicationId: 'PUB_ID',
    title: 'Hello',
    content: '# Hello',
    contentFormat: 'markdown',
  }),
}).then((r) => r.json());
```

#### `GET /v1/articles/by-id/{id}` & `GET /v1/articles/capabilities?publicationId=`

**Auth** : `CombinedAuth` + `READ`. `by-id` = lecture éditeur RBAC contenu complet. `capabilities` -> `200 {isMedia,canPublish,canSubmit,canReview,role,workspaceName}`.

```bash
curl -H "Authorization: Bearer qoe_live_XXX" http://localhost:8080/v1/articles/by-id/ARTICLE_ID
curl -H "Authorization: Bearer $JWT" "http://localhost:8080/v1/articles/capabilities?publicationId=PUB_ID"
# -> {"isMedia":true,"canPublish":true,"canSubmit":true,"canReview":false,"role":"editor","workspaceName":"Ada Lab"}
```

#### `PATCH /v1/articles/{id}` & `POST /v1/articles/{id}/publish` & `POST /v1/articles/{id}/review`

| Route                                           | Auth    | Body                                                                                                                                           | Réponse                                                                            |
| ----------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `PATCH /v1/articles/{id}`                       | `WRITE` | `updateInput {title,content,contentFormat,slug,isPremium,categoryId,seoTitle,seoDescription,readingTime,published,status,activePublicationId}` | `200 ArticleResponse`                                                              |
| `POST /v1/articles/{id}/publish`                | `WRITE` | —                                                                                                                                              | `200 {"published":true}` ; RBAC `editor/owner` + enqueue `article.published` asynq |
| `POST /v1/articles/{id}/review`                 | `WRITE` | `{"approve":bool}`                                                                                                                             | `200 ArticleResponse` (MEDIA workflow)                                             |
| `DELETE /v1/articles/{id}?activePublicationId=` | `WRITE` | query `activePublicationId` RBAC                                                                                                               | `200 {"deleted":true}`                                                             |

```bash
curl -X PATCH -H "Authorization: Bearer qoe_live_XXX" -H "Content-Type: application/json" \
 -d '{"title":"Nouveau titre","content":"# maj","contentFormat":"markdown","activePublicationId":"PUB_ID"}' \
 http://localhost:8080/v1/articles/ARTICLE_ID

curl -X POST -H "Authorization: Bearer qoe_live_XXX" http://localhost:8080/v1/articles/ARTICLE_ID/publish

curl -X POST -H "Authorization: Bearer qoe_live_XXX" -H "Content-Type: application/json" \
 -d '{"approve":true}' http://localhost:8080/v1/articles/ARTICLE_ID/review

curl -X DELETE -H "Authorization: Bearer qoe_live_XXX" "http://localhost:8080/v1/articles/ARTICLE_ID?activePublicationId=PUB_ID"
```

---

### 2.2 Catégories (`modules/creator/handler.go:65`)

| Méthode | Route                           | Scope   | Body                                                                                   | Réponse                                                             |
| ------- | ------------------------------- | ------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| GET     | `/v1/categories?publicationId=` | `READ`  | —                                                                                      | `200 {"data":[{"id","name","slug","description","articlesCount"}]}` |
| POST    | `/v1/categories`                | `WRITE` | `{"publicationId":"…","name":"…","slug":"… (auto slugify si vide)","description":"…"}` | `201 CategoryRow`                                                   |
| PATCH   | `/v1/categories/{id}`           | `WRITE` | idem                                                                                   | `200 CategoryRow`                                                   |
| DELETE  | `/v1/categories/{id}`           | `WRITE` | —                                                                                      | `200 {"success":true}`                                              |

RBAC `CanMedia PermManageCategories` ou publication perso `GetUserPersonalPublication`.

**Exemples**

```bash
curl -H "Authorization: Bearer qoe_live_XXX" "http://localhost:8080/v1/categories?publicationId=PUB_ID"

curl -X POST -H "Authorization: Bearer qoe_live_XXX" -H "Content-Type: application/json" \
 -d '{"publicationId":"PUB_ID","name":"Technologie","description":"…"}' http://localhost:8080/v1/categories
# -> 201 {"id":"…","name":"Technologie","slug":"technologie","publicationId":"…","description":"…"}

curl -X PATCH -H "Authorization: Bearer qoe_live_XXX" -H "Content-Type: application/json" \
 -d '{"publicationId":"PUB_ID","name":"Tech & IA","slug":"tech-ia"}' http://localhost:8080/v1/categories/CAT_ID

curl -X DELETE -H "Authorization: Bearer qoe_live_XXX" http://localhost:8080/v1/categories/CAT_ID
```

```js
// slug auto si non fourni, dédupliqué via CheckCategorySlugExists -> cat-xxxx si conflit
```

---

### 2.3 Analytics (`modules/analytics/handler.go:165` + `modules/creator/handler.go:249`)

#### Dashboard (JWT `CombinedAuth`, RBAC `owner|editor`)

| Route                                                              | Query                            | Réponse                                                                                                      |
| ------------------------------------------------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `GET /v1/analytics/financial?publicationId=`                       | `publicationId` req              | `200 {mrrCents,arrCents,grossVolumeCents,activeSubscribersCount,freeSubscribersCount,conversionRatePercent}` |
| `GET /v1/analytics/audience?publicationId=`                        | `publicationId` req              | `200 {total,active,premium}`                                                                                 |
| `GET /v1/analytics/top-content?publicationId=&limit=`              | `limit` déf 5 max 50             | `200 [{id,title,type:"article                                                                                | thought",publishedAt,viewsCount,likesCount,repostsCount}]` tri desc |
| `GET /v1/analytics/umami/returning?publicationId=&startAt=&endAt=` | `startAt/endAt` epoch ms déf 30j | proxy Umami `ReturningVisitors`                                                                              |
| `GET /v1/analytics/umami/hours?publicationId=&startAt=&endAt=`     | idem                             | proxy Umami `VisitsByHour`                                                                                   |

```bash
curl -H "Authorization: Bearer $JWT" "http://localhost:8080/v1/analytics/financial?publicationId=PUB_ID"
curl -H "Authorization: Bearer $JWT" "http://localhost:8080/v1/analytics/audience?publicationId=PUB_ID"
curl -H "Authorization: Bearer $JWT" "http://localhost:8080/v1/analytics/top-content?publicationId=PUB_ID&limit=10"
```

#### Créateur v2 — front personnalisé (clé API `READ`, `modules/creator/api_content.go`)

Bootstrap + contenu prêt à consommer pour un front tiers :

| Endpoint                                  | Description                                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `GET /v1/creator/me`                      | Profil de la publication portée par la clé + scopes effectifs                                         |
| `GET /v1/creator/articles?limit=&cursor=` | Articles publiés : slug, titre, extrait texte brut, temps de lecture, premium, date, `authors[]`      |
| `GET /v1/creator/articles/{slug}`         | Article complet avec `contentHtml` (HTML stocké), tags, auteurs (principal + co-auteurs `_CoAuthors`) |
| `GET /v1/creator/highlights?article=slug` | Surlignages publics, filtrables par article                                                           |

Toutes ces routes exigent le scope `READ` et sont montées uniquement derrière `APIKeyAuth`.

```bash
curl -H "Authorization: Bearer qoe_live_XXX" "http://localhost:8080/v1/creator/me"
curl -H "Authorization: Bearer qoe_live_XXX" "http://localhost:8080/v1/creator/articles?limit=10"
curl -H "Authorization: Bearer qoe_live_XXX" "http://localhost:8080/v1/creator/articles/mon-article"
curl -H "Authorization: Bearer qoe_live_XXX" "http://localhost:8080/v1/creator/highlights?article=mon-article"
```

#### Créateur stats (clé API `ANALYTICS`, `modules/creator/handler.go`)

`GET /v1/analytics/stats?startAt=&endAt=` -> proxy Umami `WebsiteStats` + `TopPages(10)`. `UmamiWebsiteID` depuis contexte clé ou `DefaultUmamiWebsiteID`. Si vide -> `{"stats":{"pageviews":0,…},"topPages":[]}`.

```bash
curl -H "Authorization: Bearer qoe_live_XXX" \
 "http://localhost:8080/v1/analytics/stats?startAt=1720000000000&endAt=1723000000000"
# -> 200 {"data":{"stats":{"pageviews":1234,"visitors":890,"visits":900,"bounces":120,"totaltime":45600},"topPages":[{"url":"/p/mon-article","pageviews":320}]}}
```

#### Créateur (clé API `READ`, `modules/creator/api_highlights.go`)

`GET /v1/creator/highlights?limit=&cursor=` -> surlignages **publics** des lecteurs sur les articles liés au créateur : publication de la clé, articles signés ou **co-écrits** (`_CoAuthors`). Chaque item porte le lecteur (username/name/logo), l'article (slug/titre) et la liste complète des auteurs (`authors` = auteur principal + co-auteurs). Paginé offset (`limit` défaut 20, max 100).

```bash
curl -H "Authorization: Bearer qoe_live_XXX" \
 "http://localhost:8080/v1/creator/highlights?limit=20"
# -> 200 {"items":[{"id":"hl1","text":"Passage souligné","note":null,"isPublic":true,
#   "createdAt":"2026-08-24T21:00:00Z","upvotesCount":3,"commentsCount":1,
#   "reader":{"id":"…","username":"lea","name":"Léa","logoUrl":null},
#   "article":{"id":"art1","slug":"mon-enquete","title":"Mon enquête",
#              "authors":["user-auteur","user-coauteur"]}}],
#   "nextCursor":"20","hasMore":false}
```

---

### 2.4 Webhooks sortants (`modules/webhooks/handler.go:217` + `internal/workers/webhook.go`)

**Événements valides** `ValidWebhookEvents = ["article.published","article.updated","article.deleted","article.scheduled","subscriber.created"]` dédupliqués + filtrés.

| Méthode | Route                                                | Scope   | Body/Query                                                                                                          | Réponse                                                                                                                                   |
| ------- | ---------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| GET     | `/v1/webhooks?publicationId=`                        | `READ`  | —                                                                                                                   | `200 Webhook[] {id,name,url,events,active,createdAt,updatedAt,deliveries:[5 last],lastDelivery}`                                          |
| POST    | `/v1/webhooks`                                       | `WRITE` | `{"publicationId"?:string,"name":"…","url":"https://… (ou http://localhost dev)","events":["article.published",…]}` | `201 {"webhook":Webhook,"secret":"hex32"}` **secret 1x**                                                                                  |
| GET     | `/v1/webhooks/{id}/deliveries?publicationId=&limit=` | `READ`  | `limit` déf 50 max 200                                                                                              | `200 Delivery[] {id,status:"SUCCESS                                                                                                       | FAILED",httpStatus,event,createdAt,responseBody,attempts}` |
| DELETE  | `/v1/webhooks/{id}?publicationId=`                   | `WRITE` | —                                                                                                                   | `200 {"success":true}` 403 si pas `owner/editor`                                                                                          |
| POST    | `/v1/webhooks/{id}/toggle?publicationId=`            | `WRITE` | —                                                                                                                   | `200 {"success":true,"active":bool}`                                                                                                      |
| POST    | `/v1/webhooks/{id}/test?publicationId=`              | `WRITE` | —                                                                                                                   | `200 {"success":true,"status":int,"response":"…(500 trunc)"}` ou `{"success":false,…}` en erreur réseau (200 quand même) + log trunc 1000 |

**Signature** : `X-Qoe-Signature: sha256=<hmac(secret, body)>` + `X-Qoe-Event: webhook.test | article.published…` + retries backoff. Worker `asynq` + logs `WebhookDelivery`.

**Exemples**

```bash
# Création
curl -X POST -H "Authorization: Bearer qoe_live_XXX" -H "Content-Type: application/json" \
 -d '{"publicationId":"PUB_ID","name":"prod","url":"https://mon-site.com/qoe-webhook","events":["article.published","article.updated"]}' \
 http://localhost:8080/v1/webhooks
# -> {"webhook":{"id":"wh_…","name":"prod","url":"https://mon-site.com/qoe-webhook","events":["article.published","article.updated"],"active":true},"secret":"a1b2…hex32"}

# Liste
curl -H "Authorization: Bearer qoe_live_XXX" "http://localhost:8080/v1/webhooks?publicationId=PUB_ID"

# Test
curl -X POST -H "Authorization: Bearer qoe_live_XXX" "http://localhost:8080/v1/webhooks/WH_ID/test?publicationId=PUB_ID"
# -> {"success":true,"status":200,"response":"ok"}

# Vérif côté récepteur (Node/Next.js)
import crypto from "crypto"
export async function POST(req: Request) {
  const secret = process.env.QOE_WEBHOOK_SECRET! // hex32 reçu à la création
  const sig = req.headers.get("x-qoe-signature") || "" // "sha256=…"
  const raw = await req.text() // body brut
  const expected = "sha256=" + crypto.createHmac("sha256", Buffer.from(secret,"hex")).update(raw).digest("hex")
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return new Response("invalid sig",{status:401})
  const event = JSON.parse(raw) // {type:"article.published", data:{id,slug,title,…}}
  // ...
  return Response.json({received:true})
}
# Python
# hmac.new(bytes.fromhex(secret), raw_body, hashlib.sha256).hexdigest()
```

---

## 3. OAuth 2.1 / OIDC Provider (`modules/oauth/handler.go:362`, `docs/OAUTH_PROVIDER.md:1`)

> qoe.fi = **OpenID Provider** : `apps/api` détient clients/codes/tokens, signe `id_token` ES256 (P-256). Supabase reste IdP interne.

### 3.1 Endpoints publics (RFC)

| Méthode  | Chemin                              | Description                                                           | Handler                     |
| -------- | ----------------------------------- | --------------------------------------------------------------------- | --------------------------- |
| GET      | `/.well-known/openid-configuration` | Discovery OIDC                                                        | `discovery` `handler.go:55` |
| GET      | `/.well-known/jwks.json`            | Clé publique ES256 JWK `{kty:EC,crv:P-256,x,y,kid,use:sig,alg:ES256}` | `jwks`                      |
| POST     | `/v1/oauth/token`                   | Token (`authorization_code` + `refresh_token`) — `30/min/IP`          | `token` `handler.go:160`    |
| POST     | `/v1/oauth/introspect`              | RFC 7662                                                              | `introspect`                |
| POST     | `/v1/oauth/revoke`                  | RFC 7009                                                              | `revoke`                    |
| GET/POST | `/v1/oauth/userinfo`                | OIDC UserInfo (Bearer ou `access_token` form)                         | `userinfo`                  |

**Sécurité**

- `response_type=code` seul, **PKCE obligatoire** `S256|plain`
- `redirect_uri` correspondance exacte allowlist
- `sub` **pairwise** `HMAC-SHA256(userID, clientId public)`, `aud`=clientId
- Secrets hashés SHA256 hex, **rotation refresh token + famille révoquée si replay**
- `nonce` rejoué, `at_hash/c_hash` dans `id_token`, rate-limit token 30/min

**Scopes** : `openid` (requis) | `profile` (`name,preferred_username,picture,pronouns`) | `email` (`email,email_verified`).

**Exemples discovery**

```bash
curl http://localhost:8080/.well-known/openid-configuration
# {"issuer":"http://localhost:8090","authorization_endpoint":"http://localhost:3010/oauth/authorize","token_endpoint":"http://localhost:8090/v1/oauth/token","jwks_uri":"…/.well-known/jwks.json","response_types_supported":["code"],"grant_types_supported":["authorization_code","refresh_token"],"subject_types_supported":["pairwise"],"id_token_signing_alg_values_supported":["ES256"],"scopes_supported":["openid","profile","email"],"token_endpoint_auth_methods_supported":["client_secret_basic","client_secret_post","none"],"code_challenge_methods_supported":["S256","plain"]}

curl http://localhost:8080/.well-known/jwks.json
# {"keys":[{"kty":"EC","crv":"P-256","x":"…","y":"…","kid":"…","use":"sig","alg":"ES256"}]}
```

**Exemple flot PKCE complet**

```bash
# 1. Créer verifier/challenge
CODE_VERIFIER=$(openssl rand -base64 32 | tr -d '=+/ ' | head -c 64)
CODE_CHALLENGE=$(echo -n $CODE_VERIFIER | openssl dgst -sha256 -binary | base64 | tr '+/' '-_' | tr -d '=')

# 2. Consentement (JWT user) -> redirect avec ?code=…
# GET /v1/oauth/authorize?response_type=code&client_id=CLIENT_ID&redirect_uri=https://monapp.com/cb&scope=openid%20profile&state=xyz&nonce=abc&code_challenge=$CODE_CHALLENGE&code_challenge_method=S256
# Authorization: Bearer $SUPABASE_JWT
curl -H "Authorization: Bearer $SUPABASE_JWT" \
 "http://localhost:8080/v1/oauth/authorize?response_type=code&client_id=CLIENT_ID&redirect_uri=https://monapp.com/cb&scope=openid%20profile&state=xyz&nonce=abc&code_challenge=$CODE_CHALLENGE&code_challenge_method=S256"

# POST décision approve
curl -X POST -H "Authorization: Bearer $SUPABASE_JWT" -H "Content-Type: application/json" \
 -d "{\"response_type\":\"code\",\"client_id\":\"CLIENT_ID\",\"redirect_uri\":\"https://monapp.com/cb\",\"scope\":\"openid profile\",\"state\":\"xyz\",\"nonce\":\"abc\",\"code_challenge\":\"$CODE_CHALLENGE\",\"code_challenge_method\":\"S256\",\"decision\":\"approve\",\"remember\":false}" \
 http://localhost:8080/v1/oauth/authorize
# -> {"redirect_uri":"https://monapp.com/cb?code=AUTH_CODE&state=xyz"}

# 3. Échange code (Basic ou form)
curl -X POST http://localhost:8080/v1/oauth/token \
 -u "CLIENT_ID:CLIENT_SECRET" \
 -d "grant_type=authorization_code&code=AUTH_CODE&redirect_uri=https://monapp.com/cb&code_verifier=$CODE_VERIFIER"
# -> {"access_token":"…","id_token":"…","refresh_token":"…","expires_in":3600,"token_type":"Bearer"}

# 4. UserInfo
curl -H "Authorization: Bearer ACCESS_TOKEN" http://localhost:8080/v1/oauth/userinfo
# -> {"sub":"pairwise-…","email":"ada@qoe.fi","email_verified":true,"name":"Ada","preferred_username":"ada","picture":"https://…","pronouns":"she/her"}

# Introspection / Révocation
curl -X POST -u "CLIENT_ID:CLIENT_SECRET" -d "token=ACCESS_TOKEN" http://localhost:8080/v1/oauth/introspect
# -> {"active":true,"sub":"…","scope":"openid profile","exp":…}

curl -X POST -u "CLIENT_ID:CLIENT_SECRET" -d "token=REFRESH_TOKEN&token_type_hint=refresh_token" http://localhost:8080/v1/oauth/revoke
# -> 200
```

**Erreurs OAuth** `400/401 {"error":"invalid_request|invalid_client|…","error_description":"…"}` + `Cache-Control:no-store`, `WWW-Authenticate: Basic realm="qoe.fi OAuth"` pour `invalid_client`.

### 3.2 Endpoints internes (JWT) — Studio/Core

| Méthode | Chemin                                 | Rôle                                                                        |
| ------- | -------------------------------------- | --------------------------------------------------------------------------- |
| GET     | `/v1/oauth/authorize`                  | Pré-valide requête, renvoie écran consentement `AuthorizeResult`            |
| POST    | `/v1/oauth/authorize`                  | `{"decision":"approve                                                       | deny","remember":bool, …AuthorizeRequest}`->`AuthorizeResult{redirect_uri}` |
| GET     | `/v1/oauth/clients`                    | Liste mes apps                                                              |
| POST    | `/v1/oauth/clients`                    | `CreateClientInput {name, redirectUris}` -> `201 {client_id,client_secret}` |
| POST    | `/v1/oauth/clients/{id}/rotate-secret` | -> `200 {clientSecret}`                                                     |
| DELETE  | `/v1/oauth/clients/{id}`               | -> `200 {"success":true}`                                                   |

```bash
curl -H "Authorization: Bearer $JWT" http://localhost:8080/v1/oauth/clients
curl -X POST -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
 -d '{"name":"Mon App","redirectUris":["https://monapp.com/cb"]}' http://localhost:8080/v1/oauth/clients
```

**Config** (`docs/OAUTH_PROVIDER.md:74` + `SystemConfig`) : `OAUTH_ISSUER` (déf `http://localhost:8090`), `OAUTH_AUTHORIZE_URL` (`http://localhost:3010/oauth/authorize`), `OAUTH_SIGNING_KEY` (PEM ES256 P-256, éphémère si vide — **prod = clé stable** sinon `kid` régénéré), quotas `OAUTH_MAX_CLIENTS_PER_USER=3`, `OAUTH_MAX_REDIRECT_URIS=10`, TTLs `AUTH_CODE 60s`, `ACCESS 3600s`, `REFRESH 2592000s`, `ID_TOKEN 3600s`. Purge horaire `oauth.Cleanup` `DeleteExpiredOAuthArtifacts`/`DeleteRevokedOAuthTokens`.

---

## 4. Webhooks entrants & events internes

| Méthode | Route                                 | Auth                    | Body                                                        | Réponse                                                                                                                                                         |
| ------- | ------------------------------------- | ----------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST    | `/v1/webhooks/stripe`                 | `Stripe-Signature` HMAC | `{"id":"evt_…","type":"…","data":{}}` rawBody vérifié       | `200 {"received":true}` -> `queue.PublishStripeEvent` -> worker met à jour `ltv`, commission `FREE 10%/PRO 5%` + `WalletTransaction DEPOSIT`, idempotence Redis |
| POST    | `/v1/webhooks/supabase`               | public                  | —                                                           | `200 {"received":true}` stub                                                                                                                                    |
| POST    | `/internal/events/article-published`  | `x-qoe-internal-secret` | `queue.ArticlePublishedPayload {articleId,publicationId,…}` | `200 {"queued":true}` -> asynq `article.published` -> Meilisearch sync + webhook fanout                                                                         |
| POST    | `/internal/events/subscriber-created` | idem                    | `{email,publicationId}`                                     | `200 {"queued":true}`                                                                                                                                           |

**Vérif Stripe** `modules/billing/handler.go:37` :

```ts
// t=<ts>,v1=<sig>
const [t, v1] = header.split(',').map((p) => p.split('=')[1]);
const payload = `${t}.${rawBody}`;
const expected = hmacSHA256(webhookSecret, payload);
timingSafeEqual(v1, expected) && Math.abs(Date.now() / 1000 - +t) < 300;
```

```bash
curl -X POST -H "Stripe-Signature: t=1720000000,v1=abc…" -H "Content-Type: application/json" \
 -d '{"id":"evt_123","type":"checkout.session.completed","data":{"object":{"customer":"cus_…"}}}' \
 http://localhost:8080/v1/webhooks/stripe

curl -X POST -H "x-qoe-internal-secret: $QOE_INTERNAL_SECRET" -H "Content-Type: application/json" \
 -d '{"articleId":"…","publicationId":"…"}' http://localhost:8080/internal/events/article-published
```

---

## 5. Shapes de référence (Go -> TS)

### 5.1 `FeedPost` / `Thought` (unifiée) `packages/sdk/src/types.ts:93`

```json
{
  "id": "uuid",
  "content": "…",
  "authorId": "uuid",
  "createdAt": "2026-08-21T10:00:00Z",
  "tags": ["#qoe"],
  "imageUrl": null,
  "likeCount": 3,
  "repostCount": 1,
  "replyCount": 2,
  "parentId": null,
  "rootId": null,
  "repostId": null,
  "replyRestriction": "everyone",
  "isPinned": false,
  "isHiddenByAuthor": false,
  "author": {
    "id": "…",
    "name": "Ada",
    "username": "ada",
    "logoUrl": "…",
    "isCertified": false,
    "isFollowing": false
  },
  "parent": null,
  "repost": null,
  "attachments": [
    {
      "id": "…",
      "thoughtId": "…",
      "type": "IMAGE",
      "url": "…",
      "altText": null,
      "width": 1200,
      "height": 800,
      "order": 0
    }
  ],
  "poll": {
    "id": "…",
    "thoughtId": "…",
    "expiresAt": "…",
    "isExpired": false,
    "totalVotes": 12,
    "userVotedOptionId": null,
    "options": [{ "id": "…", "text": "A", "order": 0, "voteCount": 5, "percentage": 42 }]
  },
  "likes": [{ "userId": "…" }],
  "reposts": [{ "id": "…", "userId": "…" }],
  "_count": { "likes": 3, "replies": 2, "reposts": 1 },
  "liked": false,
  "reposted": false
}
```

### 5.2 `CreatorItem` / `ArticleItem` (créateur list) `docs/openapi/creators-api.yaml:559`

```json
{
  "id": "…",
  "title": "…",
  "slug": "…",
  "contentHtml": "<tronqué>",
  "isTruncated": true,
  "visibility": "PUBLIC",
  "readingTime": 4,
  "isPremium": true,
  "createdAt": "…",
  "updatedAt": "…",
  "category": { "id": "…", "name": "…", "slug": "…", "description": null },
  "paywallMeta": {
    "visibility": "PAID_SUBSCRIBERS",
    "teaserParagraphsCount": 3,
    "totalLengthBytes": 12000,
    "previewLengthBytes": 2400,
    "requiredTierId": null
  }
}
```

### 5.3 `ArticleResponse` public (paywall complet)

Voir §1.5 + `packages/sdk/src/types.ts:251` + `modules/articles/service.go`.

### 5.4 `Notification` groupée `packages/sdk/src/types.ts:438`

`type`: `LIKE|REPOST|REPLY|COMMENT|MENTION|FOLLOW|MEDIA_INVITE|MEDIA_MEMBER_JOINED|MEDIA_ARTICLE_PUBLISHED…` ; `senders:[]`, `thought|article|publication`, `totalCount`.

---

## 6. Exemples complets bout-en-bout

### 6.1 App mobile — feed + like + reply (TS `QoeApiClient`)

```ts
import { createQoeApiClient } from '@qoe/sdk';

const api = createQoeApiClient({
  baseUrl: 'http://localhost:8080',
  getAuthToken: async () => (await supabase.auth.getSession()).data.session?.access_token ?? null,
});

// Feed
let cursor = '0';
const feed = await api.getFeed({ cursor, limit: 20 });
if (!feed.ok) throw new Error(feed.error);
cursor = feed.data.nextCursor ?? '0';
const first = feed.data.items[0].targetPost;

// Like (optimistic)
const like = await api.toggleLike(first.id); // { liked: true }
// le compteur est dérivé localement : first.likeCount += like.data.liked ? 1 : -1

// Reply (threadgate)
const reply = await api.replyToThought(first.id, 'Trop bien !');
// -> 201 FeedPost

// Thread complet
const thread = await api.getThread(first.id);
console.log(thread.data.post.replies);

// Profils
const me = await api.getMyProfile();
const pub = await api.getUserProfile('ada');
await api.toggleFollowUser(pub.data.id);
```

### 6.2 Média headless — WordPress -> qoe.fi + site perso se met à jour (webhook)

```bash
# 1. Demande clé (dashboard studio)
curl -X POST -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
 -d '{"reason":"Je gère Le Monde Tech, 50k visiteurs/mois, besoin API prod"}' \
 http://localhost:8080/v1/settings/api-application
# admin approuve -> apiAccessStatus=approved

# 2. Génère clé
curl -X POST -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
 -d '{"name":"prod","scopes":["READ","WRITE","ANALYTICS"]}' http://localhost:8080/v1/settings/api-keys
# -> {"apiKey":"qoe_live_abc..."}

# 3. Crée catégorie + article depuis WordPress
PUB_ID=$(curl -H "Authorization: Bearer $JWT" http://localhost:8080/v1/users/me | jq -r .data.publicationId)
curl -X POST -H "Authorization: Bearer qoe_live_abc" -H "Content-Type: application/json" \
 -d "{\"publicationId\":\"$PUB_ID\",\"name\":\"Actualités\"}" http://localhost:8080/v1/categories

ARTICLE_ID=$(curl -s -X POST -H "Authorization: Bearer qoe_live_abc" -H "Content-Type: application/json" \
 -d "{\"publicationId\":\"$PUB_ID\",\"title\":\"Breaking\",\"content\":\"<p>…</p>\",\"contentFormat\":\"html\",\"visibility\":\"PUBLIC\"}" \
 http://localhost:8080/v1/articles | jq -r .id)

curl -X POST -H "Authorization: Bearer qoe_live_abc" http://localhost:8080/v1/articles/$ARTICLE_ID/publish

# 4. Abonne ton site aux webhooks
curl -X POST -H "Authorization: Bearer qoe_live_abc" -H "Content-Type: application/json" \
 -d "{\"publicationId\":\"$PUB_ID\",\"name\":\"prod\",\"url\":\"https://mon-site.com/api/qoe-webhook\",\"events\":[\"article.published\",\"article.updated\",\"article.deleted\"]}" \
 http://localhost:8080/v1/webhooks
# -> {"webhook":{…},"secret":"hex32"}  # stocke le secret pour HMAC

# 5. Reçois sur ton site (Next.js Route Handler)
# POST https://mon-site.com/api/qoe-webhook  Headers: X-Qoe-Signature, X-Qoe-Event
# Body: {type:"article.published", data:{id,slug,title,contentHtml,…}}
# -> revalide ton cache / génère ta page statique
```

### 6.3 OAuth tiers — "Se connecter avec qoe.fi"

Voir §3.1 flot PKCE complet + `docs/OAUTH_PROVIDER.md:106`.

---

## 7. Index des fichiers source

| Domaine                               | Handler                                                                              | Service/SQL                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Feed                                  | `apps/api/internal/modules/feed/handler.go:1`                                        | `service.go`, `assembly.go`, `sql/queries/feed.sql`                     |
| Posts                                 | `apps/api/internal/modules/posts/handler.go:1`                                       | `service.go`, `dto.go`, `polls.sql`, `posts.sql`                        |
| Articles                              | `apps/api/internal/modules/articles/handler.go:1`                                    | `service.go`, `contract.go`, `content.go`, `paywall.go`, `articles.sql` |
| Creator (follow/categories/analytics) | `apps/api/internal/modules/creator/handler.go:1`                                     | `creator.sql`, `categories.sql`, `analytics.sql`, `umami/client.go`     |
| Analytics dashboard                   | `apps/api/internal/modules/analytics/handler.go:1`                                   | `service.go`, `umami.go`                                                |
| Highlights/Bookmarks                  | `apps/api/internal/modules/highlights/handler.go:1`                                  | `service.go`, `highlights.sql`                                          |
| Notifications                         | `apps/api/internal/modules/notifications/handler.go:1`                               | `service.go`, `notifications.sql`, `notification_center.sql`            |
| Search                                | `apps/api/internal/modules/search/handler.go:1`                                      | `semantic.go`, `semantic_search_test.go`                                |
| Billing                               | `apps/api/internal/modules/billing/handler.go:1`                                     | `workers/stripe.go`, `billing.sql`                                      |
| Webhooks sortants                     | `apps/api/internal/modules/webhooks/handler.go:1`                                    | `service.go`, `workers/webhook.go`, `webhooks.sql`                      |
| OAuth                                 | `apps/api/internal/modules/oauth/handler.go:1`                                       | `service.go`, `oauth.sql`                                               |
| Settings                              | `apps/api/internal/modules/settings/handler.go:1`                                    | `service.go`, `settings.sql`                                            |
| Events internes                       | `apps/api/internal/modules/events/handler.go`                                        | `queue/client.go`                                                       |
| Middleware                            | `apps/api/internal/middleware/auth.go`, `apikey.go`, `ratelimit.go`, `middleware.go` |                                                                         |
| Router                                | `apps/api/cmd/server/main.go:120`                                                    | `router_integration_test.go`                                            |
| Client mobile                         | `packages/sdk/src/client.ts:38`                                                      | `types.ts`, `index.ts`                                                  |
| Contrat legacy                        | `docs/API_CONTRACT.md:1`                                                             | `docs/openapi/creators-api.yaml:1`                                      |

---

## 8. Erreurs & codes

| Code | Quand                   | Body                                                                      | Exemple                                                                                                                                                                              |
| ---- | ----------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 200  | succès                  | JSON                                                                      | `{"data":…}`                                                                                                                                                                         |
| 201  | création                | JSON                                                                      | `{"id":"…"}`                                                                                                                                                                         |
| 400  | validation              | `{"error":"…"}`                                                           | `{"error":"publicationId requis"}`, `{"error":"contentFormat invalide (markdown\|html)"}`, `{"error":"Le slug \"tech\" est déjà utilisé"}`, `{"error":"You cannot follow yourself"}` |
| 401  | auth manquante/invalide | `{"error":"…"}`                                                           | `{"error":"Authorization header manquant"}`, `{"error":"Token invalide"}`, `{"error":"signature Stripe invalide"}`                                                                   |
| 403  | RBAC/scope              | `{"error":"…"}`                                                           | `{"error":"Scope READ requis"}`, `{"error":"Permission insuffisante"}`, `{"error":"Vous n'êtes pas autorisé à modifier cette catégorie."}`                                           |
| 404  | introuvable             | `{"error":"…"}`                                                           | `{"error":"Article introuvable"}`, `{"error":"User not found"}`, `{"error":"Webhook introuvable"}`                                                                                   |
| 429  | rate-limit              | `{"error":"Trop de requêtes. Réessayez dans un instant."}`                | + `Retry-After`                                                                                                                                                                      |
| 500  | interne                 | `{"error":"Internal Server Error"}`                                       | détails en logs (`log.Printf("[…]`)                                                                                                                                                  |
| 503  | embedding absent        | `{"error":"Recherche sémantique indisponible (embedding non configuré)"}` | `/search/semantic` sans `EMBEDDING_URL`                                                                                                                                              |

---

_Généré le 21 août 2026 — vérifié contre `apps/api/cmd/server/main.go:120` + `apps/api/internal/modules/*/handler.go` + `packages/sdk/src/client.ts:38`. Pour l'OpenAPI machine-readable : `docs/openapi/creators-api.yaml` (créateurs) + `docs/openapi/app-api.yaml` (app, nouveau)._
