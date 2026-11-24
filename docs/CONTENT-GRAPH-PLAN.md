# Graphe de contenu & recommandation — plan vivant (L41 → L43)

> **Rôle de ce fichier.** Plan de chantier du modèle unifié « un post, des arêtes, un
> item de feed ». Il porte les décisions produit verrouillées, la correspondance avec
> les standards (AT Protocol, ActivityStreams), le schéma cible, le contrat de lecture,
> les politiques d'éligibilité, la recommandation, et le découpage en lots avec leurs
> preuves. Il se met à jour **dans le même commit** que le code qu'il décrit, comme
> `docs/AUDIT-CHECKLIST.md`.

Dernière mise à jour : **2026-11-24**.

## 1. Décisions verrouillées (produit)

| #   | Décision                                                                                                                  | Conséquence technique                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| D1  | **Un commentaire d'article est un post** (pas un objet à part)                                                            | `Post.rootArticleId` ; `ArticleComment` devient legacy puis disparaît        |
| D2  | **Les réponses vont à une profondeur infinie**                                                                            | `parentId` + `rootId` récursifs ; lecture par branche, jamais l'arbre entier |
| D3  | **Un commentaire n'entre dans « Pour toi » que s'il est jugé bon**                                                        | politique d'éligibilité + score, pas d'inclusion par défaut                  |
| D4  | **Une réponse d'un compte suivi peut entrer dans « Abonnement »**                                                         | éligibilité par l'auteur + préférences de réponses (comme Bluesky)           |
| D5  | **On aime et on reposte un commentaire comme un post**                                                                    | `Like`, repost et compteurs réutilisés tels quels                            |
| D6  | **Un article est repostable et aimable** (arête générique)                                                                | table d'interactions `subjectType`/`subjectId`                               |
| D7  | **Réutilisation obligatoire des briques existantes** (modération, notifications, quotas, flags, analytics, observabilité) | aucune troisième voie parallèle ; cf. § 7                                    |

Ces lignes sont des décisions **produit**, pas un état d'implémentation : D1, D2, D5 (like
de commentaire via les compteurs existants), D7 sont en place ; D3/D4/D6 (éligibilité par
surface, article repostable) restent L43. L'état livré, lot par lot, est dans le journal en
fin de fichier.

## 2. Correspondance avec les standards

Objectif : **emprunter les sémantiques**, pas implémenter un protocole. Le jour où l'on
fédère, c'est un _mapping_, pas une réécriture.

| Notre modèle            | AT Protocol (Bluesky)                                           | ActivityStreams (W3C)             |
| ----------------------- | --------------------------------------------------------------- | --------------------------------- |
| `Post`                  | `app.bsky.feed.post`                                            | `Note` / `Article`                |
| `parentId` + `rootId`   | `reply { root, parent }` (strongRefs)                           | `inReplyTo`                       |
| Repost (arête)          | `app.bsky.feed.repost { subject }` — **pas** un post            | `Announce`                        |
| Citation                | post + `embed.record`                                           | `Note` avec `inReplyTo`/embed     |
| `FeedItem.reason`       | `feedViewPost.reason { reasonRepost, reasonPin }`               | `Announce` dans une `Collection`  |
| `FeedItem.reply`        | `reply { root, parent, grandparentAuthor }`                     | `inReplyTo` + `replies`           |
| Fil de discussion       | `getPostThread(depth, parentHeight)` — 1-D + refs parent/enfant | `replies` (`Collection`)          |
| Commentaires fermés     | `app.bsky.feed.threadgate`                                      | `replies` absent / `Announce` off |
| Étiquettes / modération | `com.atproto.label` (labelers)                                  | `Flag`, `Block`                   |

Non-objectifs : DID/CID, PDS, synchronisation de dépôt, feed generators en services
séparés. On garde **un** service et des **surfaces** nommées.

## 3. Modèle cible

### 3.1 Nœuds — `Post` est la seule chose qu'on « dit »

