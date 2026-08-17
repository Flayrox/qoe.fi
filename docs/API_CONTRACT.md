# 📡 Contrat API Go — Référence complète pour l'app mobile

> **Source de vérité** : `apps/api-go/cmd/server/main.go` (routage) +
> `apps/api-go/internal/modules/*` (handlers/services/DTOs).
> Ce document est le contrat **exact** (shapes JSON, auth, pagination) que
> l'app mobile (`apps/mobile`) consomme via `QoeApiClient`
> (`packages/api-client/src/client.ts`).
>
> Dernière mise à jour : août 2026. Vérifié contre le code Go.

---

## 0. Convention générale

### Auth
- **JWT Supabase** : header `Authorization: Bearer <token>` (RS256/ES256 via
  JWKS, fallback HS256 `sb_secret_…`). Résolu dans
  `apps/api-go/internal/middleware/auth.go`.
- **Clés API créateur** : `Authorization: Bearer qoe_live_…` (scopes
  READ / WRITE / ANALYTICS, moindre privilège).
- **Routes publiques** : `OptionalAuth` (paywall) — pas de token requis.
- **Routes protégées** : `CombinedAuth` (JWT OU clé API) + rate-limit
  600 req/min/user.

### Réponses
- Succès : `response.OK` → `200` (ou `201` Created) avec un JSON.
- **Enveloppe `data`** : certains handlers Go enveloppent dans `{"data": …}`
  (parité Hono). `QoeApiClient.request` **déplie automatiquement** :
  `json.data !== undefined ? json.data : json`. Donc côté mobile on lit
  toujours `res.data.<champ>`.
- Erreur : `{"error": "<message>"}` avec statut HTTP adapté
  (400/401/403/404/500).

### Pagination
- **Feed & notifications** : curseur = **offset numérique en string**
  (`cursor=0`, `cursor=20`…). La réponse renvoie `nextCursor` (string) +
  `hasMore` (feed) — le client envoie `cursor=<nextCursor>` à la page suivante.
- **Articles (contrat créateur)** : pagination `page` (1-based) + `limit`
  (défaut 10, max 100).

---

## 1. Feed

### GET `/v1/feed?cursor=&limit=&tab=`
**Auth** : protégée (CombinedAuth) — le feed « abonnements » nécessite un viewer.
**Query** : `cursor` (offset, défaut 0), `limit` (défaut 20, max 100).
⚠️ Le param `tab` est **ignoré** par le handler Go (seuls limit/cursor sont lus).

**Réponse** (non enveloppée) :
```json
{
  "items": [ FeedSlice ],
  "nextCursor": "20",
  "hasMore": true
}
```

### GET `/v1/feed/trending?cursor=&limit=`
**Auth** : protégée (CombinedAuth). Même shape que `/v1/feed`.
Contenu : pensées les plus engagées des 7 derniers jours.

### GET `/v1/feed/articles?cursor=&limit=`
**Auth** : **publique** (`OptionalAuth`) — ajouté août 2026 pour le feed mobile.
Articles publiés récents, paginés par offset, avec auteur / publication /
catégorie dénormalisés (miroir de l'ArticleCard de l'écran principal web).
**Réponse** (non enveloppée) :
```json
{
  "items": [
    {
      "id": "uuid", "title": "…", "slug": "…", "content": "<html>",
      "isPremium": true, "visibility": "PUBLIC", "readingTime": 4,
      "createdAt": "RFC3339", "publicationId": "uuid",
      "author": { "id": "uuid", "name": "…" | null, "username": "…" | null,
                  "logoUrl": "…" | null, "isCertified": false },
      "publication": { "id": "uuid", "name": "…", "slug": "…",
                        "subdomain": "…" | null, "logoUrl": "…" | null,
                        "type": "PERSONAL" | "MEDIA" },
      "category": { "id": "uuid", "name": "…", "slug": "…" } | null
    }
  ],
  "nextCursor": "20",
  "hasMore": true
}
```

