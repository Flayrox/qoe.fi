# 🛡️ Plan « bunkérisation tests » — mémoire de chantier

> Plan vivant. Mis à jour à chaque étape franchie (section **Journal**).
> Objectif : déceler la moindre régression (rendu, hydratation, endpoint muet,
> logique métier) sur **tout** le surface produit, pas seulement sur les
> parcours déjà écrits. Aucune estimation : chaque chiffre ici est mesuré.

Dernière mise à jour : 2026-11-14 · commit de référence : `df389884`

---

## 0. Règles du chantier (non négociables)

1. **Zéro skip conditionnel** dans les jobs CI : un test qui s'auto-saute ne
   prouve rien. Si un prérequis manque en CI, on retire le projet de la
   commande du job (et on le dit), on ne le laisse pas « vert-sauté ».
2. **Aucune assertion supprimée, aucun `waitForTimeout` en rustine.** Une
   attente doit porter sur une condition observable.
3. **Ratchet** : un seuil de couverture = la mesure du jour (arrondie vers le
   bas). Il ne baisse jamais ; une refacto qui fait baisser la couverture
   s'accompagne de tests, pas d'un seuil plus bas.
4. **Chaque chiffre publié est mesuré** (commande + date + commit).
5. Bugs trouvés en chemin : corrigés dans le même pass, avec le test qui les a
   révélés (ou qui empêche la récidive).
6. Périmètre hors sujet, à ne pas toucher : `Go Backend` (échecs
   préexistants), `Supply Chain & Secret Security`, matrices studio/tenants/hi
   **de l'audit précédent** (elles sont l'objet de l'étape B, pas des échecs).

---

## 1. État mesuré au démarrage de ce plan (2026-11-14)

| Élément | Valeur mesurée | Source |
| --- | --- | --- |
| Job `E2E (Playwright)` | **25 passed / 0 failed / 0 skipped** | run `43529918284` sur `df389884` |
| Job `E2E Routes` (core+admin) | 69 tests, vert sur les commits précédents | runs `43494477019`, `43500804885`, `43514596938`, `43516799852` |
| Couverture TS agrégée | **24,15 % lignes** (après inclusion des `.tsx`, contre 40,58 % avant — même code, périmètre honnête) | `docs/TEST-COVERAGE.md` §2 |
| Couverture Go | 82 packages mesurés, **moyenne 38,3 %** (non pondérée) | idem §2 |
| Périmètres TS **non mesurés** | `apps/studio` (24 fichiers de test), `apps/admin` (10), `apps/tenants` (10), `packages/ui` (82) | `find` du 2026-11-14 |
| Pages hors matrice de routes | studio 24, tenants 16, hi 4 | `discoverPages()` |

Déjà fait avant ce plan (ne pas refaire) :
- `.tsx` inclus dans la couverture des périmètres mesurés ;
- matrice de routes **core + admin** avec garde d'inventaire (`e2e/routes.spec.ts`) ;
- contrat de parité API `chi.Walk` ↔ SDK TS (`apps/api/cmd/server/contract_parity_test.go`) ;
- ratchets : 11 seuils Vitest + 14 packages Go vérifiés en CI ;
- décision « URL canonique = forme core `/<owner>/a/<slug>` » (`df389884`) +
  test de régression unitaire et e2e.

---

## 2. Décisions techniques actées (ne pas re-litiger)

- **Mesure de couverture par package, pas en un run agrégé.** Raison mesurée :
  `apps/studio` (150 fichiers), `apps/admin` (111), `apps/tenants` (29) importent
  via `@/`, qui pointe vers **leur** `src`. Un seul run Vite ne peut pas mapper
  `@` vers trois racines différentes ; `packages/ui` n'utilise pas `@/` (0
  fichier) et reste mesurable dans l'agrégat si besoin. Chaque app garde donc
  **son** `vitest.config.ts` (alias, `environment: jsdom|node`, plugin lingui) et
  reçoit un bloc `coverage` + `test:coverage`.
