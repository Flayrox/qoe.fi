# 🕸️ Audit Web — Ce qu'il faut connecter (état au 17 août 2026)

> Audit écrit après exploration ligne par ligne du monorepo. Objectif : lister
> **exactement** ce qui existe, ce qui manque, et les décisions à trancher pour
> finaliser le web (apps/feed, apps/dashboard, apps/web, apps/landing) en
> s'appuyant sur le backend Go (`apps/api-go`) devenu *backend-of-record*.

---

## 0. TL;DR — Ce qui bloque le plus

| # | Domaine | État actuel | Action critique |
|---|---|---|---|
| 1 | Embedding IA | ✅ **FAIT** — migration 1024 + HNSW, worker asynq (TEI/jina), `/articles/{id}/similar` + `/search/semantic`, **« À lire aussi » web + mobile** | Reste : déployer le service d'inférence (TEI) pour peupler les vecteurs |
| 2 | Collaboratif | ✅ **FAIT** — serveur Hocuspocus (`apps/collab-server`), persistance Postgres, auth JWT Supabase, **RBAC publication**, curseurs + awareness, **TTL 14 jours** | — |
| 3 | Mails | Template + outbox TS **orphelins** (rien n'enqueue) | Câbler Go → NotificationDelivery → worker (attend les clés) |
| 4 | Web → API | Server actions = proxy fin via `goFetch` quand `QOE_API_GO_URL` | Terminer la bascule des actions restantes (articles legacy) |
| 5 | Profil web | ✅ **AMÉLIORÉ** — épinglés en tête, grille médias, partage, stats cliquables, onglets Followers/Abonnements | Reste : shape unifié Go côté web (chantier) |

---

## 1. 🧠 Embedding IA / pgvector — jina-embeddings-v3 (auto-hébergé)

### ✅ Implémenté (17 août 2026)
- **Migration** `20260817100000_resize_embedding_jina_1024` : colonnes
  `vector(1024)` (jina-embeddings-v3) + **index HNSW** `vector_cosine_ops`
  (Article + User).
- **Worker asynq** `workers/embedding.go` : normalise le contenu (marqueur
  paywall exclus), appelle le service d'inférence (endpoint OpenAI-compatible
  configurable `EMBEDDING_BASE_URL`, TEI recommandé) et upsert le vecteur.
  Enqueue automatique à la publication d'article (`articles/service.go`).
- **Endpoints Go** : `GET /v1/articles/{id}/similar` (top-N voisins HNSW,
  vide si non indexé) et `GET /v1/search/semantic?q=` (embed de la requête).
- **UI** : section **« À lire aussi »** sous les articles (web + mobile),
  alimentée par pgvector via `getSimilarArticles`.
- Tests Go verts (upsert, dimension, tri, empty).

### Ce qui reste
1. **Déployer le service d'inférence** (TEI / jina-embeddings-v3) en local
   puis sur le VPS, et pointer `EMBEDDING_BASE_URL` — c'est le seul blocage
   pour peupler les vecteurs et activer réellement la recherche sémantique.
2. **`embedding.profile`** : tâche asynq pour les profils créateurs
   (bio → vecteur User) à la mise à jour du profil.
3. **Recommandations du feed** : top-K par similarité vs l'historique de
   lecture du viewer (API dédiée).
4. **Recherche sémantique dans l'UI** : brancher `/search/semantic` dans la
   recherche web/mobile une fois le service d'inférence actif (le Meilisearch
   lexical reste la recherche par défaut).

### Décisions à trancher
- Fournisseur du modèle : HF `jinaai/jina-embeddings-v3` quantisé (FP16) sur
  le VPS ? GPU requis ou CPU suffisant pour la latence visée ?
- Chunking : par paragraphe (`Article.content` est du HTML TipTap) ? taille ?
- Batching : 1 article = N chunks → table `ArticleChunk(embedding)` plutôt
  qu'une colonne unique sur `Article` ? (recommandé pour la granularité)

---

## 2. ✍️ Temps réel collaboratif — TipTap Collaboration (Yjs)