### GET `/v1/posts/{id}/thread`
**Auth** : protégée. **Réponse** : `{"post": ThreadPost}` où
`ThreadPost = FeedPost & { "replies": [FeedPost] }` (réponses triées par date croissante).
> ✅ **AOÛT 2026** : la **chaîne d'ancêtres** (root → … → parent direct) est
> désormais peuplée dans `FeedPost.parent` (voir §2) pour que le mobile
> affiche ce qu'il y a au-dessus d'une réponse.

### GET `/v1/users/{username}/posts?cursor=&limit=`
**Auth** : **publique** (`OptionalAuth`) — ajouté pour le profil mobile.
Résout la publication par `slug` OU `subdomain`, puis renvoie les pensées
**publiques** de son propriétaire (jamais de brouillons/supprimés).
**Réponse** : même shape que `/v1/feed` (non enveloppée) :
```json
{ "items": [ FeedSlice ], "nextCursor": "20", "hasMore": true }
```
> Implémenté dans `apps/api-go/internal/modules/feed` (sqlc
> `FindPostsByAuthor` + `Service.UserPosts` + `Handler.userPosts`, route
> montée dans `main.go` sous `OptionalAuth`).

---

## 2. FeedSlice / FeedPost — shapes EXACTES

### FeedSlice
```json
{
  "id": "uuid",
  "rootPost":   FeedPost | null,
  "parentPost": FeedPost | null,
  "targetPost": FeedPost,
  "isIncompleteThread": false,
  "hiddenIntermediateCount": 0
}
```
> ✅ **RÉSOLU (août 2026)** : le mobile rend désormais les `FeedSlice`
> correctement via `ThoughtFeedSlice` + `ThoughtCard`
> (`apps/mobile/src/components/thought/`), qui gèrent `targetPost`
> (post isolé) ET le fil `root → parent → target` avec connecteurs.

### FeedPost
```json
{
  "id": "uuid",
  "content": "texte",
  "authorId": "uuid",
  "createdAt": "2026-08-17T10:00:00Z",          // RFC3339
  "tags": ["#tag"],
  "imageUrl": "https://…" | null,
  "likeCount": 3, "repostCount": 1, "replyCount": 2,
  "parentId": "uuid" | null,
  "rootId": "uuid" | null,
  "repostId": "uuid" | null,
  "replyRestriction": "everyone" | "subscribers" | "following" | "mentioned",
  "isPinned": false,
  "isHiddenByAuthor": false,
  "author": {
    "id": "uuid", "name": "…" | null, "username": "…" | null,
    "logoUrl": "…" | null, "isCertified": false,
    "isFollowing": false        // ✅ AOÛT 2026 : état follow réel du viewer
  },
  "parent": FeedPost | null,
  "repost": FeedPost | null,
  "attachments": [
    { "id": "uuid", "thoughtId": "uuid", "type": "IMAGE" | "…",
      "url": "…", "altText": "…" | null, "width": 800 | null,
      "height": 600 | null, "order": 0 }
  ],
  "poll": Poll | null,
  "likes": [ { "userId": "uuid" } ],
  "reposts": [ { "id": "uuid", "userId": "uuid" } ],
  "_count": { "likes": 3, "replies": 2, "reposts": 1 },
  "liked": false,
  "reposted": false
}
```

### Poll
```json
{
  "id": "uuid", "thoughtId": "uuid",
  "expiresAt": "RFC3339", "isExpired": false,
  "totalVotes": 12, "userVotedOptionId": "uuid" | null,
  "options": [ { "id": "uuid", "text": "…", "order": 0,
                 "voteCount": 5, "percentage": 42 } ]
}
```

> ⚠️ **GAP** : `FeedPost.author` n'a **pas** de `subdomain`/`customDomain`
> (contrairement au `ThoughtData` mobile). Le mobile doit gérer l'absence.
>
> ✅ **AOÛT 2026** : dans `/v1/posts/{id}/thread`, `parent` contient la
> **chaîne d'ancêtres complète** (root → … → parent direct) — le champ
> `parent.parent` remonte jusqu'à la racine.

---

## 3. Pensées (posts) — CRUD & interactions