- **Environnements différents** : `packages/ui` et `apps/tenants`/`studio` en
  `jsdom` (@testing-library), `apps/admin` en `node`. Ne pas tenter de les
  réunir dans un seul `environment`.
- **Sélection déterministe en e2e** : toute cible vient de la base
  (`ORDER BY slug` / `id`), jamais d'un rang de feed.
- **Pas de Docker en local** (consigne repo). Conséquence : le projet e2e
  `security` ne peut pas passer localement (API Go → 503 sans Redis) ; il est
  vert en CI où `redis:7-alpine` est monté.
- **`oauth-consent` est exclu du job CI `e2e`** (exige un Supabase local absent
  en CI ; ses 2 cas étaient sautés en silence). Il reste exécutable en local.

---

## 3. Étape A — Mesurer tout le front (à faire maintenant)

But : aucun périmètre React ne doit rester hors radar. Livrable : un seuil par
app/package, au niveau mesuré, qui casse le job en cas de baisse.

- **A1** — `packages/ui` : ajouter le bloc `coverage` (include `src/**/*.{ts,tsx}`,
  exclude tests/stories/`test-support`) + script `test:coverage`, mesurer,
  poser les seuils.
- **A2** — `apps/studio`, `apps/admin`, `apps/tenants` : même chose dans leurs
  configs respectives. Exclure `src/**/test-support/**`, `**/*.test.*`,
  `**/*.stories.*`, `**/.next/**`, `**/vendor/**`.
- **A3** — CI : un step « Coverage (front apps) » qui lance les 4 mesures et
  upload les rapports (`coverage/<pkg>`), sans casser le budget du job (chaque
  suite est petite : 82/24/10/10 fichiers).
- **A4** — Reporter les chiffres dans `docs/TEST-COVERAGE.md` §2 et ici
  (Journal), avec la date et le commit.

Critère de done A : les 4 commandes passent, les seuils sont dans les configs,
les chiffres sont publiés, et une baisse volontaire fait échouer le run
(vérifié une fois par mutation, puis revert).

## 4. Étape B — Matrice de routes pour studio / tenants / hi

But : aucune page ne doit exister sans avoir été rendue une fois.

- **B1** — `e2e/apps-routes.spec.ts` : pour chaque app (`studio`, `tenants`,
  `hi`), visiter chaque pattern issu de `discoverPages(app)` (segments
  dynamiques remplacés par `inconnu`), et exiger :
  - statut `< 500` ;
  - pas de texte d'error boundary (`CRASH_TEXT`) ;
  - pas d'erreur d'hydratation (`watchErrors`) ;
  - pour les routes protégées : redirection (307/308) vers le login, jamais
    200 avec un écran métier.
- **B2** — Garde d'inventaire : `uncoveredPages(app, visited, exempt)` doit être
  vide, avec exemptions **motivées** (pas de liste silencieuse).
- **B3** — Brancher ces cas dans `playwright.apps.config.ts` (nouveau projet
  `apps-routes`, testMatch dédié) et dans le job CI `e2e-apps`.
- **B4** — Lancer localement (serveurs 15403/15404/15405 + API Go), corriger
  tout ce qui casse.

Critère de done B : le log nomme chaque page visitée, 0 skip, et le job
`E2E Apps` est vert sur le commit poussé.

## 5. Étape C — Plus tard (déjà cadré, ne pas commencer sans feu vert)

- Go : combler les 0 % (`flags`, `newsletters`, `tracking`, `appeals`,
  `support`, `collaborations`) — nécessite une base de test (Testcontainers en
  CI uniquement, Docker interdit localement).
- `apps/hi` : pas de `vitest.config.ts` (1 seul test) → à décider (mesure ou
  exemption motivée).

---

## 6. Pièges connus (gagner du temps la prochaine fois)

