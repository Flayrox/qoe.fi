# Graphe de contenu & recommandation — plan vivant (L41 → L43)

> **Rôle de ce fichier.** Plan de chantier du modèle unifié « un post, des arêtes, un
> item de feed ». Il porte les décisions produit verrouillées, la correspondance avec
> les standards (AT Protocol, ActivityStreams), le schéma cible, le contrat de lecture,
> les politiques d'éligibilité, la recommandation, et le découpage en lots avec leurs
> preuves. Il se met à jour **dans le même commit** que le code qu'il décrit, comme
> `docs/AUDIT-CHECKLIST.md`.

Dernière mise à jour : **2026-11-24**.

## 1. Décisions verrouillées (produit)

| #   | Décision                                                                                      | Conséquence technique                                                    |
| --- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| D1  | **Un commentaire d'article est un post** (pas un objet à part)                                 | `Post.rootArticleId` ; `ArticleComment` devient legacy puis disparaît    |
| D2  | **Les réponses vont à une profondeur infinie**                                                 | `parentId` + `rootId` récursifs ; lecture par branche, jamais l'arbre entier |
| D3  | **Un commentaire n'entre dans « Pour toi » que s'il est jugé bon**                             | politique d'éligibilité + score, pas d'inclusion par défaut               |
| D4  | **Une réponse d'un compte suivi peut entrer dans « Abonnement »**                               | éligibilité par l'auteur + préférences de réponses (comme Bluesky)        |
| D5  | **On aime et on reposte un commentaire comme un post**                                         | `Like`, repost et compteurs réutilisés tels quels                         |
| D6  | **Un article est repostable et aimable** (arête générique)                                     | table d'interactions `subjectType`/`subjectId`                            |
| D7  | **Réutilisation obligatoire des briques existantes** (modération, notifications, quotas, flags, analytics, observabilité) | aucune troisième voie parallèle ; cf. § 7                     |

Ces lignes sont des décisions **produit**, pas un état d'implémentation : D1, D2, D5 (like
de commentaire via les compteurs existants), D7 sont en place ; D3/D4/D6 (éligibilité par
surface, article repostable) restent L43. L'état livré, lot par lot, est dans le journal en
fin de fichier.

## 2. Correspondance avec les standards

Objectif : **emprunter les sémantiques**, pas implémenter un protocole. Le jour où l'on
fédère, c'est un *mapping*, pas une réécriture.

| Notre modèle                | AT Protocol (Bluesky)                                                        | ActivityStreams (W3C)            |
| --------------------------- | ---------------------------------------------------------------------------- | -------------------------------- |
| `Post`                      | `app.bsky.feed.post`                                                         | `Note` / `Article`               |
| `parentId` + `rootId`       | `reply { root, parent }` (strongRefs)                                        | `inReplyTo`                      |
| Repost (arête)              | `app.bsky.feed.repost { subject }` — **pas** un post                         | `Announce`                       |
| Citation                    | post + `embed.record`                                                        | `Note` avec `inReplyTo`/embed    |
| `FeedItem.reason`           | `feedViewPost.reason { reasonRepost, reasonPin }`                            | `Announce` dans une `Collection` |
| `FeedItem.reply`            | `reply { root, parent, grandparentAuthor }`                                  | `inReplyTo` + `replies`          |
| Fil de discussion            | `getPostThread(depth, parentHeight)` — 1-D + refs parent/enfant              | `replies` (`Collection`)         |
| Commentaires fermés         | `app.bsky.feed.threadgate`                                                   | `replies` absent / `Announce` off |
| Étiquettes / modération     | `com.atproto.label` (labelers)                                               | `Flag`, `Block`                  |

Non-objectifs : DID/CID, PDS, synchronisation de dépôt, feed generators en services
séparés. On garde **un** service et des **surfaces** nommées.

## 3. Modèle cible

### 3.1 Nœuds — `Post` est la seule chose qu'on « dit »

