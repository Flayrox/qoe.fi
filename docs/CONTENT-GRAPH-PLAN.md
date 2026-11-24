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

1. `parentId` ⇒ le parent existe, n'est pas supprimé, et partage le même `rootArticleId`.
2. `rootId` est soit `NULL` (racine), soit l'id d'un post **non supprimé** du même fil.
3. Un post ne peut pas être à la fois `rootArticleId` et `quotedArticleId`.
4. Un commentaire d'article n'a jamais `isDraft = true` ni `scheduledAt` (il est publié).
5. La profondeur n'est jamais stockée : elle se calcule (`parentId` récursif) et se borne
   à la lecture.

### 3.2 Arêtes — `Interaction`

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
   - `visibility = 'public'`, `contentVisibility = 'PUBLIC'` (les feeds réappliquent
     `can_view_profile`, `is_muted_by`, blocks, mots masqués).
3. `Notification."commentId"` : drop FK → `ArticleComment`, add FK → `Post` (valeurs
   inchangées).
4. `ArticleComment` **gelée** (plus aucun écrivain, plus aucun lecteur), supprimée par
   une migration ultérieure après un cycle de déploiement.

Rollback : `00097_down.sql` supprime la colonne et les index, remet la FK sur
`ArticleComment` et supprime les posts marqués migrés (table de correspondance
temporaire `_migrated_article_comments` créée puis droppée dans la même migration).

## 4. Contrat de lecture — `FeedItem`

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

Un commentaire d'article n'est **jamais** éligible à « Pour toi » tant que le drapeau
`content_graph.comments_in_discover` est faux (migration sans changement de production).

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
| `internal/feed/assembly.go`                              | **seul** assembleur d'items de feed (contexte + raison)          |
| `internal/modules/posts` (`AttachmentsFor`, `PollsFor`, `QuotedArticlesFor`) | réutilisés pour les commentaires           |
| `internal/observability/metrics.go`                       | compteurs `feed_items_total{surface,reason}`, durée de ranking   |
| `packages/analytics`                                     | impressions et interactions pour l'évaluation hors ligne         |
| `packages/flags` + `SystemConfig`                        | drapeaux de déploiement et poids de score                        |
| `Post.embedding` + index HNSW                            | récupération thématique, aucune infra nouvelle                   |

## 8. Lots, preuves, risques

| Lot  | Contenu | Preuve de sortie |
| ---- | ------- | ---------------- |
| **L41** — graphe de contenu | colonne `rootArticleId`, backfill 225 commentaires (ids conservés), FK notification repointée, `Interaction` (like/repost/bookmark génériques), assembleur `FeedItem` étendu, commentaires **exclus** de « Pour toi » par drapeau | `pnpm guard:sqlc` 0 ; `go build ./...` 0 ; `go test ./internal/modules/articles ./internal/feed` verts ; test d'intégration base : 225 posts migrés, 0 orphelin, notification liée, comptes identiques ; `pnpm typecheck` 0 |
| **L42** — fils infinis | lecture par branche (curseur par parent), profondeur demandée, suppression du plafond muet de 500, UI récursive (core, tenants, studio), `{items, nextCursor, total}` | test d'intégration : fil de 120 réponses sur 4 niveaux, pages sans doublon ni perte, `depth=1` sur 5000 réponses < 100 ms ; 3 suites UI vertes ; absorbe **R134** et **R314** |
| **L43** — éligibilité + ranking | politiques par surface, features, score pondéré, `why`, logs d'exposition, métriques | tableau de bord + test : un commentaire hors seuil n'apparaît pas ; un compte suivi qui répond apparaît dans Abonnement ; NDCG mesuré sur 7 jours ; `pnpm arch:audit` 0 |

Risques nommés :

- **Volume** : les commentaires deviennent des posts → les feeds doivent filtrer par
  éligibilité dès L41 (drapeau), sinon explosion du fil Abonnement.
- **Compteurs** : `FindTrending` additionne `likeCount + repostCount + replyCount` ;
  les commentaires gonfleraient les articles. Le score de L43 remplace cette somme.
- **Données** : ids conservés pour les notifications ; table legacy gelée, pas droppée
  avant un cycle de déploiement.
- **Mobile** : n'appelle pas l'endpoint des commentaires aujourd'hui — vérifié le
  2026-11-24 — donc la bascule de contrat ne casse rien en pause.
- **SEO** : un commentaire a désormais une URL de post ; canonical vers l'article,
  permalien en `noindex`.

## 9. Questions encore ouvertes

1. Un commentaire d'article doit-il compter dans l'onglet « Réponses » du profil comme
   une réponse ordinaire ? **Proposition : oui** (c'est un post que l'auteur a écrit).
2. Les réponses à un commentaire apparaissent-elles dans « Abonnement » quand on suit
   l'auteur de la réponse, ou seulement quand on suit l'auteur du commentaire racine ?
   **Proposition :** l'auteur de la réponse suffit, avec préférence « seulement les
   réponses à des comptes suivis » désactivée par défaut.
3. Faut-il un onglet « Commentaires » sur le profil (distinct de « Réponses ») ?
   **Proposition : non au premier lot** ; le filtre `rootArticleId IS NOT NULL` peut le
   produire plus tard sans migration.