### POST `/v1/posts` (et alias `/v1/thoughts`)
**Auth** : protégée. **Body** :
```json
{
  "content": "texte (≤500 chars, URLs externes comptées 20, internes 0)",
  "tags": ["#tag"],
  "imageUrl": "https://…" | null,
  "parentId": "uuid" | null,
  "repostId": "uuid" | null,
  "replyRestriction": "everyone" | null,
  "attachments": [ { "url": "…", "type": "IMAGE", "altText": "…",
                     "width": 800, "height": 600 } ],
  "poll": { "options": ["A", "B"], "durationHours": 24 } | null
}
```
**Réponse** : `201` + **`FeedPost` complet** (shape §2) — la shape `Thought`
a été **unifiée** avec `FeedPost` en août 2026 (`liked`/`reposted` au lieu de
`viewerLiked`/`viewerReposted`), avec `_count`, `parent`, `repost`,
`attachments`, `poll` et `author.isFollowing`.

### GET `/v1/posts/{id}`
**Auth** : protégée. **Réponse** : `FeedPost` complet (même shape que le
feed/thread, voir §2) — plus de double shape.

### GET `/v1/posts/{id}/likes?cursor=&limit=`
**Auth** : protégée. Liste paginée des utilisateurs qui ont liké (par date
croissante). **Réponse** (non enveloppée) :
```json
{ "items": [ { "id": "uuid", "name": "…" | null, "username": "…" | null,
               "logoUrl": "…" | null, "isCertified": false,
               "followedAt": "RFC3339" } ],
  "nextCursor": "50", "hasMore": false }
```
> Porté de Bluesky `PostLikedBy` — écran mobile `post/[id]/likes`.

### GET `/v1/posts/{id}/reposts?cursor=&limit=`
**Auth** : protégée. Liste paginée des utilisateurs qui ont reposté
(reposts purs uniquement). Même shape que `/likes`.
> Porté de Bluesky `PostRepostedBy` — écran mobile `post/[id]/reposts`.

### GET `/v1/posts/{id}/quotes?cursor=&limit=`
**Auth** : protégée. Citations d'un post (posts avec `repostId` + texte non
vide), paginées, en **shape `FeedPost` complète**. **Réponse** :
```json
{ "items": [ FeedPost ], "nextCursor": "20", "hasMore": false }
```
> Porté de Bluesky `PostQuotes` — écran mobile `post/[id]/quotes`.

### POST `/v1/users/{id}/block` / POST `/v1/users/{id}/mute`
**Auth** : protégée. Bloque/masque (toggle idempotent) un utilisateur.
**Réponse** : `{"blocked": true|false}` / `{"muted": true|false}`.
> Tables `BlockedUser` / `MutedUser` (nouvelle table + migration août 2026).

### POST `/v1/reports`
**Auth** : protégée. **Body** :
`{"targetId": "uuid", "targetType": "thought|article|user|comment", "reason": "…", "details": "…"}`.
**Réponse** : `{"success": true}` (statut `pending` en attente de modération).

### POST `/v1/posts/{id}/like` (et alias `/v1/thoughts/{id}/like`)
**Auth** : protégée. **Réponse** : `{"liked": true|false}`.
> ⚠️ **GAP** : le mobile attend `{liked, likesCount}` — `likesCount` n'est pas
> renvoyé. Le mobile doit dériver le compteur localement (optimistic) et
> resynchroniser via le feed.

### POST `/v1/posts/{id}/repost` (et alias `/v1/thoughts/{id}/repost`)
**Auth** : protégée. **Réponse** : `{"reposted": true|false}`.
> ⚠️ **GAP** : idem, le mobile attend `{reposted, repostsCount}`.

### POST `/v1/posts/{id}/reply`
**Auth** : protégée. **Body** : `{"content": "…"}` (threadgate vérifié côté
serveur). **Réponse** : `201` + `Thought`.

### POST `/v1/posts/{id}/bookmark` (et alias `/v1/thoughts/{id}/bookmark`)
**Auth** : protégée. **Réponse** : `{"bookmarked": true|false}`.
> ⚠️ Note : le bookmark Go cible un **Article** (`articleId`), pas une pensée
> — le param `targetType` du client mobile est ignoré côté Go.

