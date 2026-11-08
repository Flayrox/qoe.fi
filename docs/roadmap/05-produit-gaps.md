# 05 — Produit : ce qui manque pour un « vrai » réseau social

> Analyse au 2026-11-07, basée sur les routes API, les pages des apps, les 106
> tables et les workers. Objectif : distinguer ce qui est **déjà là** de ce qui
> manque vraiment, et ce qui manque mais ne doit **pas** être fait.

## Inventaire : ce qui existe déjà (et qui est solide)

| Domaine                                     | État                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------ |
| Comptes, profils, réglages, confidentialité | ✅ User, UserSettings, SocialLink, consentement versionné                            |
| Publications multi-tenant + domaines        | ✅ Publication, sous-domaines, `apps/tenants`                                        |
| Articles, éditeur, catégories, co-auteurs   | ✅ complet + collaboration Yjs                                                       |
| Pensées (posts), threads, réponses          | ✅ Post, parentId/rootId, restrictions de réponse                                    |
| Likes, bookmarks, reposts, citations        | ✅ Like, Bookmark, Post.repostId, quotedArticle                                      |
| Follows, block, mute (users + mots)         | ✅ Follows, BlockedUser, MutedUser, MutedWord + comptes privés et demandes de follow |
| DM                                          | ✅ Conversation, ConversationMember, Message                                         |
| Notifications in-app + email                | ✅ Notification, NotificationDelivery, préférences                                   |
| Sondages                                    | ✅ Poll, PollOption, PollVote                                                        |
| Recherche articles + sémantique             | ✅ Meilisearch + pgvector                                                            |
| Feed personnalisé                           | ✅ two-tower, MMR, CF, circadien, cold start                                         |
| Modération / anti-abus / recours            | ✅ très complet (reports, incidents, budgets, appeals)                               |
| Monétisation créateur                       | ✅ Tier, Stripe, WalletTransaction, grants                                           |
| Console admin / RBAC / audit                | ✅ très complet                                                                      |
| API publique + webhooks + OAuth IdP         | ✅ différenciant fort                                                                |
| Newsletter, abonnés, imports                | ✅ complet                                                                           |
| Ebooks, highlights, annotations             | ✅                                                                                   |
| Mobile (Expo)                               | ✅ 27 écrans                                                                         |
| i18n FR/EN                                  | ✅ Lingui                                                                            |

**Conclusion** : le socle est déjà celui d'un réseau social complet. Il ne
manque pas « la moitié » : il manque surtout les **boucles de rétention** et
les **surfaces de découverte**.

## PROD-12 — Comptes privés et blocage symétrique (✅ fait 2026-11-07)

**Constat initial** : `profileVisibility` (`PUBLIC` / `FOLLOWERS` / `PRIVATE`)
était stocké dans `UserSettings` mais appliqué nulle part, et le blocage
n'était vérifié que dans un sens selon les surfaces.

**Implémenté** :

- table `FollowRequest` (PENDING / ACCEPTED / REJECTED / CANCELLED, index
  unique partiel sur les demandes en attente) ;
- `POST /v1/users/{id}/follow` : follow instantané si PUBLIC/FOLLOWERS,
  demande si PRIVATE, annulation au second clic ;
