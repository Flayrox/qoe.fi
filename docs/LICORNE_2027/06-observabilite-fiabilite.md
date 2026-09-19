# 📈 A6 — Observabilité & fiabilité

> **But :** savoir ce qui se passe **avant** que l'utilisateur ne le signale, et pouvoir
> revenir en arrière sans stress.
> **Porte de sortie de l'axe :** SLO définis et suivis, alertes qui préviennent (pas qui
> constatent), file d'attente maîtrisée, restauration de sinistre testée.

**État actuel :** `packages/observability` existe, Umami suit l'audience, les healthchecks
Docker et les smoke tests de déploiement sont en place (12 assertions). Mais : pas de
SLO/error budget, pas de traces, pas d'alerte proactive, pas de supervision de la file
asynq ni de la base, et les logs prod sont consultés **à la main** en cas d'incident.

**Périmètre principal :** `apps/api/**`, `packages/observability`, `docker-compose.yml`, Caddy, VPS, workflows.

| # | Lot | Fichiers | Sortie vérifiable | Taille |
| --- | --- | --- | --- | --- |
| 6.1 | Inventaire de ce qui est déjà observé (logs, métriques, healthchecks, analytics) | `docs/LICORNE_2027/annexe-observabilite.md` (nouveau) | tableau source × rétention × usage | S |
| 6.2 | Logs structurés JSON partout, avec `correlationId` propagé de l'entrée à la base | Go + apps Next | une requête se suit de bout en bout par son identifiant | L |
| 6.3 | Traces distribuées sur les chemins critiques (API → worker → DB) | OpenTelemetry | une trace complète visualisable pour un parcours réel | L |
| 6.4 | Métriques métier (pas seulement techniques) : inscriptions, publications, uploads, invitations, échecs d'envoi | Go + dashboards | tableau de bord « santé produit » | M |
| 6.5 | Métriques d'infrastructure : CPU/mémoire/disque/connexions DB/taille queue Redis | agents + dashboards | seuils visibles | M |
| 6.6 | File asynq : profondeur, âge des tâches, échecs, dead letter, retry | worker Go | aucune tâche perdue silencieusement | M |
| 6.7 | Supervision PostgreSQL : requêtes lentes, verrous, connexions, réplication/backups | Postgres | alerte avant saturation | M |
| 6.8 | SLO + budget d'erreur par surface (API, core, studio, tenants, admin) | docs + dashboards | SLO écrits, budget suivi, décision documentée quand il est consommé | M |
| 6.9 | Alertes actionnables (5xx, queue bloquée, disque, SSL, backup manquant, certificat expirant) | agent d'alerte | un test d'alerte déclenché volontairement | M |
| 6.10 | Healthchecks séparés liveness/readiness (dépendances vérifiées, sans bloquer le démarrage) | Docker, Go, Next | un conteneur dégradé n'est pas déclaré sain | M |
| 6.11 | Backpressure et limites : taille de file, timeouts, budget d'upload, coupures propres | Go + worker + Caddy | surcharge testée → dégradation contrôlée, pas d'écroulement | M |
| 6.12 | Rotation et rétention des logs, coût de stockage suivi | VPS + Caddy | rétention configurée, coût connu | S |
| 6.13 | Runbook d'incident (qui, quoi, dans quel ordre, où sont les logs) | `docs/RUNBOOK_INCIDENT.md` (nouveau) | un incident simulé résolu en suivant uniquement le runbook | M |
| 6.14 | Test de restauration de sauvegarde (DR) de bout en bout, daté et rejouable | `scripts/backup-*`, VPS | restauration complète dans un environnement jetable | L |
| 6.15 | Post-déploiement automatique : vérifier que la version déployée est bien la version attendue | `scripts/deploy-prod.sh`, API | affichage/contrôle du commit et du tag d'image après déploiement | S |

**Anti-collision :** les lots 6.9, 6.12, 6.14 touchent l'infrastructure : jamais pendant
un déploiement ni en même temps que A5 sur les sauvegardes.

**Reprise à froid :** 6.1 → 6.2 (corrélation) → 6.8 (SLO) → 6.9 (alertes). Sans
`correlationId`, tout le reste coûte trois fois plus cher à diagnostiquer.
