# Roadmap technique & produit — backlog vivant

> **Dernière mise à jour : 2026-11-07**
> Ce dossier est la mémoire durable du chantier. Il survit aux sessions et aux
> compactions de contexte. Lis-le en entier avant de commencer, mets-le à jour
> après chaque chantier.

## Légende

| Statut | Sens |
|---|---|
| `todo` | identifié, non commencé |
| `wip` | en cours |
| `bloqué` | dépend d'une décision ou d'un accès |
| `✅ fait (date)` | terminé, référencer le commit |

Priorité : **P0** = risque immédiat (prod, sécurité, perte de données) · **P1** = structurant à 1–3 mois · **P2** = confort / qualité de vie.

## Vue d'ensemble

| ID | Sujet | Priorité | Statut |
|---|---|---|---|
| **ARCH-01** | Découper les god-files React (2 600 / 2 200 / 1 600 lignes) | P1 | todo |
| **ARCH-02** | Découper les god-services Go (`articles`, `media`, `analytics`) | P1 | todo |
| **ARCH-03** | Supprimer la duplication Go ↔ TS (feed/personalized) | P1 | todo |
| **ARCH-04** | Extraire le composition root de `cmd/server/main.go` | P2 | todo |
| **ARCH-05** | Découpler `@qoe/ui` de `@qoe/sdk` / `@qoe/supabase` | P2 | todo |
| **RUN-01** | Pagination keyset au lieu de `LIMIT/OFFSET` | P0 | todo |
| **RUN-02** | Invalidation de cache Redis sans `SCAN` | P1 | todo |
| **RUN-03** | Budget de connexions Postgres + PgBouncer | P1 | todo |
| **RUN-04** | Observabilité Go : slog JSON, request ID, Sentry, métriques | P1 | todo |
| **RUN-05** | `/readyz` vérifiant DB + Redis (+ queue) | P0 | todo |
| **RUN-06** | Sortir les envois email du chemin de requête | P2 | todo |
| **RUN-07** | Aligner doc et code sur les rate limits | P2 | todo |
| **DATA-01** | Supprimer la dérive `schema.sql` ↔ migrations | P1 | todo |
| **DATA-02** | Modélisation JSON (`emailSettings::text`) | P2 | todo |
| **DATA-03** | Partitionner les tables volumineuses | P1 | todo |
| **DATA-04** | Mesurer les requêtes chaudes (`pg_stat_statements`, EXPLAIN) | P1 | todo |
| **DATA-05** | Indexer les pensées dans Meilisearch | P2 | todo |
| **CI-01** | Retirer `^build` de `lint` / `typecheck` | P1 | todo |
| **CI-02** | `outputs` typecheck + cache distant Turbo | P1 | todo |
| **CI-03** | Sortir `.env` des `globalDependencies` | P2 | todo |
| **CI-04** | CI filtrée par affected + setup partagé | P1 | todo |
| **CI-05** | Typecheck/lint du mobile en CI | P1 | todo |
| **CI-06** | Réaligner `dev` → `main` + protéger la branche | P0 | wip (merge local 2026-11-07) |
| **CI-07** | Environnement de staging | P1 | todo |
| **CI-08** | Déploiement zero-downtime | P2 | todo |
| **CI-09** | Build d'images unique (buildx bake) | P2 | todo |
| **CI-10** | Scan de secrets (gitleaks) | P1 | todo |
| **PROD-01** | Notifications push réelles (Expo/FCM/APNs) | P0 | todo |
| **PROD-02** | Temps réel lecteur (notifs, DM, badge feed) | P1 | todo |
| **PROD-03** | Onboarding réel (intérêts, follows, profil) | P0 | todo |
| **PROD-04** | Hashtags / sujets navigables | P1 | todo |
| **PROD-05** | Listes / cercles / feeds personnalisés | P2 | todo |
| **PROD-06** | Digest email (quotidien/hebdo) | P1 | todo |
| **PROD-07** | DM : accusés de lecture, médias, temps réel | P1 | todo |
| **PROD-08** | Images Open Graph générées | P1 | todo |
| **PROD-09** | Universal links / App Links mobile | P2 | todo |
| **PROD-10** | Recherche : onglets personnes / pensées / sujets | P2 | todo |
| **PROD-11** | Funnel produit + expérimentation A/B | P2 | todo |
| **PROD-12** | Comptes privés : demandes de follow + blocage symétrique | P1 | ✅ fait (2026-11-07) |
| **PROD-13** | Fermeture des surfaces de visibilité (hydrate, notifications, commentaires, sitemap, recherche) | P1 | ✅ fait (2026-11-07) |
| **UI-01** | UI lab : sortir de studio + baselines visuelles cross-platform | P1 | todo |
| **UI-02** | Migrer les 318 `<button>` et 139 `<input>` bruts | P1 | todo |
| **UI-03** | Supprimer les primitives mortes | P2 | todo |
| **UI-04** | Documentation du contrat `@qoe/ui` | P1 | todo |
| **UI-05** | Parité design system web ↔ mobile | P2 | todo |
| **UI-06** | Audit accessibilité (contrastes, focus, clavier) | P1 | todo |

## Ce qui a été fait récemment (contexte)

- **2026-11-07** : routing canonique `/:username/a/:slug`, redirections cross-zone, fixes slug.
- **2026-11-07** : comptes privés (FollowRequest, acceptation/refus, gating profil/feed/recherche/articles) et blocage symétrique (profils, feeds, recherche, fils, nettoyage des follows).
- **2026-11-07** : fermeture des surfaces de visibilité restantes — notifications filtrées par blocage, demandes actionnables dans le centre de notifications, hydrate sans brouillons/programmés/privés/bloqués, commentaires et sitemaps filtrés, recherche de personnes filtrée, nettoyage des liens au blocage depuis les réglages.
- **2026-11-06** : console admin lots A→D (triage 6 files, RBAC, SLO, DSAR, rétention, outbox, sandbox, impersonation auditée).
- **2026-11-06** : refonte UI studio (primitives partagées, densité, suppression de 5 primitives mortes).
- **2026-10** : OAuth 2.1/OIDC, clés API, webhooks, modération anti-abus, support, recours.

## Détail des fichiers

1. [Architecture & dette structurelle](./01-architecture-dette.md)
2. [Runtime & scalabilité](./02-runtime-scalabilite.md)
3. [CI, DX, déploiement](./03-ci-dx-deploiement.md)
4. [Données & schéma](./04-data-schema.md)
5. [Produit : ce qui manque](./05-produit-gaps.md)
6. [Système UI](./06-ui-system.md)

## Prochaine revue

Relire ce dossier à chaque début de chantier, et le mettre à jour en fin de
chantier. Si un item reste `todo` plus de 3 mois, soit il descend en `P2`,
soit il est supprimé (assumé).