| Colonne                            | Rôle dans le graphe                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| `id`                               | identité stable (les ids des commentaires migrés sont **conservés**)          |
| `parentId`                         | réponse directe (n'importe quel post, profondeur libre)                       |
| `rootId`                           | racine du fil **post** (`NULL` si le post est lui-même une racine)            |
| `rootArticleId`                    | **nouveau** — article dont ce post est un commentaire (n'importe quel niveau) |
| `repostId`                         | **legacy** — repost déguisé en post, migré vers l'arête (§ 3.2)               |
| `quotedArticleId`                  | citation d'article (contenu propre + carte article)                           |
| `quotedExcerpt`/`quotedAnnotation` | extrait et annotation de citation                                             |

Invariants :

1. `parentId` ⇒ le parent existe et partage le même `rootArticleId`. Depuis L42 il peut
   être un **tombstone** (`deletedAt` non nul) : c'est précisément ce qui garde ses
   enfants atteignables et le fil lisible.
2. `rootId` est soit `NULL` (racine), soit l'id du post racine du fil — y compris quand
   cette racine est devenue un tombstone.
3. Un post ne peut pas être à la fois `rootArticleId` et `quotedArticleId`.
4. Un commentaire d'article n'a jamais `isDraft = true` ni `scheduledAt` (il est publié).
5. La profondeur n'est jamais stockée : elle se calcule (`parentId` récursif) et n'est
   pas bornée à la lecture — elle est paginée (L42).

### 3.2 Arêtes — `Interaction` (cible, **non livrée**)

> État réel au 2026-11-24 : la table `Interaction` n'existe pas. L41/L42 n'ont livré que
> `Post.rootArticleId` et les fils ; le like/repost génériques (article, commentaire)
> restent à faire et ne sont pas annoncés comme disponibles.

```
Interaction(id, userId, kind, subjectType, subjectId, createdAt)
  kind ∈ {LIKE, REPOST, BOOKMARK}
  subjectType ∈ {POST, ARTICLE}
  UNIQUE (userId, kind, subjectType, subjectId)
```

- Remplace à terme `Like` (postId) et `repostId` : on peut aimer/reposter un **article**,
  un **commentaire**, une **pensée**, avec la même mécanique.
- `Post.likeCount`/`repostCount` restent des compteurs **dénormalisés** maintenus par la
  même transaction que l'arête (les feeds trient dessus).
- Un repost n'est **pas** un post : il ne peut pas être répondu, ne pollue plus les
  requêtes (`AND content = ''` disparaît), et s'affiche comme une enveloppe
  (`reasonRepost`) autour du contenu d'origine.

### 3.3 Migration des commentaires (00097)

1. `ALTER TABLE "Post" ADD COLUMN "rootArticleId" TEXT REFERENCES "Article"(id) ON DELETE CASCADE;`
   - index partiel `(rootArticleId, createdAt) WHERE rootArticleId IS NOT NULL`.
2. Copie `ArticleComment → Post` **avec le même id** (la FK `Notification."commentId"`
   suit sans réécriture de données) :
   - niveau 1 : `rootId = NULL`, `rootArticleId = articleId` ;
   - réponses : `rootId = COALESCE(parent.rootId, parent.id)`, même `rootArticleId` ;
   - `replyCount` recalculé depuis les enfants directs ;
   - `visibility`/`contentVisibility` laissés à leurs valeurs par défaut (`public` /
     `PUBLIC`) : les feeds réappliquent `can_view_profile`, `is_muted_by`, blocks et mots
     masqués.
3. `Notification."commentId"` : drop FK → `ArticleComment`, add FK → `Post` (valeurs
   inchangées).
4. `ArticleComment` **gelée** (plus aucun écrivain, plus aucun lecteur), supprimée par
   une migration ultérieure après un cycle de déploiement.

Rollback : le bloc `-- +goose Down` **du même fichier** `00097_content_graph.sql`
(supprime les notifications dont le `commentId` n'existe pas dans `ArticleComment`, remet
la FK sur `ArticleComment`, supprime les posts dont `rootArticleId` est non nul, puis la
colonne, la FK et l'index). Aucune table de correspondance temporaire n'existe : la
colonne `rootArticleId` sert de marqueur. Ce down n'est sûr que pendant la fenêtre de
déploiement L41 — après, il supprimerait des commentaires légitimes (documenté dans le
fichier de migration).

## 4. Contrat de lecture — `FeedItem` (cible L43, **non livré**)

> État réel au 2026-11-24 : aucune structure `FeedItem` unique n'existe. Les fils rendent
> `posts.ReplyItem` (`id`, `parentId`, `rootId`, `createdAt`, `updatedAt`, `content`,
> `tombstone`, `tombstoneReason`, `why`, `replyCount`, `likeCount`, `repostCount`,
> `author` nullable) ou, pour le feed et le profil, `posts.FeedSlice`. Le `why` est livré
> en L43 via les décisions d'éligibilité (`eligibility.Decision`) et les tombstones de fil ;
> l'enveloppe complète `FeedItem { post, reply, reason, why }` reste la cible du lot de
> rendu du contexte d'article, pas un contrat déjà exposé.

```ts
interface FeedItem {
  post: PostView; // contenu principal
  reply?: {
    // contexte de discussion
    root: PostView | null; // racine du fil (null si article)
    article?: ArticleBrief; // racine article (commentaire d'article)
    parent: PostView | null; // parent direct
    grandparentAuthor?: AuthorBrief; // « en réponse à » lisible
  };
  reason?: { type: 'repost' | 'pin' | 'article_repost'; by: AuthorBrief; at: string };
  why?: string; // explanation de recommandation (L43)
}
```

| Cas                            | Item                                                                 |
| ------------------------------ | -------------------------------------------------------------------- |
| Pensée racine                  | `post` seul                                                          |
| Réponse profonde (niv. n)      | `post` + `reply{root,parent,grandparentAuthor}` — racine repliée     |
| Commentaire d'article (niv. 1) | `post` + `reply{article}` — carte article                            |
| Réponse à un commentaire       | `post` + `reply{root=commentaire, article, parent}`                  |
| Repost d'une pensée            | post d'origine + `reason{repost, by}` (jamais un post-repost)        |
| Repost d'un commentaire        | commentaire d'origine + `reason{repost}` + contexte article conservé |
| Repost d'un article            | `reason{article_repost}` + carte article (pas de post)               |
| Citation d'article             | `post` (contenu) + carte article intégrée                            |
| Citation de post               | `post` + carte du cité                                               |
| Like                           | **jamais** un item ; uniquement preuve sociale et signal de score    |

Règles d'affichage : un seul bandeau de raison (dernier reposteur), la racine n'est
jamais dépliée dans le feed (un clic ouvre le fil), et un item de feed ne montre jamais
plus de deux niveaux de contexte.

## 5. Politiques d'éligibilité

| Surface               | Raison d'afficher      | Filtres durs                                                                                                                          | Préférences utilisateur                                                                |
| --------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **Abonnement**        | l'**auteur** est suivi | blocks/mutes/mots masqués, visibilité, commentaires ouverts si article                                                                | afficher les réponses ; seulement les réponses à des comptes suivis ; fil ≥ N réponses |
| **Pour toi**          | le **contenu** est bon | idem + profondeur ≤ 1 pour un commentaire, article commentable, pas de réponse à un compte bloqué, pas de doublon de fil dans la page | —                                                                                      |
| **Profil / Réponses** | l'auteur a écrit       | visibilité du profil, blocks, suppression                                                                                             | —                                                                                      |
| **Fil**               | structure              | gates de commentaires de l'article, profondeur demandée, curseur                                                                      | tri (chronologique / populaire)                                                        |

Un commentaire d'article n'est **jamais** éligible à « Pour toi » aujourd'hui : le garde
réel est le prédicat SQL `p."rootArticleId" IS NULL`, présent dans `FindFollowingFeed`,
`FindTrending` et `FindPostsByAuthor`. Aucun drapeau `comments_in_discover` n'existe.

Depuis L43, ces politiques ont une forme exécutable et explicable :
`internal/eligibility` expose `Surface` (`following`, `discover`, `recommended`, `thread`,
`profile`, `replies`), `ParseSurface`, `Candidate`, `Weights`, `Decide`, `Rank` et
`WhyFor`. Chaque décision porte `reason` (machine) et `why` (lisible) ; le serveur rend
les retenus classés et les exclus motivés via `GET /v1/feed/eligibility?surface=…`. Le
critère de langue n'est **pas** appliqué : `Post` n'a pas de colonne de langue (seul
`User."languageCode"` existe) — le jour où la colonne arrive, la règle entre dans
`Decide`, pas dans une seconde liste.

## 6. Recommandation (L43)

Pipeline en deux étapes, pas de ML avant les logs :

1. **Récupération** — trois sources plafonnées : graphe de suivi, ANN thématique
   (`Post.embedding` + index HNSW existants), candidats par engagement (7 j).
2. **Features** — affinité (distance de suivi, interactions passées), similarité
   thématique, vélocité d'engagement, fraîcheur avec demi-vie **par surface**, diversité
   auteur/fil, atténuation par profondeur, pénalité « déjà vu ».
3. **Score** — somme pondérée transparente, poids en `SystemConfig` (éditables en admin,
   sans redéploiement). Côté L43 : `feed.rank_fresh`, `feed.rank_engagement`,
   `feed.rank_affinity`, `feed.rank_min_score`, `feed.rank_max_age_days`, lus une seule
   fois par `eligibility.WeightsFromConfig` (défauts sûrs, config partielle ou invalide
   ignorée). Le moteur personnalisé garde ses poids historiques `feed.rerank_*`. Pas de
   réseau de neurones avant d'avoir une semaine d'expositions.
4. **Réordonnancement** — plafond 2 items par auteur et 1 par fil et par page.
5. **Explication** — `why` obligatoire (« parce que vous suivez X », « populaire cette
   semaine »), journalisé avec l'item.
6. **Évaluation** — expositions + interactions déjà collectées par
   `packages/analytics` (`useFeedImpressionTracker`, `events.ts`) → NDCG/AUC hors ligne
   sur une semaine tenue à l'écart, avant/après chaque changement de poids.

Garde-fous : signaux **first-party uniquement** (lectures, likes, follows, temps), aucun
tracking tiers ; filtres de sécurité appliqués **à la récupération**, jamais après le
classement.

## 7. Réutilisation obligatoire (pas de tuyau parallèle)

| Brique existante                                                             | Usage dans L41–L43                                                                                           |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `apps/api/internal/moderation` (`CheckSync`, `EnqueueScreen`)                | tout commentaire passe par l'entonnoir P4, comme aujourd'hui                                                 |
| `secguard.EnforceContentWrite` + `QuotasComments`                            | quotas et paliers inchangés pour les commentaires                                                            |
| `internal/notifications.Dispatch` (P3)                                       | notification `COMMENT` conservée, `commentId` = id du post                                                   |
| `internal/antispam`                                                          | validation de texte inchangée                                                                                |
| `internal/abuse` + `SecurityEvent`                                           | détection de rafales de réponses (L43)                                                                       |
| `internal/modules/posts/assembly.go` + `internal/modules/feed/service.go`    | **seuls** assembleurs d'items (`BuildFeedPost`, `FeedSlice`) : les fils réutilisent cette hydratation en L42 |
| `internal/modules/posts` (`AttachmentsFor`, `PollsFor`, `QuotedArticlesFor`) | réutilisés pour les commentaires                                                                             |
| `internal/observability/metrics.go`                                          | métriques disponibles ; **aucun** compteur `feed_items_total{surface,reason}` n'existe encore (cible L43)    |
| `packages/analytics`                                                         | impressions et interactions pour l'évaluation hors ligne                                                     |
| `packages/flags` + `SystemConfig`                                            | drapeaux de déploiement et poids de score                                                                    |
| `Post.embedding` + index HNSW                                                | récupération thématique, aucune infra nouvelle                                                               |

## 8. Lots, preuves, risques

| Lot                                                           | Contenu                                                                                                                                                                                                                                                                                                                                                                                                     | Preuve de sortie                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **L41** — graphe de contenu ✅                                | colonne `Post.rootArticleId` + index partiel, backfill 225 commentaires (ids conservés), FK `Notification."commentId"` repointée, service `articles/comments.go` branché sur `Post`, compteurs (`fetchCommentsBatch`, `publishers`, `analytics`) sur `parentId IS NULL AND deletedAt IS NULL`, seed adapté. **Non livré** : table `Interaction`, assembleur `FeedItem`, like/repost génériques (cible L43). | dry-run transactionnel 00097 (225 → 225, 0 orphelin, FK OK) ; `pnpm guard:sqlc` (38 fichiers) ; `go build ./...` ; `go test` articles/feed/posts/publishers/analytics/seed                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **L42** — fils paginés ✅                                     | une requête `ListThreadPage` à trois portées (`roots`, `children`, `thread`), curseur opaque `(createdAt, id)`, `{ items, nextCursor, hasMore }`, tombstones, `Thread()` = première page (≤ `MaxReplyLimit` = 50) + `repliesCursor`/`repliesTruncated`, UI récursive (core, studio) + onglet profil paginé + surfaces `tenants`, fil de pensée paginé côté web                                              | dry-run transactionnel : pages 3/3/1 sans doublon, insertion concurrente, antidatée non ressuscitée, tombstone + enfants + profondeur 3, deux viewers, compteurs, profil 2/2/2/1 ; `guard:sqlc` 39 fichiers ; `go build`/`go vet`/`go test` posts/articles/feed ; vitest core / studio / tenants + `threadRepliesPagination.test.ts` (6) et `thought-thread-load-more.test.tsx` (2) ; absorbe **R134** et **R314**                                                                                                                                                                                             |
| **L43** — éligibilité + explication ✅ (périmètre 2026-11-24) | `eligibility.Decide`/`Rank` par surface, `WeightsFromConfig` sur `feed.rank_*`, `GET /v1/feed/eligibility`, `tombstoneReason`/`why` sur `ReplyItem` (LATERAL unique de `ListThreadPage`), SDK `parseEligibilitySurface`/`sortEligibilityDecisions`/`getSurfaceEligibilityAction`, tombstone d'article qui affiche `why`                                                                                     | `go test ./internal/eligibility` (nominal, modération, seuil 0, config partielle, égalités, surface inconnue) + `TestSurfaceEligibility_*` dans `feed` (service traversé sur queryer stubbé, sans Docker) ; deux tests de rendu `ArticleComments` dans `article-reading-chain.test.tsx` (`why` serveur affiché, repli générique) ; `go build`/`go vet` ; `go test` posts/feed/articles ; `guard:sqlc` 40 fichiers ; vitest sdk 34 fichiers / 233 tests ; core 69 fichiers / 425 tests ; tsc 0. **Non livré** : contexte d'article dans les feeds, `Interaction`, NDCG hors ligne, métriques `feed_items_total` |

Risques nommés :

- **Volume** : les commentaires deviennent des posts → les feeds filtrent par un prédicat
  SQL (`p."rootArticleId" IS NULL` dans `FindFollowingFeed`, `FindTrending`,
  `FindPostsByAuthor`) ; L43 le remplacera par une éligibilité par surface, sinon
  explosion du fil Abonnement.
- **Compteurs** : `FindTrending` additionne `likeCount + repostCount + replyCount` ;
  les commentaires gonfleraient les articles. Le score de L43 remplace cette somme.
- **Données** : ids conservés pour les notifications ; table legacy gelée, pas droppée
  avant un cycle de déploiement.
- **Mobile** : n'appelle pas l'endpoint des commentaires aujourd'hui — vérifié le
  2026-11-24 — donc la bascule des commentaires ne casse rien en pause. En revanche
  `Thread()` a changé de contrat en L42 (`replies` = première page + `repliesCursor`) :
  le mobile en pause devra paginer à la reprise (dette nommée dans le reste-à-faire).
- **SEO** : un commentaire a désormais une URL de post ; canonical vers l'article,
  permalien en `noindex`.

## 9. Questions encore ouvertes

1. ~~Un commentaire d'article doit-il compter dans l'onglet « Réponses » du profil ?~~
   **Tranché et livré en L42 : oui.** `/v1/users/{username}/replies` liste toutes les
   réponses (`parentId IS NOT NULL`), commentaires d'article compris, avec le même
   curseur que les fils.
2. Les réponses à un commentaire apparaissent-elles dans « Abonnement » quand on suit
   l'auteur de la réponse, ou seulement quand on suit l'auteur du commentaire racine ?
   **Proposition :** l'auteur de la réponse suffit, avec préférence « seulement les
   réponses à des comptes suivis » désactivée par défaut.
3. Faut-il un onglet « Commentaires » sur le profil (distinct de « Réponses ») ?
   **Proposition : non au premier lot** ; le filtre `rootArticleId IS NOT NULL` peut le
   produire plus tard sans migration.

---

## Journal d'avancement

### 2026-11-24 — L41 livré (schéma + bascule)

| Étape                               | État | Preuve                                                                                                                                                                                      |
| ----------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migration `00097_content_graph.sql` | ✅   | dry-run transactionnel (rollback) : 225 commentaires → 225 posts, contenu identique, 0 orphelin, 0 réponse perdue, FK `Notification` repointée                                              |
| `schema.sql` + `sqlc`               | ✅   | `pnpm guard:sqlc` vert (38 fichiers, v1.31.1)                                                                                                                                               |
| `articles/comments.go` sur `Post`   | ✅   | `go build ./...`, tests `articles`/`feed`/`posts`/`publishers`/`analytics`/`seed` verts                                                                                                     |
| Compteurs d'articles                | ✅   | `fetchCommentsBatch`, `publishers`, `analytics` lisent `rootArticleId`                                                                                                                      |
| Compteur de réponses                | ✅   | `IncrementReplyCount` / `DecrementReplyCount` réutilisés (aucune arithmétique locale)                                                                                                       |
| Signalements                        | ✅   | `reportTargetExists("comment")` exige `rootArticleId IS NOT NULL`                                                                                                                           |
| Seed                                | ✅   | `world`/`top` écrivent désormais des posts commentaires                                                                                                                                     |
| Surfaces de feed                    | ⏸️   | `FindFollowingFeed`, `FindTrending`, `FindPostsByAuthor` excluent `rootArticleId IS NOT NULL` : le contexte d'article et le ranking arrivent en L43, l'onglet « réponses » du profil en L42 |

**Décisions prises pendant L41.**

- _Suppression_ : `DeleteArticleComment` reste un `DELETE` dur en L41 (comportement
  actuel, cascade des notifications, aucun orphelin). Le tombstone arrive en L42 avec
  l'arbre paginé, quand l'interface saura afficher « message supprimé » sans casser
  un fil.
- _Racine de fil_ : `rootId` pointe le commentaire de niveau 1, jamais l'article.
  `rootArticleId` porte le contexte sur toutes les lignes, ce qui rend la liste d'un
  article indexable en une seule lecture.
- _Filtres_ : la liste réutilise `is_blocked_bidirectional`, `can_view_profile`,
  `is_muted_by` et `contains_muted_word` — les mêmes helpers que les feeds, donc une
  divergence de visibilité entre le tiroir de lecture et le feed devient impossible.

### Reste à faire au sortir de L41 (historique)

Tout ce qui était listé ici a été livré par L42 (section suivante) : **R134** et **R314**
sont absorbés dans la pagination unique, `ListArticleComments` a disparu au profit de
`ListThreadPage`, et le tombstone a remplacé la suppression dure. Il ne reste de L41 que la
suppression de la table `ArticleComment` (migration `00099`, après un cycle de
déploiement) — reprise dans le reste-à-faire final.

### 2026-11-24 — L42 livré (fils paginés, tombstones, R134 + R314 absorbés)

| Étape                                   | État | Preuve                                                                                                                                                                                                                                                                   |
| --------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Migration `00098_reply_threads.sql`     | ✅   | 4 index partiels `(parentId                                                                                                                                                                                                                                              | rootId   | rootArticleId                                                                            | authorId, createdAt, id)` ; dry-run transactionnel (rollback) sur la base de dev |
| `ListThreadPage` (requête unique)       | ✅   | `scope=roots                                                                                                                                                                                                                                                             | children | thread`, curseur `(createdAt, id)`, tombstones calculés en SQL par les helpers des feeds |
| `GET /v1/articles/{id}/comments` paginé | ✅   | `{ items, nextCursor, hasMore }`, curseur opaque, 400 sur curseur illisible                                                                                                                                                                                              |
| `GET /v1/posts/{id}/replies`            | ✅   | `scope=children` (défaut) ou `thread` (tous les descendants par `rootId`)                                                                                                                                                                                                |
| `GET /v1/users/{username}/replies`      | ✅   | onglet « Réponses » du profil, ids paginés puis hydratés par le feed                                                                                                                                                                                                     |
| `Thread()` sans plafond silencieux      | ✅   | `replies` = première page, `repliesCursor` + `repliesTruncated` ; `GetPostThread`, `GetRepliesForThought`, `GetReplyIDsForThought` supprimées                                                                                                                            |
| Suppression = tombstone                 | ✅   | `DeleteArticleComment` passe en `UPDATE deletedAt` ; structure et `replyCount` conservés                                                                                                                                                                                 |
| Surfaces                                | ✅   | `ArticleComments` (arbre récursif, chargement par nœud), studio communauté, onglet profil, surfaces `tenants` adaptées                                                                                                                                                   |
| Curseur testé unitairement              | ✅   | `posts/replies_test.go` : aller-retour exact, curseur vide = première page, curseur illisible = `ErrInvalidCursor`, bornes `NormalizeReplyLimit`                                                                                                                         |
| Pagination cliente du fil               | ✅   | `repliesCursor`/`repliesTruncated` exposés par le mapping SDK ; `getPostThreadRepliesAction` (`scope=thread`) + `mergeThreadReplies` (rattachement au parent réel, idempotent, orphelin visible et marqué) ; bouton « Charger la suite du fil » dans `ThoughtThreadList` |

**R134 et R314 absorbés, aucun cas séparé.** Il n'existe plus de liste de commentaires
« complète » ni de fil de pensée plafonné : `ListArticleComments`,
`GetRepliesForThought`, `GetReplyIDsForThought` et `GetPostThread` ont été **supprimées**,
et `ListThreadPage` (via `posts.ReplyPageFor`) est la seule lecture de fil, pour les
articles, les pensées et les commentaires.

**Décisions prises pendant L42.**

- _Un seul chemin de lecture_ : `posts.ReplyPageFor` sert les trois surfaces ; la politique
  de visibilité est un `LATERAL` unique (`is_blocked_bidirectional`, `can_view_profile`,
  `is_muted_by`, `contains_muted_word`, shadowban/suspension, masquages). Aucune copie.
- _Tombstone universel_ : supprimé, masqué (auteur/modération) **ou** invisible pour CE
  viewer → même ligne, même place, contenu et auteur vides. Un blocage ne fait donc plus
  disparaître un nœud (et ses enfants) : il le rend illisible, ce qui préserve la
  structure sans rien révéler. Preuve : deux viewers, même page, l'un lit le contenu,
  l'autre voit un tombstone.
- _Compteurs = vivant_ : `replyCount` et les compteurs d'articles comptent les lignes
  `deletedAt IS NULL` (comme les pensées avant L42). Le tombstone occupe une place mais
  n'est pas compté. Les compteurs d'article ne comptent que `parentId IS NULL`, sinon une
  discussion gonflerait le nombre de commentaires de l'article.
- _Curseur illisible = 400_, jamais « première page » : sinon un client cassé
  rejouerait le début du fil en boucle.
- _`Thread()` change de contrat_ : il ne promet plus l'arbre complet, il promet une page
  plus un curseur. `repliesTruncated` remplace le plafond muet de 500.

**Limites mesurées.**

- Les tests d'intégration Go (`articles`, `feed`) exigent Docker/testcontainers :
  indisponibles en local, ils sont **sautés**. Le dry-run SQL transactionnel en tient
  lieu (pages 3/3/1 sans doublon, insertion concurrente, antidatée non ressuscitée,
  tombstone + enfants + profondeur 3, deux viewers, compteurs, profil 2/2/2/1, compte
  bloqué → 0).
- L'en-tête « Discussion (n) » affiche les commentaires **chargés**, pas le total de
  l'article : le total n'est plus connu sans compter le fil (L43 peut l'exposer via un
  compteur serveur si l'UI le veut).

### Reste à faire après L42

- **L43** : éligibilité par surface avec `why` ; ranking transparent pondéré
  (`SystemConfig`) ; levée du prédicat `rootArticleId IS NULL` dans les feeds avec rendu
  du contexte d'article ; compteur total de discussion si l'UI le demande ; table
  `Interaction` (like/repost génériques article/commentaire) et métriques de ranking.
- **Suppression de la table `ArticleComment`** : migration `00099`, après un cycle de
  déploiement (la table est gelée depuis L41, plus aucun lecteur ni écrivain).
- **Mobile (en pause)** : porte encore la dette du contrat `Thread()` (première page +
  `repliesCursor`) ; à traiter à sa reprise, jamais de sa propre initiative. Le web est
  branché (`getPostThreadRepliesAction` + fusion + bouton), les fils d'article et de
  commentaire paginent par nœud depuis L42.
- **Tests d'intégration Go non exécutés** : `articles` et `feed` exigent
  Docker/testcontainers, indisponibles en local ; le dry-run SQL documenté en tient lieu,
  mais le code Go contre une vraie base reste à prouver en CI.
- **Compteur total** : l'API de fil ne renvoie pas de total ; l'en-tête « Discussion (n) »
  affiche les commentaires chargés, pas ceux de l'article.

### 2026-11-24 — L43 livré (éligibilité par surface, `why`, ranking configurable)

| Étape                                | État | Preuve                                                                                                                                                                                               |
| ------------------------------------ | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `internal/eligibility/decision.go`   | ✅   | `Surface`/`ParseSurface` (6 surfaces réelles, inconnue refusée), `Candidate`, `Weights`, `Decide`, `Rank`, `WhyFor` — aucune requête, aucune règle métier dupliquée                                  |
| Poids `SystemConfig`                 | ✅   | `KeyFreshWeight`…`KeyMaxAgeDays` (`feed.rank_*`), `WeightsFromConfig` : défauts sûrs, config partielle/invalide ignorée, zéro explicite conservé                                                     |
| `GET /v1/feed/eligibility?surface=…` | ✅   | `feed.Service.SurfaceEligibility` + `ListEligibilityCandidates` (faits seuls, aucun contenu) ; surface inconnue → 400 ; route protégée                                                               |
| Tombstone motivé                     | ✅   | LATERAL unique de `ListThreadPage` calcule `reason` (deleted, moderated, hidden_by_author, suspended, restricted, blocked, private_profile, muted, muted_word) ; `ReplyItem.TombstoneReason` + `Why` |
| SDK                                  | ✅   | `ELIGIBILITY_SURFACES`, `parseEligibilitySurface`, `sortEligibilityDecisions`, `filterEligibleDecisions`, `getSurfaceEligibilityAction` ; `ArticleCommentPayload.tombstoneReason`/`why`              |
| Web                                  | ✅   | `ArticleComments` affiche `comment.why` à la place du « Message supprimé » générique — la raison vient du serveur, pas d'une devinette locale                                                        |

**Décisions prises pendant L43.**

- _Une seule expression décide et explique_ : la raison du tombstone est calculée dans le
  même `LATERAL` que la visibilité (ordre significatif, la cause la plus factuelle gagne).
  Aucune seconde liste de prédicats à maintenir.
- _Décision en Go, pas en SQL_ : `Decide` tranche et motive à partir de faits déjà
  filtrés ; le SQL reste la source des faits. Les flux publics gardent leurs prédicats
  actuels — L43 ajoute la décision explicable, elle ne réécrit pas les flux en silence.
- _Ordre total_ : `Rank` trie score décroissant, puis date, puis id ; deux contenus de
  même score gardent donc un ordre déterministe. Une pondération nulle rend un score nul
  (et laisse le tri à la date/l'id) — c'est un choix de config, pas une panne.
- _Surface stricte_ : une surface inconnue rend `ErrUnknownSurface` (400 côté HTTP, `null`
  côté SDK). Jamais de repli silencieux sur « following ».
- _Pas de critère de langue_ : `Post` n'a pas de colonne de langue. Rien n'a été inventé ;
  la règle entrera dans `Decide` le jour où la colonne existe.

**Limites mesurées.**

- Le contexte d'article dans les feeds n'est **pas** livré : `rootArticleId IS NULL` reste
  le garde de `FindFollowingFeed`, `FindTrending` et `FindPostsByAuthor`. `Decide` sait
  déjà refuser un commentaire hors surface (`out_of_surface`), mais le rendu du contexte
  d'article manque encore.
- `Thread()` assemble ses réponses via `GetPostsByIDs` (`posts.FeedPost`) : ces lignes ne
  portent pas encore de raison de tombstone. Seule la pagination `ListThreadPage`
  (`ReplyItem`) l'expose.
- **Chemins prouvés sans Docker** (2026-11-24) : `feed/surface_eligibility_test.go`
  traverse `Service.SurfaceEligibility` avec un queryer stubbé et la VRAIE chaîne
  `Decide`/`Rank`/`WeightsFromConfig` —
  `TestSurfaceEligibility_RanksEligibleAndExplainsExclusions` (retenus classés + exclus
  motivés), `_FollowingRequiresFollowAndExplainsIt`, `_UnknownSurfaceIsPropagatedWithoutReading`
  (aucune lecture déclenchée), `_ClampsLimit` (500 → 100, absent → 50),
  `_PartialConfigKeepsSafeDefaults`, `_InvalidConfigFallsBackToDefaults`,
  `_ExplicitZeroAndThresholdAreRespected`, `_ConfigReadErrorFallsBackToDefaults`,
  `_CandidateReadErrorIsPropagated`. Côté web,
  `article-reading-chain.test.tsx` prouve que `ArticleComments` affiche le `why` du
  serveur (`Compte bloqué : contenu masqué.`) et retombe sur « Message supprimé » sans
  raison.
- **Défaut trouvé et corrigé par ces tests** : une `limit` de 500 était rabattue sur 50
  au lieu du plafond 100. Le service plafonne désormais (`EligibilityMaxLimit`) au lieu de
  revenir au défaut.
- **Preuve encore impossible en local** : la requête `ListEligibilityCandidates`
  elle-même (jointure `Post`/`User`, fonctions SQL de visibilité) n'est exécutée que si
  Postgres est disponible ; les tests d'intégration `feed`/`articles` sont sautés faute de
  Docker/testcontainers. Ce qui reste non prouvé est donc **le SQL**, pas la décision.

### Reste à faire après L43

- **Contexte d'article dans les feeds** : assembler `rootPost`/article et lever le prédicat
  `rootArticleId IS NULL`, en réutilisant `Decide` (la règle `out_of_surface` existe déjà).
- **`Interaction`** : table générique (like/repost/bookmark article et commentaire) et
  compteurs associés — toujours non livrée, ne pas l'annoncer.
- **`FeedItem`** : enveloppe unique `{post, reply, reason, why}` côté Go et SDK ; le `why`
  existe aujourd'hui sur les décisions et les tombstones, pas sur les items de feed.
- **Raison de tombstone dans `Thread()`** : passer `GetPostsByIDs` par la même expression
  motivée que `ListThreadPage`, ou faire lire la première page par `ReplyPageFor`.
- **Compteur total de discussion**, **métriques `feed_items_total`** et **NDCG hors ligne** :
  non livrés (le rang est transparent, l'évaluation ne l'est pas encore).
- **Langue** : ajouter `Post.language` (migration) puis la règle dans `Decide`, jamais dans
  un flux isolé.
- **Suppression de la table `ArticleComment`** : migration `00099`, après un cycle de
  déploiement.
- **Mobile (en pause)** : dette du contrat `Thread()` + pagination, à traiter à sa reprise.
- **Tests d'intégration Go** : Docker/testcontainers requis, à exécuter en CI.

---

## L44 — le commentaire retrouve son article dans les feeds (2026-11-24)

**Le trou.** L41 avait fait d'un commentaire un `Post` avec `rootArticleId`, mais
les feeds le cachaient (`rootArticleId IS NULL`) : un commentaire n'existait que
dans son fil. Résultat : un compte suivi qui commente un article n'apparaît
jamais dans « Suivis », et les commentaires de niveau 1 (sans parent) n'étaient
ni dans le feed du profil ni dans l'onglet « réponses ».

**Ce qui change.**

- `FeedPost.rootArticleId` + `FeedPost.rootArticle` (même shape que
  `quotedArticle`, sans passage cité) : le serveur résout l'article une fois par
  page via `posts.RootArticlesFor`, avec le filtre de visibilité des citations
  (un article privé ou bloqué ne devient jamais un contexte).
- `AttachRootArticle` attache le contexte au post **et à sa chaîne de parents** ;
  un contexte déjà résolu n'est jamais écrasé, un article non chargé laisse la
  carte neutre (aucun contenu inventé).
- Surfaces : « Suivis » (`FindFollowingFeed`) et feed de profil
  (`FindPostsByAuthor`) incluent désormais les commentaires.
  « Tendance »/découverte restent fermés : `eligibility.Decide` les juge
  `out_of_surface`, le prédicat SQL dit exactement la même chose.
- `Thread()` porte aussi le contexte (post cible, ancêtres, réponses paginées).
- Web : `ThoughtCard` affiche une pastille « Commentaire sur _titre_ » qui ouvre
  le lecteur ; `vector-feed` transporte `rootArticleId`/`rootArticle`. Aucune
  règle recalculée côté client — le serveur a déjà résolu l'article.
- SDK : `mapFeedPostToThreadThought` expose `rootArticleId`/`rootArticle`.

**Preuves.** `TestRootArticleIDs_DeduplicatesAndSkipsMissing`,
`TestAttachRootArticle_WalksParentChainAndKeepsExisting`,
`TestAttachRootArticle_LeavesUnresolvedArticleNil` (posts, sans base) ;
`feedRootArticle.test.ts` (SDK : transport + absence) ; `go build/vet`,
`go test` posts/feed/articles/eligibility, `guard:sqlc` 40 fichiers,
sdk 35 fichiers / 235 tests, core 69 fichiers / 425 tests, `tsc` sdk+core+ui,
eslint 0.

**Reste hors de ce lot, et pourquoi.**

- `Interaction` (like/repost génériques) : décision produit (un like de
  commentaire doit-il compter dans le post parent ?), à trancher avant migration.
- Migration `00099` (drop `ArticleComment`) : ne peut partir qu'après un cycle de
  déploiement de L41 — sinon le code encore en prod lit une table supprimée.
- Tests SQL réels (`ListEligibilityCandidates`, feeds) : Docker/Postgres requis ;
  la CI les exécute, pas la machine locale.

---

## L45 — Interaction unifiée, tombstones identiques (2026-11-24)

**Interaction.** Migration `00099_interaction_ledger.sql` crée le registre
`Interaction` (`userId`, `kind` LIKE|REPOST, `targetType` POST|ARTICLE,
`targetId`), index unique `(userId, kind, targetType, targetId)` et deux
backfills : likes depuis `"Like"` (ids conservés) et reposts purs depuis les
posts `repostId` sans contenu. Les likes et la liste des acteurs lisent
désormais ce registre (`GetExistingLike`, `InsertLike`, `DeleteLike`,
`ListLikesForPost`, `ListRepostsForPost`) ; les compteurs `Post.likeCount` /
`repostCount` restent des caches entretenus dans la même transaction, donc les
feeds ne changent pas de chiffres. `ToggleRepost` écrit et supprime l'arête
REPOST en même temps que le post-repost.

**Règle de rollup, unique et réversible** (`posts.RollupRule = RollupNone`,
figée par `TestInteractionRollup_IsExplicitlyNone`) : une réaction est
enregistrée sur sa cible réelle (post **ou commentaire**) et n'incrémente
jamais le post racine ni l'article. Inverser ce choix = changer la constante et
la lecture (SUM par cible) — **aucun backfill, aucune perte**, la donnée par
cible est déjà là. Test : `TestInteractionTarget_IsTheRealTarget`.

**UI** : un commentaire du lecteur a maintenant son bouton de like
(`ArticleComments`, import paresseux de l'action SDK) ; l'échec serveur annule
l'optimisme.

**Tombstones : une seule forme.** `Thread()` construit ses réponses depuis la
même page que `/replies` (`threadReplyFor`) : un tombstone garde sa place, avec
`tombstone/tombstoneReason/why`, contenu vide et auteur absent. Tests :
`TestThreadReplyFor_TombstoneKeepsPlaceWithoutContent`,
`TestThreadReplyFor_LivingReplyIsHydrated`, `feedRootArticle.test.ts` (SDK).
`ThoughtCard` (UI partagée) rend ce tombstone, le mobile le reçoit par le SDK
sans UI dédiée.

**Preuves** : `go build`, `go vet`, `go test` feed/posts/eligibility/articles,
`guard:sqlc` 41 fichiers, SDK 35 f. / 237 tests, core 69 f. / 425 tests, `tsc`
sdk+core+ui, eslint 0.

**`ArticleComment` — étape de déploiement ordonnée, pas un TODO.**
Le DROP n'est pas encore possible : trois lecteurs subsistent, nommés —
`sql/queries/notification_center.sql` (LEFT JOIN sur `c.id = n."commentId"`),
`internal/modules/analytics/service.go:1420` (COUNT des commentaires),
`internal/seed/top.go:767` (TRUNCATE de seed). Aucun writer : `comments.sql`
écrit dans `Post` (`InsertArticleCommentRoot/Reply`), et
`DeleteArticleComment`/`GetArticleCommentAuthor` lisent `Post`. Séquence :
(1) repointier la jointure notification sur `Post` ; (2) compter les
commentaires par `Post."rootArticleId" IS NOT NULL` ; (3) retirer la table du
seed ; (4) migration `00100` `DROP TABLE "ArticleComment"` + retrait du schéma
sqlc, **après** confirmation que le déploiement de L41 est terminé (pendant un
rolling deploy, d'anciens pods lisent encore la table).

### L45b — ARTICLE n'est plus une valeur morte (2026-11-24)

`Interaction.targetType = ARTICLE` est désormais **écrit** : `toggleArticleLike`
ne touche plus `ContentFeedback`, il insère/supprime une ligne `Interaction`
(`kind='LIKE'`, `targetType='ARTICLE'`) dans une transaction, avec la même
idempotence portée par l'index unique. Le repost d'article écrit aussi l'arête
`REPOST/ARTICLE` à côté du post de contenu. La définition de la cible vit dans
une seule fonction (`posts.ArticleReactionTarget`), donc un seul chemin
d'écriture.

Lectures alignées : les quatre `LEFT JOIN "Like"` des feeds sont devenus des
jointures sur `Interaction` (`liked`), et les widgets d'affinité comptent les
likes depuis `Interaction` (POST et ARTICLE) au lieu de `Like`/`ContentFeedback`.
Les seeds écrivent des `Interaction`.

Autorisation : `ToggleLike` ne réécrit plus aucune règle de visibilité ;
`ensureReactionEligible` charge les faits (`GetReactionFacts`) puis appelle
`eligibility.Decide(SurfaceThread, …)` — suppression, brouillon, modération,
visibilité followers, suspension et blocage sont décidés par le même moteur que
les feeds. Un contenu non éligible renvoie `ErrBlockedContent` /
`errReactionTargetMissing` (bascule article), jamais une seconde politique.

Preuves ajoutées : `TestArticleReactionTarget_UsesTheInteractionLedger` et
`TestNoReactionWriteOutsideInteraction` (grep exécuté : plus d'`INSERT`/`DELETE`
sur `"Like"` ni `"ContentFeedback"` dans les requêtes, plus de `JOIN "Like"`
dans les feeds, plus de `ContentFeedback` dans le service).
`ExpectedMigrationVersion` passe à 99.

### L45c — les tests DB tournent vraiment (2026-11-24)

Postgres 16 natif (Homebrew) + pgvector compilé pour ce cluster, base `qoe_test`
sur `127.0.0.1:55432`, injectée par `TEST_DATABASE_URL` (le harnais
`testutil` l'accepte dès que le nom finit par `_test`). Aucun Docker.

Deux vrais défauts trouvés en exécutant :

1. **`00097_content_graph.sql` ne se rejouait pas** : le bloc `DO $$ … $$`
   n'était pas encadré par `-- +goose StatementBegin/End`, goose le coupait et
   la migration échouait (`unterminated dollar-quoted string`) — donc, en mode
   base partagée, _toutes_ les suites DB étaient silencieusement sautées.
   Encadré ; les migrations montent maintenant jusqu'à 99.
2. **Unlike d'article** : le chemin article appelait
   `deleteEngagementNotification` (indexée par `thoughtId`, donc vide pour un
   article) et renvoyait `no rows in result set`. Il utilise désormais
   `deleteArticleEngagementNotification`.

Corrections d'alignement : le compteur de commentaires d'analytics lit
`Post."rootArticleId"` (plus `ArticleComment`), le test de visibilité des likes
compte `Interaction`, et les seeds n'écrivent plus `"Like"`.

Tests DB exécutés et verts (`TEST_DATABASE_URL=… go test ./internal/modules/articles -run TestReactionDB -v`) :
`TestReactionDB_ArticleLikeLivesInInteraction` (like d'article → une ligne
`LIKE/ARTICLE`, unlike, re-like),
`TestReactionDB_DoubleLikeIsIdempotent` (deux toggles concurrents → une ligne,
compteur dans [0,1]),
`TestReactionDB_UnikeRelyAndSoftDeleteKeepCountersHonest` (compteur 1→0→refus
sur supprimé→restauration→1, sans négatif),
`TestReactionDB_FeedLikedFlagMatchesLedger` (le flag `liked` du feed suit le
registre), `TestReactionDB_InvisibleTargetIsRefusedByEligibility` (post
followers non suivi → refus, zéro ligne écrite).

Défaut latent révélé, hors périmètre réaction : `TestAppeal_FullCycle`
échoue dès que les migrations s'appliquent réellement — un recours conteste le
dernier verdict non-allow (ici la fixture humaine `test:fixture`) au lieu du
verdict d'essaim, donc les raisons continues attendues manquent. Question
produit à trancher : un recours conteste-t-il le verdict **automatique** le
plus récent ou n'importe quel verdict humain ? Le test encode « essaim ».

## L46 — ordre total du listing des messages (2026-11-24)

Défaut de production : `Message."createdAt"` est un `TIMESTAMP(3)`. Deux
messages écrits dans la même milliseconde n'avaient aucun départage ; le
listing (et la pagination qui s'appuyait sur `createdAt`) pouvait changer
d'ordre, dupliquer ou perdre un message entre deux pages. `TestSendAndListMessages`
échouait réellement sur Postgres local dès que les migrations s'appliquaient.

Correctif : `Message.seq BIGSERIAL` (migration `00101`, `00100` reste réservée
au DROP `ArticleComment`), unique et monotone à l'insertion.

- `ListMessagesBefore` : `seq < curseur`, `ORDER BY seq DESC` ;
- `ListMessagesAfter` (polling) : `seq > curseur`, `ORDER BY seq ASC` ;
- `MessagePage.nextCursor` = `seq` du plus ancien message de la page ;
- `GET …/messages?cursor=<seq>` remplace le curseur temporel côté SDK ;
  `before=<RFC3339>` reste accepté et est traduit en `seq` via
  `CursorSeqBeforeTimestamp` (pas de doublon pour les anciens clients).

Preuves exécutées sur Postgres 16 local (`TEST_DATABASE_URL`, aucun skip) :
`TestSendAndListMessages` inchangé, vert ; nouveau
`TestListMessagesSameMillisecondTotalOrder` : cinq messages alignés sur la même
milliseconde, dix lectures consécutives strictement identiques, pagination
2 par 2 par curseur total parcourant les cinq messages dans l'ordre de la
lecture complète, sans doublon ni trou. Package `conversations` exécuté
intégralement trois fois de suite : trois `ok`.

## L46b — ordre total des verdicts de revue (2026-11-24)

`RiskDecision."createdAt"` est un `TIMESTAMP(3)` : à la milliseconde près, la
revue n'avait pas d'ordre total. `00102` ajoute `RiskDecision.seq BIGSERIAL`
(unique, index `(subjectType, subjectId, seq DESC)`), utilisé **uniquement**
comme tie-breaker déterministe par `ListOpenDecisions` et `ResolveDecision`.
La boucle de vidage de file de la revue converge (elle s'arrête quand la file
est stable) ; `TestReview_OpenResolveClose` PASS sur Postgres 16 local.

Le recours (`contestableDecision`) reste volontairement hors de ce changement :
il garde son ordre d'origine et **la question produit reste ouverte** — un
recours conteste-t-il le dernier verdict automatique d'essaim, ou n'importe
quel verdict humain ? `TestAppeal_FullCycle` reste rouge, non modifié, non
skippé, et documenté comme bloqué sur cet arbitrage (seul point en attente).