### POST `/v1/posts/{id}/poll/vote` & `/v1/posts/{id}/poll/unvote`
**Auth** : protégée. **Body (vote)** : `{"optionId": "uuid"}`.
**Réponse** : le sondage **reformaté** (shape `Poll` ci-dessous) avec les
nouveaux scores — `userVotedOptionId` mis à jour.
> Idempotent : voter sur une autre option **remplace** le vote (ON CONFLICT
> DO UPDATE) ; re-voter sur la même → utilisez `/unvote` pour retirer.
> Implémenté dans `apps/api-go/internal/modules/posts` (sqlc `polls.sql`
> + `Service.VotePoll/UnvotePoll/formatPoll` + `Handler.votePoll/unvotePoll`).

### Citations (repost avec commentaire)
Un **quote** = un post avec `repostId` **ET** un `content` non vide
(`POST /v1/posts`). Le feed le renvoie dans `FeedPost.repost` (imbriqué) avec
`content` rempli — le client mobile les distingue du repost pur
(`repost` + content vide) via `ThoughtCard` (`isQuotePost`).

### Thought (shape) — ⚠️ SUPPRIMÉE (unifiée avec FeedPost)
> ✅ **AOÛT 2026** : la shape `Thought` a été **supprimée** du Go. Tous les
> endpoints posts (`GET /v1/posts/{id}`, `POST /v1/posts`, `POST /v1/posts/{id}/reply`)
> renvoient désormais un `FeedPost` complet (§2) avec `liked`/`reposted`,
> `_count`, `parent`, `repost`, `attachments`, `poll` et `author.isFollowing`.
> Côté client, `Thought` est un **alias de `FeedPost`** ; `normalize.ts` n'a
> plus qu'un chemin de normalisation.

---

## 4. Utilisateurs & follow

### GET `/v1/users/me`
**Auth** : protégée. **Réponse** (enveloppée `data`) :
```json
{
  "data": {
    "id": "uuid", "email": "…", "username": "…" | null, "name": "…" | null,
    "role": "user" | "creator" | "superadmin", "isCertified": false,
    "isShadowbanned": false, "isSuspended": false, "suspendReason": null,
    "forceStandardTheme": false, "onboardingText": "…" | null,
    "logoUrl": "…" | null, "publicationId": "uuid",
    "advancedSettingsMode": false, "hasCompletedOnboarding": false,
    "apiAccessStatus": "none" | "pending" | "approved" | "rejected" | "revoked",
    "apiApplicationReason": "…" | null,
    "walletBalanceCents": 0,
    "createdAt": "RFC3339", "updatedAt": "RFC3339",
    "stats": { "followingCount": 5, "followersCount": 12 }
  }
}
```

### GET `/v1/users/{username}`
**Auth** : publique. Résout une **publication** par `slug` OU `subdomain`.
**Réponse** (enveloppée `data`) :
```json
{
  "data": {
    "id": "uuid", "name": "…" | null, "slug": "…",
    "subdomain": "…" | null, "customDomain": "…" | null,
    "heroText": "…" | null, "logoUrl": "…" | null,
    "headerImageUrl": "…" | null, "isCertified": false,
    "createdAt": "RFC3339", "type": "PERSONAL" | "MEDIA",
    "_count": { "followers": 12, "articles": 3 }
  }
}
```

### POST `/v1/users/{id}/follow`
**Auth** : protégée. `id` = **publicationId** (pas userId).
**Réponse** (enveloppée `data`) :
```json
{ "data": { "following": true, "followersCount": 12 } }
```
> ✅ Compatible avec `QoeApiClient.toggleFollowUser` (qui attend
> `{following, followersCount}`).

---

## 5. Articles & paywall

### GET `/v1/articles/{slug}?publicationId=&viewerEmail=`
**Auth** : **publique** (`OptionalAuth`). Double mode :
- **Clé API** (`Bearer qoe_live_…`) → `{"data": CreatorItem}` (contrat créateur, contenu tronqué).
- **Sinon** → lecture publique du paywall. **`publicationId` REQUIS** (sinon 400).