- `GET /v1/me/follow-requests`, `POST /v1/me/follow-requests/{id}/accept`,
  `POST /v1/me/follow-requests/{id}/reject` (propriétaire personnel ou
  owner/admin d'un média) ;
- profil public : `profileVisibility`, `isPrivate`, `canViewContent`,
  `followRequested` ; listes d'abonnés et contenu masqués aux non-abonnés ;
- gating du feed (trending + personnalisé), de la recherche (pensées SQL et
  articles Meilisearch), des articles par slug et des fils directs ;
- blocage symétrique (viewer → auteur **et** auteur → viewer) dans le profil,
  les feeds, la recherche, les articles et les fils ; les follows et demandes
  en attente sont supprimés au blocage ;
- UI : bouton « Demandé », badge « Compte privé », panneau verrouillé, boîte
  de réception des demandes dans Réglages → Confidentialité.

## PROD-13 — Fermeture des surfaces de visibilité (✅ fait 2026-11-07)

**Constat** : après PROD-12, plusieurs surfaces contournaient encore le
blocage ou la visibilité privée, et `POST /v1/feed/hydrate` acceptait
n'importe quel ID d'article sans vérifier `published`.

**Implémenté** :

- notifications : les expéditeurs bloqués (dans un sens ou dans l'autre) sont
  exclus de la liste et du compteur non-lu ; une demande de follow n'est plus
  fusionnée avec un follow accepté ni avec la demande d'une autre personne ;
- centre de notifications : une demande porte `metadata.requestId` et
  s'accepte/se refuse directement depuis la carte, avec rafraîchissement de la
  liste et du badge ; migration `00076` de backfill pour les demandes déjà
  en attente ;
- hydratation : `HydrateArticles` exige un article publié et programmé passé,
  applique le blocage symétrique, la visibilité privée (propriétaire,
  co-auteur, abonné) et tronque toujours le paywall ; `GetPostsByIDs` exclut
  brouillons, posts programmés, auteurs privés et bloqués ;
- home : Explorer/Recommandé/à la une excluent les profils non `PUBLIC` et les
  auteurs bloqués avant la limite SQL ;
- commentaires d'article : liste filtrée par blocage/privé, création refusée
  si l'un des deux comptes a bloqué l'autre (auteur de l'article ou du
  commentaire parent) ;
- sitemaps articles/pensées : les profils non `PUBLIC` sont retirés du
  catalogue et du total ;
- recherche de personnes : les comptes bloqués dans les deux sens sont exclus ;
- blocage depuis les réglages : même nettoyage des follows, demandes et
  notifications que le blocage depuis une pensée.

**Tests** : `private_account_test` (requestId de notification),
`notifications/service_test` (séparation des kinds), `feed/visibility_test`
(brouillon/privé/abonné/bloqué), `articles/comments_block_test`.

## PROD-14 — Citations, annotations et interactions bloquées (✅ fait 2026-11-07)

**Constat** : les pensées pouvaient encore citer un article privé/bloqué ou
l'annotation publique d'un compte bloqué, et les likes/reposts/mentions vers un
compte bloqué n'étaient pas gardés.

**Implémenté** :

- `GetQuotedArticlesByIDs` filtre le propriétaire de publication (privé,
  abonnés, blocage symétrique) ; `QuotedArticlesFor` reçoit le viewer et écarte
  aussi les snapshots d'annotation dont l'auteur est bloqué ;
- `buildFeedPost` ne sérialise `quotedExcerpt` / `quotedAnnotation` que si
  l'article cité est résolu pour le viewer (zéro fuite par repli) ;
- highlights/annotations : listing, commentaires, upvote et création passent
  par `CanViewArticle` + blocage symétrique ; annotation privée ou compte
  bloqué = 404 indistinguable ;
- likes/reposts : ajout refusé si l'un des deux comptes a bloqué l'autre
  (retrait toujours possible) ; réponse refusée vers un parent bloqué ;
- notifications LIKE/REPOST/REPLY/MENTION : plus aucune notification créée
  entre comptes bloqués ;
- feed : une réponse dont le parent est bloqué/supprimé est retirée des flux ;
  sur un profil, la slice porte `parentUnavailable` /
  `parentUnavailableReason` ; le thread le porte aussi sur le `FeedPost`
  cible et sur chaque réponse dont le parent manque, y compris imbriquée. Le
  mapper SDK web (`mapFeedPostToThreadThought`) recopie ces champs — sans quoi
  le bandeau du fil ne s'affichait jamais — et coupe tout parent résiduel. Le
  reconstructeur d'arbre ne promeut plus un orphelin à la racine sans le
  marquer ; le bandeau est rendu au niveau de la réponse et des ancêtres. L'UI
  affiche « Réponse à un compte bloqué » / « Réponse à un contenu
  indisponible » sans révéler le contenu.

**Tests** : `posts/block_test.go`, cas bloqués dans `posts/quotes_test.go`,
`highlights/integration_test.go`, `feed/assembly_visibility_test.go`
(slice/target + JSON sans parent), `feed/thread_visibility_test.go` (matrice
bloqué dans les deux sens, supprimé/modéré, parent normal, multi-niveaux),
`profile-hidden-parent.test.tsx`, `thought-thread-hidden-parent.test.tsx` et
`thought-thread-nested-hidden-parent.test.tsx` (vrais `ProfileView` et
`ThoughtThreadRoot`, arbre imbriqué, états bloqué/indisponible, zéro fuite).

## PROD-01 — Notifications push réelles (P0)

**Constat** : `NotificationPreference` contient `pushLikes`, `pushReplies`,
`pushMentions`, `pushFollows`, `pushReposts`, `pushMedia`… mais :

- aucune table `PushToken` / `DeviceToken` ;
- aucun `expo-notifications`, FCM ou APNs dans le repo ;
- aucun worker d'envoi push.

**Conséquence** : l'interface promet des réglages push qui ne produisent rien.
C'est le gap le plus visible pour un utilisateur mobile.

**Approche** :

1. table `DeviceToken(userId, platform, token, lastSeenAt, revokedAt)` ;
2. enregistrement au login mobile + rafraîchissement ;
3. worker `push:send` (asynq) déclenché par les mêmes événements que l'email ;
4. respect des préférences + désinscription à la révocation ;
5. test : token invalide → désactivé, pas de retry infini.

## PROD-02 — Temps réel lecteur (P1)

**Constat** : `apps/collab-server` fait du WebSocket, mais uniquement pour Yjs
(édition collaborative). Aucun SSE/WS pour les notifications, les DM ou le
badge « nouveaux posts ».

**Conséquence** : il faut rafraîchir la page pour voir une notif ou un message.

**Approche** : commencer par du SSE sur `/v1/events/stream` (plus simple que
WS derrière Caddy), avec Redis pub/sub. Réutiliser les événements déjà émis
dans l'outbox. Le mobile peut utiliser un polling adaptatif en attendant.

## PROD-03 — Onboarding (P0)

**Constat** : `apps/core/src/app/(reader)/onboarding/page.tsx` = **67 lignes**,
`apps/studio/src/app/onboarding/page.tsx` = 66 lignes.

**Conséquence** : un nouvel inscrit arrive dans un feed vide ou générique, sans
suivre personne. C'est la première cause de churn sur un réseau social.

**Approche** (le minimum qui change tout) :

1. choix de 3–5 centres d'intérêt (catégories existantes) ;
2. suggestion de 5–10 créateurs (l'endpoint `suggested-creators` existe déjà,
   avec similarité vectorielle) ;
3. follow en un tap ;
4. complétion de profil (avatar, bio) ;
5. premier feed pré-chauffé avec ces signaux.

Mesurer : % d'inscrits qui suivent ≥ 3 comptes et publient/lisent dans les 24 h.

## PROD-04 — Hashtags / sujets navigables (P1)

**Constat** : le composer propose un typeahead `#hashtags` et `Post.tags` est
un `TEXT[]`, mais il n'existe **aucune table** `Tag` / `Topic` / `Hashtag`,
ni page de sujet, ni follow de sujet.

**Conséquence** : les hashtags sont du texte mort. Impossible de découvrir un
sujet, de le suivre ou de le modérer.

**Approche** : table `Topic(slug, label)`, `PostTopic`, page
`/topic/[slug]`, follow de sujet, et indexation Meili. Réutiliser `Category`
si le modèle le permet (sinon rester séparé : catégorie = éditorial, topic =
social).

## PROD-05 — Listes / cercles (P2)

Aucune table `List`, `Circle` ou `CloseFriends`. Sur X/Bluesky, les listes
servent à filtrer son feed et à suivre des comptes sans les suivre
publiquement.

**Approche** : `List(ownerId, name, isPrivate)` + `ListMember`, puis un onglet
de feed filtré. Peut attendre : ce n'est pas ce qui bloque la rétention au
début.

## PROD-06 — Digest email (P1)

**Constat** : aucun worker de digest (recherche `digest|weekly` → rien). Il y a
des notifications unitaires et des newsletters, mais pas de récap.

**Approche** : worker `email:digest` (quotidien/hebdo), agrégation des
notifications non lues + top articles des créateurs suivis, désinscription
one-click (RFC 8058 déjà implémenté pour les newsletters). Attention à la
délivrabilité : suppression list déjà présente (`EmailSuppression`).

## PROD-07 — DM : ce qui manque (P1)

`Message` ne contient que `id`, `conversationId`, `senderId`, `content`,
`createdAt`. Manquent :

- `readAt` (accusés de lecture) ;
- pièces jointes / images ;
- édition / suppression ;
- indicateur de frappe (temps réel) ;
- blocage effectif d'une conversation (vérifier l'application de BlockedUser).

## PROD-08 — Images Open Graph (P1)

Les pages déclarent `openGraph` en metadata, mais il n'existe **aucun**
`opengraph-image.tsx` / `twitter-image.tsx` généré. Un article partagé sur X,
WhatsApp ou LinkedIn n'a donc pas de carte visuelle fiable.

**Approche** : `opengraph-image.tsx` par route (Next 16 `ImageResponse`), avec
titre + auteur + logo Qoefi. Cache long, invalidation à la publication.

## PROD-09 — Universal links (P2)

`apps/mobile/app.json` déclare `scheme: "qoe"` mais pas `associatedDomains`
(iOS) ni `intentFilters` (Android). Un lien `qoe.fi/...` ouvert sur mobile
reste dans le navigateur.

**Approche** : `apple-app-site-association` + `assetlinks.json` servis par
`apps/core` ou Caddy, puis configuration Expo.

## PROD-10 — Recherche multi-entités (P2)

La recherche expose articles + pensées + sémantique. Manquent des onglets
« Personnes » et « Sujets », et un tri par pertinence unifié.

## PROD-11 — Funnel produit & A/B (P2)

Umami + reading sessions donnent de l'analytique d'usage, mais pas de funnel
d'inscription ni d'expérimentation. Les feature flags existent : ils peuvent
porter un moteur d'expériences simple (hash userId → variante).

## Ce qui manque mais qu'il ne faut PAS faire

- **Stories / contenu éphémère** : coût de modération et de stockage élevé,
  aucun alignement avec le positionnement « lecture longue ».
- **Live audio/vidéo** : infrastructure lourde, hors sujet.
- **Algorithme de feed global façon TikTok** : le feed personnalisé actuel est
  déjà sophistiqué ; le problème est le démarrage à froid (PROD-03), pas le
  ranking.
- **Vérification payante** : la certification existe déjà (`isCertified`).

## Séquence recommandée

1. **PROD-01 + PROD-03** (push + onboarding) : ce sont les deux plus gros
   leviers de rétention, et ils sont indépendants.
2. **PROD-08 + PROD-06** (OG + digest) : croissance et retour.
3. **PROD-02 + PROD-07** (temps réel + DM) : perception de « vivant ».
4. **PROD-04** (sujets) : découverte et SEO.
5. Le reste en fonction des retours utilisateurs.
