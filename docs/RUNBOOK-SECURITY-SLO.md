# Runbook — sécurité & SLO (API qoe.fi)

**Objet** : ce que fait l'astreinte quand une alerte de `infra/monitoring/alerts.yml`
se déclenche, comment atteindre la base de production, et où vivent les gabarits
d'e-mail d'authentification. Trois trous documentaires de l'audit (R299, R302,
R304) sont fermés ici.

**Ce qui existe** : `GET /metrics` sur l'API Go
(`apps/api/internal/observability/metrics.go`, 6 métriques), Uptime-Kuma pour
l'up/down (`docker-compose.yml`, service `uptime-kuma`), et ce jeu de règles
**prêt à charger** dans un Prometheus externe. Aucun Prometheus n'est versionné
dans ce dépôt : les alertes ne partent que si quelqu'un branche le `rule_files`
décrit en tête de `alerts.yml`.

---

## 1. Les cinq alertes

| Alerte                      | Seuil                                  | Sévérité | Premier geste                                                                                                                                                                                                                         |
| --------------------------- | -------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QoeHigh5xxBurnRate`        | ratio 5xx > **1 %** sur 5 min          | critical | `docker compose logs --tail=200 api` ; identifier le `route_group` qui pèse (requête PromQL `sum by (route_group) (rate(qoe_http_requests_total{status=~"5.."}[5m]))`) ; vérifier la base (`select 1`) et Redis avant de rollback.    |
| `QoeHighP99Latency`         | p99 > **1000 ms** pendant 5 min        | warning  | lire le `route_group` de l'alerte ; vérifier les migrations manquantes (`pnpm db:migrate status`), les requêtes lentes (`pg_stat_activity`) et Meilisearch (`docker compose logs --tail=100 meilisearch`).                            |
| `QoeSecguardSpamSpike`      | > **5 rejets/s** sur (`action`,`code`) | warning  | c'est un signal **produit** : vérifier si un client légitime casse le contrat (`code`), sinon laisser le challenge PoW/Turnstile faire son travail ; ne pas désactiver SecGuard.                                                      |
| `QoeSsrfAttemptBlocked`     | ≥ **1 blocage** NetGuard en 5 min      | critical | chercher l'appelant dans `docker compose logs api \| grep -i netguard` ; une cible interne (`169.254.*`, `10.*`, `127.*`) signifie une entrée utilisateur non validée — remonter la route concernée, ne jamais élargir l'allowlist.   |
| `QoeRateLimitRedisFailOpen` | ≥ **1 décision `fail_open`** en 5 min  | critical | Redis est injoignable ou lent : `docker compose exec redis redis-cli ping`, vérifier `maxmemory`/évictions (`redis-cli info memory`). Le fail-open est volontaire (disponibilité > quota) : on rétablit Redis, on ne coupe pas l'API. |

Après résolution : noter dans le ticket la métrique qui est revenue sous le seuil
et l'heure — une alerte qui se re-déclenche sans action est un défaut de seuil,
pas un incident.

---

## 2. Base de données de production (R304)

Le Postgres de production **n'est pas** un service de `docker-compose.yml` : il
appartient au stack Supabase auto-hébergé, joint par le réseau externe
`supabase_default` (voir le service `migrate`, l. 760+, et le bloc `networks`).
`docker:prod:db` a été retirée en L35 ; voici la procédure qui la remplace.

```bash
# 1. Session psql depuis le VPS, avec les identifiants de .env.docker
#    (DIRECT_URL = connexion directe, sans le pooler).
psql "$DIRECT_URL"

# 2. Depuis un conteneur du stack (aucun client psql requis sur l'hôte)
docker compose run --rm --network supabase_default migrate \
  sh -lc 'psql "$DIRECT_URL" -c "select now(), count(*) from \"User\";"'
```

Règles :

- **Toujours `DIRECT_URL`** (port direct) pour l'administration, jamais le pooler
  (`DATABASE_URL` passe par pgbouncer en mode transaction : pas de session).
- **Migrations** : `pnpm db:migrate` (goose, `apps/api/sql/migrations`) en local ;
  en production, `docker compose run --rm migrate` applique le même répertoire
  depuis l'image `ghcr.io/flayrox/qoefi-migrate`. `ExpectedMigrationVersion` est
  la version attendue ; un écart se corrige par une migration, jamais à la main.
- **Sauvegardes** : `scripts/backup-postgres.sh` (dump + rétention) et
  `scripts/backup-top-db.sh`. Une restauration se teste sur une base jetable
  avant d'être annoncée.
- **Jamais de `TRUNCATE`/`DROP` en production** : les données de démonstration
  se créent par `go run ./cmd/seed` sur une base de test.

---

## 3. Gabarits d'e-mail Supabase (R299)

`docker/gotrue-templates/` contient 10 gabarits (`confirmation`, `invite`,
`magic_link`, `recovery`, `email_change`… en `.html` + `.txt`). Aucun fichier
versionné ne les monte : ils sont consommés par le **stack Supabase**, qui vit
hors de ce dépôt. Côté GoTrue, le montage attendu est :

```yaml
GOTRUE_MAILER_TEMPLATES: /gotrue-templates
# volumes: ["./docker/gotrue-templates:/gotrue-templates:ro"]
```

Changer un gabarit = redémarrer le conteneur GoTrue du stack Supabase
(`docker compose restart auth` dans ce stack). Les tests d'envoi passent par le
puits SMTP local (`pnpm mail:dev`, `.mail-outbox/*.eml`) : rien ne part vers un
vrai destinataire depuis un poste.

---

## 4. Où mettre à jour ce document

- Nouveau seuil ou nouvelle métrique → `infra/monitoring/alerts.yml` **et** le
  tableau du §1, dans le même commit.
- Nouveau service docker de production → §2 (accès base) et le bloc `networks`
  de `docker-compose.yml`.
- Nouveau gabarit d'e-mail → §3.