**Réponse lecture publique** (non enveloppée) :
```json
{
  "id": "uuid", "title": "…", "slug": "…",
  "content": "<html tronqué au paywall>",
  "isTruncated": true, "accessGranted": false,
  "visibility": "PUBLIC" | "MEMBERS_ONLY" | "PAID_SUBSCRIBERS" | "TIER_SPECIFIC",
  "readingTime": 4, "isPremium": true,
  "createdAt": "RFC3339", "updatedAt": "RFC3339",
  "paywallMeta": { … },
  "category": { "id": "uuid", "name": "…", "slug": "…" } | null,
  "author": { "id": "uuid", "name": "…" | null, "username": "…" | null,
              "logoUrl": "…" | null },
  "publication": { "id": "uuid", "name": "…", "slug": "…",
                   "subdomain": "…" | null } | null
}
```
> ⚠️ **SÉCURITÉ** : la troncature est faite **côté serveur** (zéro-fuite).
> Le mobile ne doit JAMAIS réassembler le contenu depuis un autre endpoint.

### GET `/v1/articles/{id}/comments`
**Auth** : publique. **Réponse** : tableau de commentaires (avec `author`
dénormalisé et `replies` imbriquées).

### POST `/v1/articles/{id}/comments`
**Auth** : protégée. **Body** : `{"content": "…", "parentId": "uuid"|null}`.
**Réponse** : `201` + commentaire.

### DELETE `/v1/articles/comments/{commentId}`
**Auth** : protégée (auteur uniquement). **Réponse** : `{"success": true}`.

### Routes créateur (dashboard, JWT ou clé API + scopes)
| Méthode | Route | Scope | Réponse |
|---|---|---|---|
| GET | `/v1/articles?page=&limit=&category=&published=` | READ | `{data: [CreatorItem], pagination: {total,page,limit,pages}}` |
| POST | `/v1/articles` | WRITE | `201` + article |
| GET | `/v1/articles/by-id/{id}` | READ | article complet (RBAC) |
| GET | `/v1/articles/capabilities?publicationId=` | READ | capacités éditeur |
| PATCH | `/v1/articles/{id}` | WRITE | article |
| POST | `/v1/articles/{id}/publish` | WRITE | `{"published": true}` |
| POST | `/v1/articles/{id}/review` | WRITE | article (workflow média) |
| DELETE | `/v1/articles/{id}?activePublicationId=` | WRITE | `{"deleted": true}` |

### CreatorItem (contrat créateur)
```json
{
  "id": "uuid", "title": "…", "slug": "…",
  "contentHtml": "<tronqué>", "isTruncated": true,
  "visibility": "…", "readingTime": 4, "isPremium": true,
  "createdAt": "RFC3339", "updatedAt": "RFC3339",
  "category": { "id": "uuid", "name": "…", "slug": "…",
                "description": "…" | null } | null,
  "paywallMeta": { … } | null
}
```

---

## 6. Notifications

### GET `/v1/notifications?filter=&limit=&cursor=`
**Auth** : protégée. `filter`: `all|mentions|replies|likes` (défaut all).
`cursor` = offset. **Réponse** (non enveloppée) :
```json
{
  "notifications": [ Notification ],
  "nextCursor": "30"
}
```

### Notification (groupée 48h)
```json
{
  "id": "uuid",
  "type": "LIKE" | "REPOST" | "REPLY" | "COMMENT" | "MENTION" | "FOLLOW"
        | "MEDIA_INVITE" | "MEDIA_MEMBER_JOINED" | "MEDIA_ARTICLE_PUBLISHED"
        | "MEDIA_ARTICLE_SUBMITTED" | "ARTICLE_CONTRIBUTOR_INVITED"
        | "ARTICLE_CONTRIBUTOR_ACCEPTED" | "ARTICLE_CONTRIBUTOR_DECLINED"
        | "ARTICLE_CONTRIBUTOR_REMOVED",
  "isRead": false,
  "createdAt": "RFC3339",
  "thoughtId": "uuid" | null,
  "articleId": "uuid" | null,
  "commentId": "uuid" | null,
  "thought": { "id": "uuid", "content": "…", "createdAt": "RFC3339" } | null,
  "article": { "id": "uuid", "title": "…", "slug": "…" } | null,
  "publication": { "id": "uuid", "name": "…" | null, "slug": "…" | null } | null,
  "senders": [ { "id": "uuid", "name": "…" | null, "username": "…" | null,
                 "logoUrl": "…" | null, "isCertified": false } ],
  "totalCount": 3
}
```