| Colonne             | Rôle dans le graphe                                                       |
| ------------------- | ------------------------------------------------------------------------- |
| `id`                | identité stable (les ids des commentaires migrés sont **conservés**)      |
| `parentId`          | réponse directe (n'importe quel post, profondeur libre)                   |
| `rootId`            | racine du fil **post** (`NULL` si le post est lui-même une racine)        |
| `rootArticleId`     | **nouveau** — article dont ce post est un commentaire (n'importe quel niveau) |
| `repostId`          | **legacy** — repost déguisé en post, migré vers l'arête (§ 3.2)           |
| `quotedArticleId`   | citation d'article (contenu propre + carte article)                       |
| `quotedExcerpt`/`quotedAnnotation` | extrait et annotation de citation                            |

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
   + index partiel `(rootArticleId, createdAt) WHERE rootArticleId IS NOT NULL`.
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

> État réel au 2026-11-24 : aucune structure `FeedItem` n'existe dans le code. Les fils
> rendent `posts.ReplyItem` (`id`, `parentId`, `rootId`, `createdAt`, `updatedAt`,
> `content`, `tombstone`, `replyCount`, `likeCount`, `repostCount`, `author` nullable) ou,
> pour le feed et le profil, `posts.FeedSlice`. Le contrat ci-dessous décrit la cible de
> L43.

```ts
interface FeedItem {
  post: PostView;                    // contenu principal
  reply?: {                          // contexte de discussion
    root: PostView | null;           // racine du fil (null si article)
    article?: ArticleBrief;          // racine article (commentaire d'article)
    parent: PostView | null;         // parent direct
    grandparentAuthor?: AuthorBrief; // « en réponse à » lisible
  };
  reason?: { type: 'repost' | 'pin' | 'article_repost'; by: AuthorBrief; at: string };
  why?: string;                      // explanation de recommandation (L43)
}
```

| Cas                              | Item                                                                 |
| -------------------------------- | -------------------------------------------------------------------- |
| Pensée racine                    | `post` seul                                                          |
| Réponse profonde (niv. n)        | `post` + `reply{root,parent,grandparentAuthor}` — racine repliée      |
| Commentaire d'article (niv. 1)   | `post` + `reply{article}` — carte article                             |
| Réponse à un commentaire         | `post` + `reply{root=commentaire, article, parent}`                   |
| Repost d'une pensée              | post d'origine + `reason{repost, by}` (jamais un post-repost)         |
| Repost d'un commentaire          | commentaire d'origine + `reason{repost}` + contexte article conservé  |
| Repost d'un article              | `reason{article_repost}` + carte article (pas de post)                |
| Citation d'article               | `post` (contenu) + carte article intégrée                             |
| Citation de post                 | `post` + carte du cité                                                |
| Like                             | **jamais** un item ; uniquement preuve sociale et signal de score     |

Règles d'affichage : un seul bandeau de raison (dernier reposteur), la racine n'est
jamais dépliée dans le feed (un clic ouvre le fil), et un item de feed ne montre jamais
plus de deux niveaux de contexte.

## 5. Politiques d'éligibilité

| Surface       | Raison d'afficher | Filtres durs                                                                 | Préférences utilisateur                      |
| ------------- | ----------------- | ---------------------------------------------------------------------------- | -------------------------------------------- |
| **Abonnement**| l'**auteur** est suivi | blocks/mutes/mots masqués, visibilité, commentaires ouverts si article | afficher les réponses ; seulement les réponses à des comptes suivis ; fil ≥ N réponses |
| **Pour toi**  | le **contenu** est bon | idem + profondeur ≤ 1 pour un commentaire, article commentable, pas de réponse à un compte bloqué, pas de doublon de fil dans la page | —                                            |
| **Profil / Réponses** | l'auteur a écrit | visibilité du profil, blocks, suppression | —                                            |
| **Fil**       | structure         | gates de commentaires de l'article, profondeur demandée, curseur             | tri (chronologique / populaire)              |

Un commentaire d'article n'est **jamais** éligible à « Pour toi » aujourd'hui : le garde
réel est le prédicat SQL `p."rootArticleId" IS NULL`, présent dans `FindFollowingFeed`,
`FindTrending` et `FindPostsByAuthor`. Aucun drapeau `comments_in_discover` n'existe ; son
remplacement par une éligibilité par surface est justement le travail de L43.

## 6. Recommandation (L43)

Pipeline en deux étapes, pas de ML avant les logs :

1. **Récupération** — trois sources plafonnées : graphe de suivi, ANN thématique
   (`Post.embedding` + index HNSW existants), candidats par engagement (7 j).
2. **Features** — affinité (distance de suivi, interactions passées), similarité
   thématique, vélocité d'engagement, fraîcheur avec demi-vie **par surface**, diversité
   auteur/fil, atténuation par profondeur, pénalité « déjà vu ».
3. **Score** — somme pondérée transparente, poids en `SystemConfig` (éditables en admin,
   sans redéploiement). Pas de réseau de neurones avant d'avoir une semaine d'expositions.
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

| Brique existante                                        | Usage dans L41–L43                                              |
| ------------------------------------------------------- | --------------------------------------------------------------- |
| `apps/api/internal/moderation` (`CheckSync`, `EnqueueScreen`) | tout commentaire passe par l'entonnoir P4, comme aujourd'hui |
| `secguard.EnforceContentWrite` + `QuotasComments`        | quotas et paliers inchangés pour les commentaires               |
| `internal/notifications.Dispatch` (P3)                   | notification `COMMENT` conservée, `commentId` = id du post      |
| `internal/antispam`                                      | validation de texte inchangée                                   |
| `internal/abuse` + `SecurityEvent`                       | détection de rafales de réponses (L43)                          |
| `internal/modules/posts/assembly.go` + `internal/modules/feed/service.go` | **seuls** assembleurs d'items (`BuildFeedPost`, `FeedSlice`) : les fils réutilisent cette hydratation en L42 |
| `internal/modules/posts` (`AttachmentsFor`, `PollsFor`, `QuotedArticlesFor`) | réutilisés pour les commentaires           |
| `internal/observability/metrics.go`                       | métriques disponibles ; **aucun** compteur `feed_items_total{surface,reason}` n'existe encore (cible L43) |
| `packages/analytics`                                     | impressions et interactions pour l'évaluation hors ligne         |
| `packages/flags` + `SystemConfig`                        | drapeaux de déploiement et poids de score                        |
| `Post.embedding` + index HNSW                            | récupération thématique, aucune infra nouvelle                   |

## 8. Lots, preuves, risques

| Lot  | Contenu | Preuve de sortie |
| ---- | ------- | ---------------- |
| **L41** — graphe de contenu ✅ | colonne `Post.rootArticleId` + index partiel, backfill 225 commentaires (ids conservés), FK `Notification."commentId"` repointée, service `articles/comments.go` branché sur `Post`, compteurs (`fetchCommentsBatch`, `publishers`, `analytics`) sur `parentId IS NULL AND deletedAt IS NULL`, seed adapté. **Non livré** : table `Interaction`, assembleur `FeedItem`, like/repost génériques (cible L43). | dry-run transactionnel 00097 (225 → 225, 0 orphelin, FK OK) ; `pnpm guard:sqlc` (38 fichiers) ; `go build ./...` ; `go test` articles/feed/posts/publishers/analytics/seed |
| **L42** — fils paginés ✅ | une requête `ListThreadPage` à trois portées (`roots`, `children`, `thread`), curseur opaque `(createdAt, id)`, `{ items, nextCursor, hasMore }`, tombstones, `Thread()` = première page (≤ `MaxReplyLimit` = 50) + `repliesCursor`/`repliesTruncated`, UI récursive (core, studio) + onglet profil paginé + surfaces `tenants`, fil de pensée paginé côté web | dry-run transactionnel : pages 3/3/1 sans doublon, insertion concurrente, antidatée non ressuscitée, tombstone + enfants + profondeur 3, deux viewers, compteurs, profil 2/2/2/1 ; `guard:sqlc` 39 fichiers ; `go build`/`go vet`/`go test` posts/articles/feed ; vitest core / studio / tenants + `threadRepliesPagination.test.ts` (6) et `thought-thread-load-more.test.tsx` (2) ; absorbe **R134** et **R314** |
| **L43** — éligibilité + ranking | politiques par surface, features, score pondéré, `why`, logs d'exposition, métriques | tableau de bord + test : un commentaire hors seuil n'apparaît pas ; un compte suivi qui répond apparaît dans Abonnement ; NDCG mesuré sur 7 jours ; `pnpm arch:audit` 0 |

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

| Étape | État | Preuve |
| --- | --- | --- |
| Migration `00097_content_graph.sql` | ✅ | dry-run transactionnel (rollback) : 225 commentaires → 225 posts, contenu identique, 0 orphelin, 0 réponse perdue, FK `Notification` repointée |
| `schema.sql` + `sqlc` | ✅ | `pnpm guard:sqlc` vert (38 fichiers, v1.31.1) |
| `articles/comments.go` sur `Post` | ✅ | `go build ./...`, tests `articles`/`feed`/`posts`/`publishers`/`analytics`/`seed` verts |
| Compteurs d'articles | ✅ | `fetchCommentsBatch`, `publishers`, `analytics` lisent `rootArticleId` |
| Compteur de réponses | ✅ | `IncrementReplyCount` / `DecrementReplyCount` réutilisés (aucune arithmétique locale) |
| Signalements | ✅ | `reportTargetExists("comment")` exige `rootArticleId IS NOT NULL` |
| Seed | ✅ | `world`/`top` écrivent désormais des posts commentaires |
| Surfaces de feed | ⏸️ | `FindFollowingFeed`, `FindTrending`, `FindPostsByAuthor` excluent `rootArticleId IS NOT NULL` : le contexte d'article et le ranking arrivent en L43, l'onglet « réponses » du profil en L42 |

**Décisions prises pendant L41.**

- *Suppression* : `DeleteArticleComment` reste un `DELETE` dur en L41 (comportement
  actuel, cascade des notifications, aucun orphelin). Le tombstone arrive en L42 avec
  l'arbre paginé, quand l'interface saura afficher « message supprimé » sans casser
  un fil.
- *Racine de fil* : `rootId` pointe le commentaire de niveau 1, jamais l'article.
  `rootArticleId` porte le contexte sur toutes les lignes, ce qui rend la liste d'un
  article indexable en une seule lecture.
- *Filtres* : la liste réutilise `is_blocked_bidirectional`, `can_view_profile`,
  `is_muted_by` et `contains_muted_word` — les mêmes helpers que les feeds, donc une
  divergence de visibilité entre le tiroir de lecture et le feed devient impossible.

### Reste à faire au sortir de L41 (historique)

Tout ce qui était listé ici a été livré par L42 (section suivante) : **R134** et **R314**
sont absorbés dans la pagination unique, `ListArticleComments` a disparu au profit de
`ListThreadPage`, et le tombstone a remplacé la suppression dure. Il ne reste de L41 que la
suppression de la table `ArticleComment` (migration `00099`, après un cycle de
déploiement) — reprise dans le reste-à-faire final.

### 2026-11-24 — L42 livré (fils paginés, tombstones, R134 + R314 absorbés)

| Étape | État | Preuve |
| --- | --- | --- |
| Migration `00098_reply_threads.sql` | ✅ | 4 index partiels `(parentId|rootId|rootArticleId|authorId, createdAt, id)` ; dry-run transactionnel (rollback) sur la base de dev |
| `ListThreadPage` (requête unique) | ✅ | `scope=roots|children|thread`, curseur `(createdAt, id)`, tombstones calculés en SQL par les helpers des feeds |
| `GET /v1/articles/{id}/comments` paginé | ✅ | `{ items, nextCursor, hasMore }`, curseur opaque, 400 sur curseur illisible |
| `GET /v1/posts/{id}/replies` | ✅ | `scope=children` (défaut) ou `thread` (tous les descendants par `rootId`) |
| `GET /v1/users/{username}/replies` | ✅ | onglet « Réponses » du profil, ids paginés puis hydratés par le feed |
| `Thread()` sans plafond silencieux | ✅ | `replies` = première page, `repliesCursor` + `repliesTruncated` ; `GetPostThread`, `GetRepliesForThought`, `GetReplyIDsForThought` supprimées |
| Suppression = tombstone | ✅ | `DeleteArticleComment` passe en `UPDATE deletedAt` ; structure et `replyCount` conservés |
| Surfaces | ✅ | `ArticleComments` (arbre récursif, chargement par nœud), studio communauté, onglet profil, surfaces `tenants` adaptées |
| Curseur testé unitairement | ✅ | `posts/replies_test.go` : aller-retour exact, curseur vide = première page, curseur illisible = `ErrInvalidCursor`, bornes `NormalizeReplyLimit` |
| Pagination cliente du fil | ✅ | `repliesCursor`/`repliesTruncated` exposés par le mapping SDK ; `getPostThreadRepliesAction` (`scope=thread`) + `mergeThreadReplies` (rattachement au parent réel, idempotent, orphelin visible et marqué) ; bouton « Charger la suite du fil » dans `ThoughtThreadList` |

**R134 et R314 absorbés, aucun cas séparé.** Il n'existe plus de liste de commentaires
« complète » ni de fil de pensée plafonné : `ListArticleComments`,
`GetRepliesForThought`, `GetReplyIDsForThought` et `GetPostThread` ont été **supprimées**,
et `ListThreadPage` (via `posts.ReplyPageFor`) est la seule lecture de fil, pour les
articles, les pensées et les commentaires.

**Décisions prises pendant L42.**

- *Un seul chemin de lecture* : `posts.ReplyPageFor` sert les trois surfaces ; la politique
  de visibilité est un `LATERAL` unique (`is_blocked_bidirectional`, `can_view_profile`,
  `is_muted_by`, `contains_muted_word`, shadowban/suspension, masquages). Aucune copie.
- *Tombstone universel* : supprimé, masqué (auteur/modération) **ou** invisible pour CE
  viewer → même ligne, même place, contenu et auteur vides. Un blocage ne fait donc plus
  disparaître un nœud (et ses enfants) : il le rend illisible, ce qui préserve la
  structure sans rien révéler. Preuve : deux viewers, même page, l'un lit le contenu,
  l'autre voit un tombstone.
- *Compteurs = vivant* : `replyCount` et les compteurs d'articles comptent les lignes
  `deletedAt IS NULL` (comme les pensées avant L42). Le tombstone occupe une place mais
  n'est pas compté. Les compteurs d'article ne comptent que `parentId IS NULL`, sinon une
  discussion gonflerait le nombre de commentaires de l'article.
- *Curseur illisible = 400*, jamais « première page » : sinon un client cassé
  rejouerait le début du fil en boucle.
- *`Thread()` change de contrat* : il ne promet plus l'arbre complet, il promet une page
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
