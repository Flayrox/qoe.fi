# 02 — Runtime & scalabilité

## RUN-01 — Pagination keyset (P0)

**Constat** : `apps/api/sql/queries/feed.sql` utilise `LIMIT @take_count OFFSET
@skip_count`, et `feed.ParseCursor` convertit le curseur en **offset** entier.

**Pourquoi ça casse** : à mesure que le feed s'allonge, `OFFSET` scanne et
jette N lignes ; les résultats sautent ou se dupliquent quand du contenu est
publié entre deux pages.

**Approche** :
- curseur opaque = `base64(created_at|id)` (ou `score|id` pour le feed trié) ;
- `WHERE (created_at, id) < ($1, $2) ORDER BY created_at DESC, id DESC LIMIT n` ;
- index composites correspondants (`(publicationId, createdAt, id)`,
  `(authorId, createdAt, id)`).

S'applique à : feed public, feed personnalisé, articles, pensées, notifications,
historique, recherche paginée.

## RUN-02 — Invalidation de cache Redis (P1)

**Constat** : `apps/api/internal/cache/cache.go` → `InvalidateNamespace` fait
`SCAN prefix*` puis `DEL`. O(N) sur tout le keyspace, bloquant, et coûteux si
appelé à chaque publication.

**Approche** : version de namespace.
```
GET  ns:feed:version        -> 42
SET  feed:v42:...           (TTL)
INCR ns:feed:version        (invalidation O(1))
```
Les anciennes clés expirent seules. Ajouter un `singleflight` par clé pour
éviter que N requêtes reconstruisent le même cache froid.

## RUN-03 — Connexions Postgres (P1)

**Constat** : `apps/api/internal/dbpool/dbpool.go` fixe `MaxConns` (défaut 20
par process), `MinConns = 2`. `QueryExecModeExec` + `StatementCacheCapacity = 0`
pour compatibilité PgBouncer.

**Risque** : avec N réplicas API + M workers, on ouvre N×20 + M×20 connexions.
Postgres sature bien avant le CPU.

**Approche** :
- budget documenté : `(max_connections - réserve) / nb_processus` ;
- `DB_POOL_SIZE` par service (API vs worker) ;
- PgBouncer en mode transaction devant l'API ;
- monitorer `pg_stat_activity` et la latence d'acquisition du pool.

## RUN-04 — Observabilité Go (P1)

**Constat** : 0 usage de `log/slog`, aucun Sentry côté Go, logs en `log.Printf`
non structurés. Le middleware `Logger` existe mais écrit du texte.

**Approche minimale** :
1. `slog` JSON avec `request_id`, `route`, `status`, `duration_ms`, `user_id`
   (haché), `trace_id`.
2. Middleware qui propage `X-Request-ID` (généré si absent) et le renvoie.
3. Sentry (ou OTLP) sur les panics et les 5xx.
4. Métriques : latence p95 par route, taux d'erreur, saturation du pool,
   profondeur de la queue asynq, taille des files d'email.

Sans ça, un incident en prod se diagnostique au `grep` sur des logs non
corrélés.

## RUN-05 — Readiness (P0)

**Constat** : `/healthz` et `/health` renvoient `{"status":"ok"}` sans toucher
la DB, Redis ou la queue.

**Risque** : un conteneur démarré mais incapable de servir reçoit du trafic.

**Approche** : garder `/healthz` = liveness (process vivant) et ajouter
`/readyz` = `Ping` DB (timeout 2 s) + `Ping` Redis + (optionnel) ping queue.
Caddy / le déploiement n'envoie du trafic qu'après `readyz`.

## RUN-06 — Email hors du chemin de requête (P2)

**Constat** : `main.go` branche `articlesSvc.SetEmailSender(...)` directement
sur le service HTTP. Un SMTP lent allonge la réponse.

**Approche** : publier une tâche asynq (`email:send`) et répondre immédiatement.
Le worker `email_delivery.go` existe déjà.

## RUN-07 — Dérive documentation / code (P2)

`main.go` commente « 120 req/min par IP » mais le code applique 600. Le
`README` d'OpenAPI référence `packages/api-client` et `docs/API_COMPLETE.md`,
qui n'existent plus.

**Règle** : toute valeur chiffrée dans un commentaire doit être soit une
constante nommée, soit supprimée. Les docs mortes sont pires que pas de docs.

## Autres points à surveiller

- **Rate limiting** : Redis par IP derrière Caddy → vérifier que `X-Forwarded-For`
  est bien traité (`middleware.RealIP` est en place, mais Caddy doit poser
  l'en-tête).
- **CORS** : liste en dur, `https://*.qoe.fi` — vérifier que chi CORS gère
  réellement le wildcard de sous-domaine.
- **Timeouts** : `ReadHeaderTimeout` présent, mais pas de `ReadTimeout` /
  `WriteTimeout` / `IdleTimeout` sur `http.Server`.