### GET `/v1/notifications/unread-count`
**Auth** : protégée. **Réponse** : `{"count": 3}`.

### POST `/v1/notifications/read`
**Auth** : protégée. **Body** : `{"notificationIds": ["uuid", …]}` (vide = tout marquer lu).
**Réponse** : `{"success": true}`.

### GET `/v1/notifications/preferences`
**Auth** : protégée. **Réponse** : `{"preferences": {…}}` — champs
`emailLikes, pushLikes, emailReplies, pushReplies, emailComments, pushComments,
emailMentions, pushMentions, emailFollows, pushFollows, emailReposts,
pushReposts, emailMedia, pushMedia` (booléens). Défauts = tout à `true`.

### PATCH `/v1/notifications/preferences`
**Auth** : protégée. **Body** : `{"pushLikes": false, …}` (merge partiel).
**Réponse** : `{"preferences": {…complet}}`.

### POST `/v1/notifications/media-invite` / `/v1/notifications/media-member-joined`
**Auth** : protégée. **Body** : `{"recipientId": "uuid", "publicationId": "uuid"}`.
**Réponse** : `{"success": true}`.

---

## 7. Bibliothèque & surlignages (ajoutés août 2026)

### GET `/v1/bookmarks?offset=&limit=`
**Auth** : protégée. Articles sauvegardés du lecteur (bibliothèque), paginés
par offset (défaut 20, max 100). **Réponse** (non enveloppée) :
```json
[
  {
    "bookmarkId": "uuid", "bookmarkedAt": "RFC3339",
    "articleId": "uuid", "articleTitle": "…", "articleSlug": "…",
    "readingTime": 4, "isPremium": true, "articleCreatedAt": "RFC3339",
    "publicationId": "uuid",   // ⚠️ UUID — requis pour ouvrir l'article
    "publicationName": "…", "publicationSlug": "…",
    "subdomain": "…" | null,
    "author": { "id": "uuid", "name": "…" | null, "username": "…" | null,
                "logoUrl": "…" | null }
  }
]
```
> Implémenté dans `apps/api-go/internal/modules/highlights` (sqlc
> `ListBookmarksByReader` + `Service.Bookmarks` + `Handler.bookmarks`).

### GET `/v1/me/highlights?offset=&limit=`
**Auth** : protégée. Mes surlignages (bibliothèque), paginés par offset.
**Réponse** (non enveloppée) :
```json
[
  {
    "id": "uuid", "text": "…", "note": "…" | null,
    "isPublic": false, "isOfficial": false, "upvotesCount": 0,
    "readerId": "uuid", "articleId": "uuid", "createdAt": "RFC3339",
    "articleTitle": "…", "articleSlug": "…",
    "publicationId": "uuid", "publicationName": "…", "publicationSlug": "…"
  }
]
```

### GET `/v1/articles/{id}/highlights`
**Auth** : **publique** (`OptionalAuth`). Surlignages d'un article : **publics**
+ **les siens** (privés), avec état upvote du viewer. **Réponse** :
```json
[
  {
    "id": "uuid", "text": "…", "note": "…" | null,
    "isPublic": true, "isOfficial": false, "upvotesCount": 4,
    "readerId": "uuid", "articleId": "uuid", "createdAt": "RFC3339",
    "reader": { "id": "uuid", "name": "…" | null, "username": "…" | null,
                "logoUrl": "…" | null },
    "viewerUpvoted": false, "commentsCount": 1
  }
]
```

### POST `/v1/articles/{id}/highlights`
**Auth** : protégée. **Body** : `{"text": "…", "note": "…"|null, "isPublic": bool}`.
**Réponse** : `201` + `Highlight` (shape ci-dessus).

