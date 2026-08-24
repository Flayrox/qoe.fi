# 🕸️ Audit Web — Ce qu'il faut connecter (état au 17 août 2026)

> Audit écrit après exploration ligne par ligne du monorepo. Objectif : lister
> **exactement** ce qui existe, ce qui manque, et les décisions à trancher pour
> finaliser le web (apps/feed, apps/dashboard, apps/web, apps/landing) en
> s'appuyant sur le backend Go (`apps/api`) devenu *backend-of-record*.

---

## 0. TL;DR — Ce qui bloque le plus

| # | Domaine | État actuel | Action critique |
|---|---|---|---|
| 1 | Embedding IA | ✅ **FAIT & ACTIF** — migration 1024 + HNSW appliquée sur Supabase, worker asynq, service d'inférence auto-hébergé **en local** (llama.cpp/jina Q8_0 via launchd), 9/9 articles indexés, `/articles/{id}/similar` + `/search/semantic` testés avec vraies reco | Reste : déployer TEI sur le VPS (HF_TOKEN requis) pour la prod |
| 2 | Collaboratif | ✅ **FAIT** — serveur Hocuspocus (`apps/collab-server`), persistance Postgres, auth JWT Supabase, **RBAC publication**, curseurs + awareness, **TTL 14 jours** | — |
| 3 | Mails | Template + outbox TS **orphelins** (rien n'enqueue) | Câbler Go → NotificationDelivery → worker (attend les clés) |
| 4 | Web → API | Server actions = proxy fin via `goFetch` quand `QOE_API_URL` | Terminer la bascule des actions restantes (articles legacy) |
| 5 | Profil web | ✅ **AMÉLIORÉ** — épinglés en tête, grille médias, partage, stats cliquables, onglets Followers/Abonnements | Reste : shape unifié Go côté web (chantier) |

---

## 1. 🧠 Embedding IA / pgvector — jina-embeddings-v3 (auto-hébergé)

### ✅ DÉBLOQUÉ (18 août 2026) — service d'inférence local actif

- **Migrations appliquées sur Supabase** : `20260817000000_add_muted_user`,
  `20260817100000_resize_embedding_jina_1024` (vector 1024 + HNSW),
  `20260817110000_collab_documents` (la colonne était restée en `vector(1536)`
  → erreur `expected 1536 dimensions, not 1024` au premier backfill).
- **Service d'inférence LOCAL (Mac arm64)** : llama.cpp natif
  (`scripts/launchd/com.qoefi.embedding-server.plist`) sert le GGUF
  `jina-embeddings-v3-Q8_0` (600 Mo, converti depuis ModelScope — HF bloque
  les accès anonymes) sur `127.0.0.1:8081`, API OpenAI-compatible, `--pooling mean`.
  ⚠️ llama.cpp **crashe** si le payload contient le champ `task` → il est
  désormais optionnel (`EMBEDDING_INDEX_TASK` / `EMBEDDING_QUERY_TASK`, vide = omis).
- **Worker asynq** (`apps/api/cmd/worker`) lancé via launchd
  (`com.qoefi.api-worker.plist`) + **outil de backfill** `apps/api/cmd/backfill`
  (enqueue `embedding.article` pour les articles publiés sans vecteur ; `-force` = ré-embed).
- **MRL 512** (18 août) : migration `20260818000000_shrink_embedding_mrl_512` —
  colonnes `vector(512)` (jina tronqué, perte négligeable, moitié moins de
  stockage, HNSW 2× plus rapide). Dimension pilotée par `EMBEDDING_DIMS`
  (défaut 512, troncature appliquée worker + recherche sémantique).
- **Résultat** : 9/9 articles publiés indexés (512 dims), `/v1/articles/{id}/similar`
  et `/search/semantic` retournent de vraies recommandations sémantiques.
- Stubs `apps/{dashboard,feed}/src/lib/ai.ts` passés de 1536 → 1024.

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
1. **Déployer TEI sur le VPS** (amd64 natif) : le service `embedding` est dans
   `docker-compose.yml` (image TEI cpu-1.5, `EMBEDDING_URL=http://embedding:80`,
   tâches jina `retrieval.passage`/`retrieval.query`). Il faut un
   **HF_TOKEN** (HF exige l'auth pour télécharger les modèles) — le modèle est
   mis en cache dans le volume `embedding_cache`.
2. **`embedding.profile`** : tâche asynq pour les profils créateurs
   (bio → vecteur User) à la mise à jour du profil.
3. **Recommandations du feed** : top-K par similarité vs l'historique de
   lecture du viewer (API dédiée).
4. **Recherche sémantique dans l'UI** : brancher `/search/semantic` dans la
   recherche web/mobile (le Meilisearch lexical reste la recherche par défaut).

### Décisions à trancher
- **Licence ⚠️** : `jina-embeddings-v3` est **CC BY-NC 4.0** (usage non
  commercial uniquement) — à valider pour la prod commerciale ; alternatives
  permissives : `bge-m3` (MIT), `jina-embeddings-v2-base-en` (Apache 2.0).
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

## 4. 🔌 Câblage web → API Go (goFetch) — ✅ GO-ONLY (17 août, soir)

### État final de la migration
- **Toutes les branches `isGoEnabled()` sont supprimées** : le web ne parle
  plus qu'à l'API Go (`QOE_API_URL`), qui est le backend-of-record.
- Fichiers purgés : `actions/feed` (like/reply/thread/repost/delete-post,
  follow, follow-list, profil), `actions/articles` (CRUD, revue, catégories,
  commentaires, similaires), `actions/dashboard` (profile, subdomain,
  navigation, social, api-keys, onboarding), `actions/notifications`,
  `actions/tenant`.
- **`getProfileDataAction` supprimé** (lecture Prisma directe legacy) →
  remplacé par `resolveProfileAction` (shape unifié Go `PublicProfileData`).
- Fallbacks Prisma morts retirés (helpers RBAC/notifications/attributions
  désormais inutiles côté web : le Go les gère).
- **Backend Go étendu** : `/v1/users/{username}/articles` (articles d'une
  publication), `followers`/`following` passés en lecture publique (auth
  optionnelle), `publicationId` exposé dans les FollowActor (fixe le follow
  par `username` → `publicationId` sur mobile), `ownerUserId` dans le profil.

### Restes assumés (pas de route Go — fonctionnalités web-composer)
- `createThoughtThreadAction` (création multi-posts en une transaction),
  `getUserDraftsAction` (brouillons), `searchArticleContributorsAction`
  (sélecteur de contributeurs). Pas encore de route Go équivalente.
- En dev, `QOE_API_URL=http://localhost:8090` est défini dans le `.env`
  racine (copié par `scripts/copy-env.js`).

---

## 5. 👤 Refonte du profil web (`apps/feed/src/app/(reader)/[username]/`)

### État après migration (17 août, soir)
- **La page profil web est désormais 100 % sur l'API Go** :
  `page.tsx` + `[tab]/page.tsx` consomment `resolveProfileAction`
  (shape unifié `PublicProfileData` + `FeedSlice`), `getProfileData.ts`
  (Prisma legacy) supprimé.
- Épinglés en tête (📌), grille médias 3 colonnes, bouton partager, stats
  cliquables (Pensées · Abonnements · Abonnés), onglets Followers/Following.

### Encore à faire (inspirée de Bluesky/Bsky web)
- **Bannière de profil** (cover) + avatar certifié + bio riche.
- **Onglets supplémentaires** : Réponses / Médias / J'aime (parité mobile).
- **Boutons** : Message, ⋯ (signaler).
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
4. **Migration web → API Go terminée** : purge des branches `isGoEnabled()`
   (feed, articles, dashboard, notifications, tenant), profil web sur le shape
   unifié Go (`resolveProfileAction`), backend Go étendu (articles d'une
   publication, followers/following publics, `publicationId` FollowActor).

🔜 **RESTE** :
5. Déployer TEI sur le VPS (HF_TOKEN) → recherche sémantique dans l'UI.
6. Mails + Stripe — à la toute fin (attend les clés).
7. Basculer les 3 actions Prisma restantes (createThoughtThread, getUserDrafts,
   searchArticleContributors) sur des routes Go dédiées.

✅ **DÉBLOQUÉ le 18 août** : inférence locale (llama.cpp via launchd) + worker +
   backfill + migrations Supabase 1024/collab appliquées + 9/9 articles indexés.

---

## 8. Notes de lecture (fichiers clés)

| Fichier | Rôle |
|---|---|
| `apps/api/README.md` | État de l'art du backend Go (source de vérité) |
| `apps/api/internal/workers/search.go` | Worker asynq → Meilisearch (lexical) |
| `apps/api/internal/workers/embedding.go` | Worker asynq → embeddings jina (sémantique, pgvector) |
| `apps/collab-server/src/permissions.ts` | RBAC publication (qui peut co-éditer) |
| `apps/feed/src/components/social/SimilarArticlesSection.tsx` | « À lire aussi » web (pgvector) |
| `apps/mobile/src/components/article/similar-articles.tsx` | « À lire aussi » mobile (pgvector) |
| `apps/api/internal/workers/newsletter.go` | Fanout newsletter (logger seulement — envoi à brancher) |
| `apps/api/internal/modules/articles/service.go` | Hook `article.published` (point d'accroche embedding) |
| `apps/dashboard/src/features/editor/components/Editor.tsx` | Éditeur TipTap + HocuspocusProvider + curseurs + seed post-sync |
| `apps/collab-server/` | Serveur Hocuspocus : persistance Postgres + auth JWT + RBAC + factory testable |
| `packages/workers/src/notification-email.ts` | Outbox email TS (à réécrire en Go ou brancher) |
| `packages/sdk/src/actions/utils/go-client.ts` | Proxy fin web → Go (goFetch) |
| `apps/feed/src/app/(reader)/[username]/components/ProfileView.tsx` | Profil web (épinglés, grille médias, partage, stats) |
