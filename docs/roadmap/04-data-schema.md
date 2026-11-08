# 04 — Données & schéma

## DATA-01 — Double source de vérité du schéma (P1)

**Constat** : `apps/api/sql/schema/schema.sql` (2 881 lignes, 106 tables) est
maintenu à la main **en parallèle** des 74 migrations goose.

**Risque** : le fichier dérive silencieusement. Un nouveau dev qui lit
`schema.sql` voit un schéma faux.

**Approche** :

- générer `schema.sql` depuis une base migrée (`pg_dump --schema-only`) en CI ;
- échouer si le fichier généré diffère du fichier commité ;
- ou supprimer `schema.sql` et documenter que les migrations sont la seule
  source.

## DATA-02 — Modélisation JSON (P2)

Le commit `aafb6a06` « caste les emailSettings en text pour PgBouncer » indique
une colonne JSON stockée en `text`. C'est un contournement : on perd le typage,
les contraintes et la capacité d'indexation.

**Approche** : `JSONB` + validation applicative, ou table dédiée
(`UserEmailSetting(userId, kind, enabled)`). Vérifier aussi les autres colonnes
`text` qui contiennent du JSON (`quotedAnnotation` est déjà en JSONB — bon
signal).

## DATA-03 — Partitionnement (P1)

Tables à croissance linéaire avec le trafic :
`ReadingSession`, `FeedImpression`, `ArticleEvent`, `ArticleAttribution`,
`Notification`, `NotificationDelivery`, `WebhookDelivery`, `StaffCampaignDelivery`,
`AdminAuditLog`, `legal_notice_delivery`, `SubscriberImportEvent`.

**Approche** : partition par mois (`PARTITION BY RANGE (createdAt)`) sur les
3–4 plus grosses, avec une tâche de création de partition à J+2 et une purge
des partitions au-delà de la rétention (le lot D2 a déjà la purge logique).
À faire **avant** que les tables dépassent quelques millions de lignes : la
migration est bien plus simple à froid.

## DATA-04 — Mesurer avant d'optimiser (P1)

Activer `pg_stat_statements`, collecter les 20 requêtes les plus coûteuses, et
faire un `EXPLAIN (ANALYZE, BUFFERS)` de référence sur :

- feed public et personnalisé (`personalized.go` fait plusieurs requêtes ANN +
  rerank en Go) ;
- home widgets ;
- recherche sémantique (`<=>` sur `Article`, `User`, `Post`) ;
- analytics créateur.

Sans ces mesures, RUN-01 et RUN-03 sont des hypothèses. Documenter les plans
dans ce fichier avec la date et la taille des tables.

## DATA-05 — Recherche (P2)

Meilisearch n'indexe que `articles` (`internal/workers/search.go`,
`searchIndex = "articles"`). Les pensées sont cherchées en SQL, et il n'y a pas
d'index `people` ni `topics`.

**Approche** : un index par entité (`articles`, `posts`, `users`), avec les
mêmes garanties de zéro-fuite sur le contenu premium
(`redactPremiumHitContents`). Réutiliser le worker `search:sync`.

## Index à vérifier

- `Post(parentId)`, `Post(rootId)` pour les threads ;
- `Follows(followerId, followingId)` + `(followingId)` ;
- `Notification(userId, createdAt DESC, readAt)` ;
- `ReadingSession(userId, createdAt)` et `(articleId, createdAt)` ;
- `FeedImpression(userId, createdAt)` ;
- index partiels `WHERE "deletedAt" IS NULL` sur les tables à soft delete.

## Rétention

Le lot D2 a posé les politiques et la purge. Vérifier que chaque politique a
un test qui prouve qu'une ligne ancienne est bien supprimée, et que la purge
est idempotente (pas de double suppression, pas de blocage de table).