### DELETE `/v1/highlights/{id}`
**Auth** : protégée (auteur uniquement). **Réponse** : `{"success": true}`.

### POST `/v1/highlights/{id}/upvote`
**Auth** : protégée. Toggle upvote (idempotent). **Réponse** :
`{"upvoted": bool, "upvotesCount": int}`.

### GET/POST `/v1/highlights/{id}/comments` & DELETE `/v1/highlights/comments/{commentId}`
**Auth** : GET publique, POST/DELETE protégées. Commentaires d'annotation
avec `author` dénormalisé. **Body POST** : `{"content": "…"}`.

---

## 7bis. Autres endpoints utiles

| Méthode | Route | Auth | Rôle |
|---|---|---|---|
| GET | `/healthz`, `/health` | publique | Healthcheck — **utilisé par le mobile** (`ApiStatus`) |
| GET | `/v1/categories?publicationId=` | READ / protégée | `{"data": [{id,name,slug,description,articlesCount}]}` |
| GET | `/v1/analytics/stats?startAt=&endAt=` | ANALYTICS | `{"data": {stats, topPages}}` (proxy Umami) |
| GET | `/v1/search/article?q=` | publique | Recherche Meilisearch publique |
| POST | `/v1/stripe/webhook` | signature | Webhook Stripe |
| POST | `/internal/events/article-published` | secret `x-qoe-internal-secret` | Émission asynq |

---

## 8. Synthèse des GAPS mobile — état août 2026

| # | Fichier mobile | Problème | Fix recommandé |
|---|---|---|---|
| 1 | ~~`feed-screen.tsx`~~ | ~~`items` castés en `ThoughtData[]`~~ **✅ CORRIGÉ** : le mobile rend les `FeedSlice` (`ThoughtFeedSlice` + `ThoughtCard`) | — |
| 2 | ~~`types.ts`~~ | ~~`ThoughtData.author` attend `subdomain`/`customDomain`~~ **✅ CORRIGÉ** : `FeedAuthor` les rend optionnels ; `normalize.ts` gère l'absence | — |
| 3 | ~~`client.ts` `toggleLike`~~ | ~~Attend `{liked, likesCount}` — Go renvoie `{liked}`~~ **✅ CORRIGÉ** : compteur dérivé via le shadow store (`thought-actions.tsx`) | — |
| 4 | ~~`client.ts` `toggleRepost`~~ | ~~Attend `{reposted, repostsCount}`~~ **✅ CORRIGÉ** : idem shadow store | — |
| 5 | `client.ts` `getFeed` | Envoie `tab=` ignoré par Go | Retirer ou gérer côté Go |
| 6 | ~~`client.ts` `toggleBookmark`~~ | ~~Envoie `targetType` ignoré (bookmark = article)~~ **✅ CORRIGÉ** : le mobile bookmark les **articles** (lecteur) ; la bibliothèque liste via `/v1/bookmarks` | — |
| 7 | ~~`Thought` vs `FeedPost`~~ | ~~`viewerLiked` vs `liked`~~ **✅ CORRIGÉ (août 2026)** : la shape `Thought` a été **supprimée côté Go** — tous les endpoints renvoient un `FeedPost` complet ; `Thought` est un alias client ; `normalize.ts` n'a plus qu'un chemin | — |
| 8 | ~~stats non cliquables~~ | ~~rangée « N reposts · N j'aime · N réponses » statique~~ **✅ CORRIGÉ (août 2026)** : `POST /v1/posts/{id}/likes|reposts|quotes` + écrans mobile `post/[id]/{kind}` (parité PostLikedBy/PostRepostedBy/PostQuotes) | — |
| 9 | ~~menu mute/block/report~~ | ~~stubs « bientôt disponible »~~ **✅ CORRIGÉ (août 2026)** : `POST /v1/users/{id}/mute|block` + `POST /v1/reports` (tables `MutedUser`/`BlockedUser`/`ModerationReport`), branchés dans `post-menu.tsx` | — |

> Ces gaps sont autant de tickets concrets pour le sprint mobile.
