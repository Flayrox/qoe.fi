# 🧪 A1 — Vérification à 100 %

> **But :** qu'aucun chemin critique ne puisse casser sans qu'un test le dise.
> **Porte de sortie de l'axe :** CI verte et obligatoire ; seuils de couverture par
> module bloquants ; contrats API, autorisations, résilience et migrations couverts ;
> tests de charge et de sécurité exécutés automatiquement.

**État actuel :** 202 fichiers `*_test.go`, 122 fichiers `*.test.ts*`, une suite
Playwright (`e2e/`), des gates de couverture (Go dans `ci.yml`, TS dans
`vitest.coverage.config.ts`). Mais : **CI rouge sur `main`** (E2E legal tenants, base E2E
sans `goose_db_version`, job « base partagée » annulé) et plusieurs chemins critiques
(uploads, liens d'invitation, autorisations fines) sans test de bout en bout.

**Périmètre principal :** `apps/api/**`, `packages/**`, `e2e/**`, `apps/*/src/**`, `.github/workflows/**`.

| # | Lot | Fichiers | Sortie vérifiable | Taille |
| --- | --- | --- | --- | --- |
| 1.1 | Réparer les 2 E2E légaux tenants (strict mode + `toBeVisible` introuvable) | `e2e/tenants-legal*.spec.ts`, pages légales tenants | `pnpm e2e` vert sur ces specs, en local **et** en CI | S |
| 1.2 | Appliquer les migrations dans l'environnement E2E (fin du `goose_db_version` manquant) | `e2e/**` setup, compose E2E | plus aucune erreur `relation "goose_db_version" does not exist` dans les logs E2E | S |
| 1.3 | Rendre fiable le job `Go Backend — base partagée` (aujourd'hui *cancelled*) | `.github/workflows/ci.yml`, `pnpm test:api` | job vert, durée stable, aucun `cancelled` sur 5 runs consécutifs | M |
| 1.4 | Cartographier les tests existants par module et lister les trous | `docs/LICORNE_2027/annexe-couverture.md` (nouveau) | tableau module × (unit/int/e2e) avec trous nommés | M |
| 1.5 | Seuils de couverture **par module Go** (fini le seuil global qui masque les trous) | `.github/workflows/ci.yml`, script de gate | un module sous son seuil fait échouer la CI, nommément | M |
| 1.6 | Seuils de couverture **par package TS** (dont les workflows/server actions) | `vitest.coverage.config.ts`, gates | idem : échec ciblé, seuils versionnés | M |
| 1.7 | Tests de contrat : chaque route enregistrée est testée (méthode, chemin, statut, schéma) | `apps/api/internal/**`, nouveau `router_test.go` | toute route non couverte fait échouer un test dédié | L |
| 1.8 | Golden tests de payload (auth, articles, media, collaborations, conversations) | `apps/api/internal/modules/*/golden_test.go` | diff de payload détecté automatiquement | L |
| 1.9 | Matrice d'autorisation testée en table : `endpoint × rôle × ressource` | `apps/api/internal/**` | un test par cellule attendue (403/404/200) | L |
| 1.10 | Tests anti-fuite : paywall, emails privés, brouillons, membres non autorisés | `apps/api/internal/{articles,media,collaborations}` | aucune réponse HTTP ne contient un champ interdit (assertion explicite) | M |
| 1.11 | E2E des parcours critiques manquants (inscription, publication, collaboration, upload de logo, paywall, réglages) | `e2e/**` | 1 spec par parcours, exécutée en CI | L |
| 1.12 | Smoke mobile automatisé (parcours connexion + publication + réglages) | `apps/mobile/**`, CI | job mobile vert ou explicitement CI-only | L |
| 1.13 | Tests de charge : feed, article, recherche, upload (budgets chiffrés) | `e2e/load/**` (nouveau) | rapport de charge versionné + budgets vérifiés | M |
| 1.14 | Tests de résilience : OpenAI, Supabase, Meilisearch, Redis indisponibles | `packages/moderation`, `packages/supabase`, Go | chaque panne produit un comportement **documenté** (fail-open ou fail-closed), testé | M |
| 1.15 | Tests de migration : `up` depuis zéro, `up` incrémental sur données seedées, `down` | `apps/api/sql/migrations`, CI | 3 scénarios verts, y compris avec données réelles | M |
| 1.16 | Gate « images Docker saines » : `require('sharp')`, migrations présentes dans l'image migrate, healthchecks | `.github/workflows/build-images.yml`, `Dockerfile` | le build échoue si l'image n'est pas utilisable | M |
| 1.17 | Gate « aucun test désactivé » : `skip`/`.only`/`t.Skip` interdits sans référence de lot | CI (script) | le gate liste tout skip ajouté | S |
| 1.18 | Radar des tests instables (flaky) : détection, quarantaine datée, réactivation | CI + `docs/LICORNE_2027/annexe-flaky.md` | aucun test instable non daté | M |
| 1.19 | Property/fuzz tests : magic bytes, parseurs markdown, tokens de liens d'invitation | `packages/**`, `apps/api/internal/**` | entrées aléatoires → aucune panique, aucune fuite | M |
| 1.20 | Environnement local reproductible des tests d'intégration (fin du « Docker éteint = pas de test ») | `scripts/dev-up.sh`, doc | une commande lance DB+Redis+Meili et la suite d'intégration | M |

**Anti-collision :** cet axe touche `e2e/**`, les workflows et les fichiers de test —
il peut tourner en parallèle de A3/A4 tant que personne d'autre n'édite `apps/api/internal/**`
(hors tests) ni `packages/**` (hors tests).

**Reprise à froid :** ouvrir ce fichier, exécuter le premier lot non coché. Les lots 1.1-1.3
débloquent tous les autres (une CI rouge rend tout le reste non mesurable).
