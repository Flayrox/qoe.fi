# 🔔 Handoff — Système de Notifications & Dashboard qoe.fi
**Date : 2026-08-15 — Branche : main — Commit de référence : `8f48e03`**

## 0. POUR COMMENCER — État git ACTUEL

⚠️ **Il y a du travail NON COMMITÉ en attente** (21 fichiers modifiés + 1 nouveau). Avant toute chose :
1. Vérifier que tout compile : `cd apps/api-go && go build ./...` et `pnpm typecheck`.
2. Commiter ce travail non committé (sujet suggéré : `feat(notifications): unify follow on Go, realtime badge sync, mentions on posts, dashboard Cmd+K scope`).
3. ⚠️ Ne PAS committer `.freebuff/` (artefact local d'outil desktop — base sqlite). L'ajouter au `.gitignore` si besoin.

---

## 1. CONTEXTE ARCHITECTURAL (indispensable)

Monorepo pnpm + Turborepo. Backends :
- **`apps/api-go`** : backend Go (chi router + pgx + sqlc). Devenu le "backend of record" derrière `api.qoe.fi`. Les server actions Next.js sont des **proxies fins** : elles gardent leur contrat TS (`ActionResult<T>`) mais délèguent au Go via HTTP si `QOE_API_GO_URL` est défini (variable d'activation dans `packages/api-client/src/actions/utils/go-client.ts` : `isGoEnabled()` + `goFetch()`).
- **`packages/db`** : repo Prisma TS (fallback quand Go désactivé).
- **`apps/feed`** (qoe.fi), **`apps/dashboard`** (dashboard.qoe.fi), **`apps/admin`**, **`apps/web`**, **`apps/landing`**.
- **SQL** : `apps/api-go/sql/queries/*.sql` → généré par sqlc (`cd apps/api-go && sqlc generate`). Version sqlc installée : **v1.31.1** (`/opt/homebrew/bin/sqlc`).

**Règle d'or** : pour toute mutation feed (posts, likes, follows...), router vers le Go quand `isGoEnabled()` avec `goFetch`, fallback TS sinon. Pattern standard :
```ts
if (isGoEnabled()) {
  const res = await goFetch<{...}>(`/v1/...`, { method: 'POST', body: {...} });
  return {...};
}
return repoTS(...);
```

---

## 2. TRAVAIL TERMINÉ RÉCEMMENT (à connaître)

### 2.1 Thème synchronisé entre sous-domaines (commité `8f48e03`)
`qoe.fi` et `dashboard.qoe.fi` sont des origines différentes → le `localStorage` de next-themes ne se partage pas. Solution : cookie `qoe_theme` sur le domaine parent `.qoe.fi`.
- `packages/theme/src/cookie.ts` : helpers `readThemeCookie`/`writeThemeCookie` (domain `.qoe.fi` détecté automatiquement, host-only sur localhost).
- `packages/theme/src/ThemeProvider.tsx` : `CookieWriter` (écrit au changement) + `CookieReader` (lit au montage + polling 1,5s + focus/visibility).
- `packages/theme/src/seed-script.tsx` : `ThemeSeedScript` inline SSR placé en haut de `<body>` dans les 5 root layouts (cookie → localStorage avant hydration, zéro flash).
- Toggle monté dans la `Sidebar` partagée (`@qoe/ui/sidebar` popover) + `ReaderNavOverlay` (feed mobile). Supprimé les copies mortes de `ThemeToggle` dans les apps.

### 2.2 Notifications FOLLOW (Go + UI) — NON COMMITÉ
Le follow toggle Go créait le `Follows` sans notifier. Ajouté :
- Queries sqlc (`apps/api-go/sql/queries/notifications.sql`) : `GetPublicationOwner`, `GetFollowPrefs`, `ExistsUnreadFollowNotification`, `InsertFollowNotification`, `DeleteFollowNotification`.
- `apps/api-go/internal/modules/creator/handler.go` : `notifyFollow` + `deleteFollowNotification` branchés dans `followToggle` (create au follow, delete à l'unfollow).
- `GetPublicationOwner` : PERSONAL → `User.publicationId`, MEDIA → membre `role='owner'` actif. `COALESCE` pour éviter le NULL scan.
- Slug de publication ajouté aux réponses notifs (Go `service.go` PublicationRef.Slug + TS repo `notifications.ts`) et lien UI corrigé : FOLLOW pointe vers `/${publication.slug}` (était `/m/:id` qui n'existe pas).

### 2.3 FOLLOW routé vers le Go — NON COMMITÉ
- `packages/api-client/src/actions/tenant/index.ts` : `toggleFollowCreatorAction` → Go quand activé.
- `packages/api-client/src/actions/feed/index.ts` : `toggleFollowCreatorHomeAction` → Go quand activé.
- Contrat : le Go retourne `{ data: { following } }`, on mappe vers `{ followed }`.
- ⚠️ IMPORTANT : le `publicationId` passé par le feed (`ProfileUser.id = publication.id`) est bien ce que le endpoint Go `/v1/users/{id}/follow` attend (l'`id` de la route = publicationId, pas un userId). `UserID` JWT Supabase = `User.id` (cohérent TS/Go).

### 2.4 Cmd+K dashboard : scope articles du créateur — NON COMMITÉ
Le Cmd+K cherchait dans TOUS les articles publiés. Corrigé :
- `packages/db/src/repositories/search.ts` : `searchArticles(query, limit, publicationId?)` filtre si publicationId fourni.
- `packages/api-client/src/actions/search/index.ts` : `searchAllAction` accepte `scope: 'all' | 'mine'`. En `'mine'`, résout `getActivePublicationId(user.id)` (logique exportée depuis `packages/api-client/src/actions/articles/index.ts` — a été rendue `export`).
- `apps/dashboard/src/features/dashboard/components/GlobalCommandMenu.tsx` : appelle avec `scope: 'mine'`.

### 2.5 Realtime + badge non-lu en direct — NON COMMITÉ
- Nouveau hook `packages/ui/src/notifications/useRealtimeNotificationSync.ts` : canal Supabase sur `public:Notification` **filtré par `recipientId=eq.<uid>`**, invalide `notificationKeys.unreadCount()` + `notificationKeys.all` sur INSERT/UPDATE (`event: '*'`).
- `NotificationList.tsx` : utilise le hook (remplace le canal global non filtré).
- `UnreadBadge.tsx` : `UnreadBadge` et `useUnreadNotificationCount` appellent le hook → badge temps réel partout (feed AppSidebar, ReaderNavOverlay).
- ⚠️ **PRÉREQUIS INFRA (à faire côté Supabase)** : le filtre `recipientId=eq.uid` exige que la table `Notification` ait (a) la **Replication Realtime activée** (publication `supabase_realtime`), (b) une **RLS `SELECT`** autorisant l'utilisateur authentifié à lire uniquement ses propres lignes. Sinon Supabase refuse le filtre ou renvoie tout. **Une migration SQL RLS est à prévoir** (voir §4.2).

### 2.6 MENTION post standalone (Go) — NON COMMITÉ
Trou : les @mentions d'un NOUVEAU post (non-réponse) n'étaient jamais notifiées.
- `apps/api-go/internal/modules/posts/notifications.go` : `notifyMentionsInContent(ctx, tq, content, postID, senderID)` — regex `@([a-zA-Z0-9_]+)`, `GetUsersByUsernames`, puis `createReplyNotification(..., "MENTION", ...)`.
- `apps/api-go/internal/modules/posts/create.go` : appelé dans `CreateFull` quand `in.ParentID == nil` (garde anti-doublon, les réponses passent par `replyNotifications`).
- `threadgate.go` : `replyNotifications` refactoré pour réutiliser `notifyMentionsInContent` (dédup du code).

---

## 3. AUDIT DU SYSTÈME DE NOTIFS (fait — résultats à connaître)

### 3.1 Tableau de couverture par type
| Type | TS (Prisma) | Go (sqlc) | Chemin réel |
|---|---|---|---|
| LIKE | `posts.ts:818` | `posts/notifications.go:77` | **Go** |
| REPOST | `posts.ts:1266` | `posts/notifications.go:81` | **Go** |
| REPLY | `posts.ts:917` | `threadgate.go:177` | **Go** |
| MENTION (réponse) | `posts.ts:921` | `threadgate.go:173` | **Go** |
| MENTION (post standalone) | `posts.ts:597` (chemin mort) | `notifications.go` (AJOUTÉ) | Go |
| COMMENT (article) | `articleComments.ts:69` | **NON** | TS seul |
| FOLLOW | `follows.ts:76` | `creator/handler.go:274` (AJOUTÉ) | **Go désormais** |
| MEDIA_INVITE | `dashboard media/actions.ts:321` | **NON** | TS seul |
| MEDIA_MEMBER_JOINED | `dashboard media/actions.ts:394` | **NON** | TS seul |
| MEDIA_ARTICLE_PUBLISHED | `notifications.ts:141` (fan-out ≤500) | **NON** (worker Go fait l'email, pas la notif DB) | TS seul |
| MEDIA_ARTICLE_SUBMITTED | `articles/index.ts:137` | **NON** | TS seul |
| MEDIA_MENTION | **NON** (jamais créé) | **NON** | Type mort |

### 3.2 Points clés de l'audit
- **Lecture des notifs = 100% Go** (`apps/api-go/internal/modules/notifications/`) : liste groupée 48h, unread-count, mark-read, prefs. Les server actions `packages/api-client/src/actions/notifications/index.ts` routent tout vers Go.
- **Aucun doublon runtime actuel** pour les types du feed (routage exclusif `isGoEnabled`).
- **Risques latents** : `repostPostAction` (`feed/index.ts:516`) appelle `posts.toggleRepost` DIRECTEMENT sans `isGoEnabled` (contourne le Go) ; `createThoughtAction` (`feed/index.ts:199`) a un proxy Go mais est inutilisé par les apps (le composer passe par `createThoughtThreadAction` TS).
- **Pas d'emails** : les toggles `emailLikes`/`emailReplies`/... existent (DB + prefs) mais AUCUN email n'est émis. Feature morte. `push*` non plus (pas de push).
- **Événements domaine** : Go asynq gère newsletter/webhooks/search-sync quand Go activé. `publishPostLiked`/`publishPaywallHit` définis mais jamais appelés.

---

## 4. TRAVAIL RESTANT — par priorité

### 4.1 ⚠️ URGENT — Migration RLS pour le Realtime des notifs
Le hook §2.5 filtre `recipientId=eq.<uid>`. Sans RLS + Replication, le Realtime ne marchera pas. Il faut :
1. Une migration SQL (Supabase) : activer la publication `supabase_realtime` sur la table `Notification` :
   ```sql
   alter publication supabase_realtime add table public."Notification";
   ```
2. Une policy RLS sur `Notification` :
   ```sql
   create policy "Users read own notifications" on public."Notification"
     for select using (auth.uid() = "recipientId");
   ```
   (Adapter si les colonnes UUID vs text : `recipientId` est UUID en DB.)
3. Vérifier si d'autres tables Realtime (Thought, Like) ont déjà cette config (le feed utilise Realtime sur `Thought` — cf. `useRealtimeFeedBuffer.ts`). Ne PAS casser ça.

### 4.2 Boucher les trous de création de notifs
- **MENTION post standalone via `createThoughtThreadAction`** : l'audit montre que le composer de fil (`ThoughtComposer.tsx`) passe par `createThoughtThreadAction` (TS) qui NE crée PAS de MENTION. Le fix Go §2.6 ne couvre que le endpoint `POST /v1/posts` (Go). Décision : soit router `createThoughtThreadAction` vers le Go, soit ajouter la notif dans le repo TS `posts.ts:597`. **À clarifier quel chemin le composer utilise réellement.**
- **COMMENT (article)** : `articleComments.ts` fait la notif TS. Si on migre les commentaires vers Go, créer `InsertCommentNotification` + `GetCommentPrefs` + `ExistsUnreadCommentNotification` dans `apps/api-go/sql/queries/notifications.sql`. Pas d'endpoint Go `/v1/articles/{id}/comments` actuellement.
- **MEDIA_ARTICLE_PUBLISHED fan-out** : le worker Go `HandleArticlePublished` fait l'EMAIL mais pas la notif DB. Si on veut la notif DB côté Go, ajouter le fan-out (≤500 abonnés) dans le handler d'événement Go.
- **MEDIA_MENTION** : type mort — soit l'implémenter, soit le retirer de l'enum (moins de confusion).

### 4.3 Emails de notification (feature "pro" — actuellement morte)
- Les prefs `email*` sont stockées mais jamais consommées.
- Choisir un provider : **Resend** est le plus simple (SDK TS + Go). 
- Côté Go : un worker asynq pour l'envoi (pattern existant : `apps/api-go/internal/queue` + `cmd/worker/main.go` avec `workers/newsletter.go`). Émettre un événement à chaque `Insert*Notification` ou appeler l'envoi dans les fonctions de notif.
- Côté TS : pareil via eventBus.
- Ne pas oublier le `NOTIFY` côté DB pour éviter le polling.

### 4.4 Migration du Dashboard vers Go (GROS CHANTIER — à faire par étapes)
Le Go couvre déjà : posts/feed, notifications, analytics, articles (squelette), creator (users/follow). **Reste 100% TS (~40 actions)** :

| Module | Fichier | Actions | Complexité |
|---|---|---|---|
| Articles (éditeur) | `packages/api-client/src/actions/articles/index.ts` (624 lignes) | 13 actions | **Élevée** (validation, slugs, review, premium, annotations) |
| Médias | `apps/dashboard/src/app/(creator)/media/actions.ts` | 10 actions | **Élevée** — RBAC (owner/editor/writer), invites par token, permissions |
| Profil dashboard | `packages/api-client/src/actions/dashboard/index.ts` | 9 actions | Moyenne |
| Webhooks | `apps/dashboard/src/app/(creator)/developer/webhooks/actions.ts` | 5 actions | Faible |
| Import Substack | `apps/dashboard/src/app/(creator)/import/actions.ts` | 1 action | Faible |
| Advanced | `apps/dashboard/src/app/(creator)/advanced/actions.ts` | 3 actions | Faible |

**Coûts réels :**
1. **RBAC média** (`@qoe/auth` : `canMedia`, `canEditMediaArticle`, `MediaMemberContext`) — logique complexe à réimplémenter en Go. LE risque principal.
2. **Éditeur d'articles** — validation lourde (slugs, content hash, premium, schedule, annotations sync). Le Go n'a qu'un squelette (`articles/handler.go`).
3. **Polymorphisme Publication** (PERSONAL vs MEDIA) déjà géré pour le feed — mais workflows média (invites, revue, membres) nouveaux.
4. **eventBus TS vs asynq Go** — porter tous les événements.

**Ordre recommandé** : (1) Articles CRUD complet → (2) Webhooks → (3) Profil/subdomain/API keys → (4) Médias/RBAC pour la fin.

---

## 5. OUTILS / COMMANDES

- **Typecheck** : `pnpm typecheck` (global) ou `pnpm --filter @qoe/xxx typecheck`.
- **Go** : `cd apps/api-go && go build ./... && go vet ./... && gofmt -l .`
- **sqlc** : `cd apps/api-go && sqlc generate` (v1.31.1).
- **Lint** : `pnpm --filter @qoe/xxx exec eslint <fichiers>`.
- **Tests DB TS** : `pnpm --filter @qoe/db test` (vitest). Il existe `notificationGrouping.test.ts` mais c'est un utilitaire isolé, PAS lié à l'implémentation réelle.

---

## 6. PIÈGES / NOTES

- `User.id` en DB = UUID (UID Supabase). `Publication.id` = TEXT (cuid). Ne pas confondre.
- `Notification.recipientId`/`senderId` = UUID. `publicationId`/`thoughtId`/`articleId` = TEXT (nullable).
- Le `GetPublicationOwner` Go fait un `COALESCE(...)::text` — ne pas retirer (sinon scan NULL → erreur).
- `prettier`/`eslint --fix` tournent en pre-commit (husky/lint-staged). Les fichiers `messages/*.js` se font reformater à `pnpm install`.
- Ne jamais commiter `.freebuff/`.
- Le repo TS `packages/db` est le FALLBACK — ne pas supprimer tant que le Go ne couvre pas tout (le feed dépend encore de `createThoughtThreadAction`, `articleComments`, `follows` pour certaines routes).
- Contexte utilisateur : parle FRANÇAIS. Veut du code "propre et pro", accepte de migrer vers Go quand c'est plus optimisé.