### ✅ Implémenté (17 août 2026)
- **`apps/collab-server`** (nouveau workspace `@qoe/collab-server`) : serveur
  **Hocuspocus v2.15** auto-hébergé — WebSocket WSS, persistance Postgres
  (table `collab_documents`, état Yjs binaire), auth JWT Supabase par
  introspection `/auth/v1/user` (même source de vérité que l'API Go),
  plafond de taille de document, fallback mémoire en dev.
- **`Editor.tsx`** : `LocalCollaborationProvider` (BroadcastChannel) supprimé
  → `HocuspocusProvider` réel + **curseurs** (`@tiptap/extension-collaboration-caret`,
  couleur stable par utilisateur) + **compteur d'éditeurs en direct**
  (awareness Yjs) + **seed du document** après le premier sync (l'état serveur
  gagne, plus de race ni de doublons).
- **Migration** `20260817110000_collab_documents` + modèle Prisma
  `CollabDocument`.
- **Tests** : 10 tests verts dont e2e réel (2 providers Yjs synchronisés,
  persistance, nouvel arrivant, refus d'un token invalide).
- Env : `NEXT_PUBLIC_COLLAB_URL=ws://localhost:1234`, `COLLAB_PORT`
  (copiés par `scripts/copy-env.js`, ajoutés au `globalEnv` turbo).

### Ce qui reste (durcissement)
1. ✅ **RBAC publication** : dans `onLoadDocument`, seul l'auteur, les
   co-auteurs et les membres actifs du média peuvent éditer (requête SQL
   dans `apps/collab-server/src/permissions.ts`).
2. **TTL / nettoyage** : purger `collab_documents` des brouillons non touchés
   depuis N jours (cron Go existant ou worker).
3. **Historique** : l'état canonique public reste le HTML autosavé ; Yjs peut
   plus tard alimenter un historique de révisions (snapshots périodiques).

### Architecture en place
```
Dashboard (TipTap + Collaboration ext + Caret)
        │  WSS (NEXT_PUBLIC_COLLAB_URL)
        ▼
Hocuspocus server (apps/collab-server, auth JWT, awareness)
        │  persistance
        ▼
Postgres (collab_documents, état Yjs binaire) + autosave HTML (API Go)
```

---

## 3. 📧 Mails (à la toute fin — attend les clés)

### Ce qui existe
- **`packages/workers/src/email-provider.ts`** : contrat `EmailProvider`
  (adapter Resend/Postmark/SES/SMTP auto-hébergé), résolution par
  `EMAIL_PROVIDER` env — **aucun fournisseur concret** enregistré.
- **`packages/workers/src/notification-email.ts`** : template pur
  `renderNotificationEmail` (snapshot-testé) + `processNotificationEmailDelivery`
  (claim atomique) + `drainNotificationEmailOutbox` (scheduler).
  ⚠️ **Rien ne l'appelle** — c'est un worker BullMQ *fantôme*.
- **Prisma** : table `NotificationDelivery` (QUEUED/PROCESSING/SENT/FAILED,
  attempts, availableAt, provider, providerId, lastError) + `NotificationPreference`
  (emailLikes/emailReplies/emailComments/emailMentions/emailFollows/emailReposts/emailMedia).
- **Go** : module `notifications` avec préférences (get/patch), worker asynq
  `newsletter.go` (fanout article.published aux abonnés), `stripe.go` (email
  subscriber dans metadata).

### Ce qui manque (quand on aura les clés)
1. **Câbler Go → outbox** : quand une notification LIKE/REPLY/FOLLOW est créée
   et que la préférence `emailX` est true → insérer `NotificationDelivery`
   (channel EMAIL, QUEUED, availableAt=now). Actuellement **rien** ne lit
   `EmailLikes` etc. pour enqueuer.
2. **Worker de livraison** : le worker asynq Go doit drainer
   `drainNotificationEmailOutbox` (soit un handler Go qui appelle le package TS
   — impossible en Go natif — soit **un worker TS dédié** qui tourne à côté ;
   ou réécrire la livraison en Go avec un vrai SDK SMTP/Resend).
   ⚠️ **Choix d'architecture à faire** : la logique d'envoi est en TS
   (`packages/workers`) mais les queues sont en Go (asynq). Deux options :
   - réécrire l'envoi en Go (adapter SMTP + templates Go) → un seul runtime,
   - garder le worker TS + endpoint interne `/internal/email/*` (pattern
     `events.Handler` existant) que le Go appelle.
   → Recommandation : **réécrire en Go** (cohérence, un seul déploiement).
3. **Templates transactionnels** : bienvenue, reset de mot de passe,
   abonnement (succès/échec), invitation contributeur (template existe),
   newsletter (le `newsletter.go` ne fait que logger « → email » sans envoi).
4. **Provider** : Resend ou SMTP auto-hébergé ? (l'utilisateur fournira les clés)
5. **Retry/backoff** : `availableAt` + `attempts` sont déjà là ; ajouter un
   backoff exponentiel et un dead-letter après N tentatives.

---

## 4. 🔌 Câblage web → API Go (proxies `goFetch`)

### Ce qui existe (déjà proxyé)
- Feed/posts : `getFeedItemsAction`, `createThoughtAction`, `replyToPostAction`,
  `toggleLikePostAction`, `toggleRepostPostAction` (avec fallback TS).
- Notifications : liste, unread-count, mark-read, préférences.
- Dashboard : profile, subdomain, navigation, social, api-keys, onboarding.
- Articles : get, create, update, publish, review, delete, capabilities,
  categories (beaucoup de `isGoEnabled()` branches déjà présentes).
- Tenants : follow state. Media : create/delete. Webhooks : CRUD + ping.

### Ce qui manque / points d'attention
1. **Le web (`apps/feed`) consomme encore les shapes legacy** : `ThoughtData`
   dans `apps/feed` (le type a été unifié en `FeedPost` côté mobile/api-client).
   → Migrer `apps/feed` sur le shape unifié (normalize partagé).
2. **Param `tab` du feed ignoré côté Go** : `/v1/feed` ne filtre pas par
   tab (following/trending) — le client appelle des routes distinctes ;
   vérifier la cohérence.
3. **`QOE_API_GO_URL` non défini en dev par défaut** : les branches TS
   restent le fallback ; risque de drift TS vs Go. → Mettre à jour
   `docs/ARCHITECTURE_REFERENCE.md` et les envs de dev pour pointer le Go.
4. **Événements internes** : `events.Handler` (secret partagé) — vérifier
   que `article.published` côté TS passe bien par `/internal/events/*`
   (le README dit « câblés côté TS (goFetch) » — à confirmer).
5. **Analytics financières** : déjà en Go, vérifier que les server actions du
   dashboard analytics passent par le Go (pas Prisma direct).

---

## 5. 👤 Refonte du profil web (`apps/feed/src/app/(reader)/[username]/`)

### Déjà fait dans cette passe
- Onglets **Abonnés / Abonnements** (FollowList + server action
  `getFollowListAction` + repo `follows.listFollowers/listFollowing`).
- Stats cliquables (abonnés/abonnements → onglets), compteur `following`
  ajouté à l'API Go.

### À faire (refonte complète, inspirée de Bluesky/Bsky web)
- **Bannière de profil** (cover) + avatar certifié + bio riche.
- **Compteurs** followers/following/likes cliquables (parité mobile).
- **Onglets** : Pensées / Réponses / Médias / Articles / J'aime (Bluesky
  profile tabs) — aujourd'hui seulement Pensées + Articles.
- **Fil de pensées du profil** : utiliser le shape unifié `FeedPost`
  (normalize partagé) au lieu de `ThoughtData` legacy.
- **Boutons** : Suivre (état isFollowing déjà fourni), Message, ⋯ (signaler).
- **Responsive mobile-first** (le profil web doit matcher l'app mobile).

---

## 6. 🏗️ Décisions d'architecture en attente (récap)

1. **Embedding** : ✅ colonne unique 1024 retenue + implémentée (worker + HNSW
   + similaires + recherche sémantique). Reste : déployer TEI (inférence).
3. **Mails** : réécrire l'envoi en Go (recommandé) vs worker TS + endpoint
   interne ; provider Resend vs SMTP (attend les clés).
4. **Stripe** : webhook Go déjà en place (signature HMAC + asynq) ; attend les
   clés pour tester l'end-to-end réel.
5. **Meilisearch** : fonctionne déjà (index articles, sync asynq) — PAS de
   doublon avec pgvector : lexical vs sémantique, les deux coexistent.

---

## 7. Ordre d'exécution — état au 17 août (soir)

✅ **FAITS** (commits de la journée) :
1. Embedding : migration 1024 + HNSW, worker asynq TEI/jina, `/articles/{id}/similar`,
   `/search/semantic`, « À lire aussi » web + mobile.
2. Collaboratif : apps/collab-server (Hocuspocus), persistance Postgres, auth
   JWT, RBAC publication, curseurs, TTL 14 jours.
3. Profil web : épinglés en tête, grille médias, partage, stats cliquables,
   onglets Followers/Abonnements.

🔜 **RESTE** :
4. Déployer TEI (inférence jina) → peupler les vecteurs → recherche sémantique UI.
5. Mails + Stripe — à la toute fin (attend les clés).
6. Basculer 100 % des server actions sur Go — purge des branches `isGoEnabled()`.
7. Shape unifié Go côté profil web (même chantier que le mobile, déjà fait).

---

## 8. Notes de lecture (fichiers clés)

| Fichier | Rôle |
|---|---|
| `apps/api-go/README.md` | État de l'art du backend Go (source de vérité) |
| `apps/api-go/internal/workers/search.go` | Worker asynq → Meilisearch (lexical) |
| `apps/api-go/internal/workers/embedding.go` | Worker asynq → embeddings jina (sémantique, pgvector) |
| `apps/collab-server/src/permissions.ts` | RBAC publication (qui peut co-éditer) |
| `apps/feed/src/components/social/SimilarArticlesSection.tsx` | « À lire aussi » web (pgvector) |
| `apps/mobile/src/components/article/similar-articles.tsx` | « À lire aussi » mobile (pgvector) |
| `apps/api-go/internal/workers/newsletter.go` | Fanout newsletter (logger seulement — envoi à brancher) |
| `apps/api-go/internal/modules/articles/service.go` | Hook `article.published` (point d'accroche embedding) |
| `apps/dashboard/src/features/editor/components/Editor.tsx` | Éditeur TipTap + HocuspocusProvider + curseurs + seed post-sync |
| `apps/collab-server/` | Serveur Hocuspocus : persistance Postgres + auth JWT + RBAC + factory testable |
| `packages/workers/src/notification-email.ts` | Outbox email TS (à réécrire en Go ou brancher) |
| `packages/api-client/src/actions/utils/go-client.ts` | Proxy fin web → Go (goFetch) |
| `apps/feed/src/app/(reader)/[username]/components/ProfileView.tsx` | Profil web (épinglés, grille médias, partage, stats) |