- `pnpm --filter <pkg> exec vitest run --coverage` : `@vitest/coverage-v8` est
  installé à la **racine** ; si la résolution échoue sous pnpm strict, ajouter
  le paquet en devDependency du workspace concerné (pas d'installation globale).
- Les e2e démarrent leurs propres `webServer` (`playwright.config.ts` :
  API Go 8090 + core 3010 + admin 15405 ; `playwright.apps.config.ts` : +
  tenants 15403 + studio 15404). En local `reuseExistingServer` réutilise ce qui
  tourne déjà — vérifier les ports avant de conclure à un échec.
- La base de dev est **partagée** (VPS) : des runs voisins peuvent dépublier ou
  vider les fixtures de test. Symptôme : `/article/<slug>` en 404 alors que le
  seed publie. Remède : restaurer l'état du seed (contenu + `published`).
- Un slug peut exister sous **deux** publications (`deserts-information-france`) :
  `/v1/articles/<slug>` renvoie alors l'une ou l'autre. Ne pas en dépendre pour
  une assertion d'unicité.
- `next dev` : le premier hit compile la route (10-40 s). Un test HTTP large
  budget (`test.setTimeout(120_000)`) évite un faux flaky.
- Le reporter CI est `--reporter=list` pour le job `e2e` : le log doit nommer
  chaque cas (exigence de ce chantier).

---

## 7. Journal (append-only)

| Date | Étape | Résultat mesuré | Commit |
| --- | --- | --- | --- |
| 2026-11-14 | Plan créé | état de départ consigné (§1) | `df389884` |
| 2026-11-14 | **A1–A2** | Blocs `coverage` + seuils dans `packages/ui`, `apps/studio`, `apps/admin`, `apps/tenants`, script `pnpm test:coverage:front`, step CI « Coverage Gate (front apps) ». Mesures : ui **55,45 %** (519 tests), tenants **23,52 %** (34), studio **7,27 %** (107), admin **4,42 %** (63) — tous verts, seuils respectés. 723 tests passent de « invisibles » à « mesurés ». | _(commit A+B)_ |
| 2026-11-14 | **B1–B3** | `e2e/lib/route-matrix.ts` + `e2e/tenants-routes.spec.ts` (16 pages) + `e2e/studio-routes.spec.ts` (24 pages) = **42 cas**. Local : 42/42 verts. Ramassés automatiquement par le job `e2e-apps` (testMatch `tenants-*` / `studio-*`). `apps/hi` non branché (pas de `webServer` dédié) — tracé comme dette explicite. | _(commit A+B)_ |
| 2026-11-14 | **B3 (suite)** | La matrice poussait `e2e-apps` vers sa borne de 30 min : job dédié **`e2e-apps-routes`** (20 min, `--grep "Matrice de routes"`), et le job fonctionnel passe en `--grep-invert`. Le premier push a aussi révélé un `: ` dans un `name:` YAML (workflow invalide, runs sans job) — corrigé et validé par `js-yaml` avant push. | `986998ad` puis _(commit split)_ |
| 2026-11-14 | **B4** | Matrice apps en mode **prod** : `PLAYWRIGHT_APPS_PROD=1` fait servir `next start` par les `webServer`. Mesure locale : 42/42 en **16,3 s** (vs >20 min de compilation dev, job CI annulé deux fois). Le job `e2e-apps-routes` construit tenants + studio avant. Budgets e2e-routes relevés (job 15→25 min, `expectRedirect` requête 90 s, test admin 180 s) — assertions inchangées, c'est la compilation qui tombait. | _(commit B4)_ |
| 2026-11-14 | **B5 — matrice verte en CI** | Run `43545803259` sur `2f38d123` : job `e2e-apps-routes` **success**, `42 passed (16.5s)` dans le log (mode prod, admin laissé en dev). `Build & Verify Monorepo` (dont le gate de couverture front) **success** sur les trois derniers commits. | `2f38d123` |
| 2026-11-14 | **B6 — rouge résiduel expliqué** | `E2E Routes` : le premier run affichait la matrice admin en échec rapide, puis deux runs ont fini en `shutdown signal` du runner après ~6 min (aucun log de test conservé) ; au run `2f38d123` la matrice admin est **toute verte** (tests 30→68 ✓) et le job est tué par l'infra. `E2E Apps` repasse à **exactement** les 6 échecs préexistants (le test admin `redirige /admin` échouait par timeout de compilation : budget 180 s). | `c784cdff` |
| 2026-11-14 | **B7 — état final du run** | Sur `75d01ba6` (run de référence) : `Build & Verify Monorepo` **success** (coverage front inclus), `E2E (Playwright)` **success**, `e2e-apps-routes` **success** (42 cas), `E2E Apps` **failure = les 6 préexistants** (`7 passed, 11.5m`), `E2E Routes` **cancelled**. | `75d01ba6` |
| 2026-11-14 | **E2E Routes à reprendre** | Trois annulations le 14/11 (shutdown runner, puis 15 min, puis 25 min). Mesuré : mise en place ~6 min + 107 pages en ~3,5 min quand le runner va bien ; 106/107 verts en local et la matrice admin déjà **toute verte** en CI. Suspect : boot webServer (`go run` compile deux fois + deux `next dev`) et reprises lentes. Piste éprouvée : `PLAYWRIGHT_ROUTES_PROD=1` (build core + admin, ~35 s/app) — testé localement en **1 min 36** (~106/107, seul écart : en prod `/` de la console redirige direct vers le login, sans passer par `/admin`, contrat à réécrire si on l'adopte). | _à faire_ |
| 2026-11-14 | **B8 — les 6 échecs tenants, à zéro** | Trois causes distinctes, trois corrections : (1) **bug API** : `teamMembers` lisait `pub.User.Username` sans garde quand la publication n'a ni utilisateur lié ni article publié → panique nil pointer → **500** sur la home tenant (corrigé, + pile loggée par le middleware de recovery) ; (2) **specs périmées** : `tenants-legal` testait des pages supprimées par `3bf9d8f1` → réécrite sur le contrat actuel (404 local + liens absolus vers la plateforme + pas de bannière bloquante) ; (3) **sélecteurs/copie obsolètes** : route d'article legacy `/article/<slug>` qui redirige hors du préfixe `/tenant/<domaine>` (helper `e2e/lib/tenant-paths.ts`), classe `.backdrop-blur-xl` remplacée par la région accessible, apostrophe typographique `S’abonner`, double opt-in au lieu d'un abonnement immédiat. Local : **28/28 verts** (0 échec). | _(commit B8)_ |
| 2026-11-14 | Constat (hors matrice) | `E2E Apps` **échec préexistant** : 6 failed / 2 skipped / 7 passed sur `b8dfda31` (run `43522975160`), mêmes 6 échecs qu'en local (`tenants-legal` ×3, `tenants-paywall`, `tenants-recommendations`, `tenants.spec`). Aucun n'est dans la matrice : prochain chantier (fixtures tenants). | `b8dfda31` |

---

## 8. Definition of done globale

- Couverture mesurée et gatée sur **tous** les périmètres front (packages +
  apps), seuils au niveau mesuré.
- Matrice de routes sur **les 5 apps** (core, admin, studio, tenants, hi) avec
  garde d'inventaire, 0 skip.
- Jobs CI web/e2e verts sur un commit poussé, avec URL et compteurs cités.
  État au 14/11 sur `75d01ba6` : Build & Verify ✅, E2E (Playwright) ✅,
  e2e-apps-routes ✅ (42 cas), e2e-apps ❌ = 6 échecs préexistants, e2e-routes
  ❌ annulé (chantier suivant, cf. journal B7).
- Aucun test supprimé, skippé ou affaibli pendant le chantier.
