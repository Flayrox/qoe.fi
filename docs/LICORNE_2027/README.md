# 🦄 Programme LICORNE 2027 — excellence de l'existant

> **Décision de session (19/09/2026).** On ne lance **aucune nouvelle fonctionnalité**.
> On élève tout ce qui existe déjà : zéro bug connu, vérification à 100 % partout,
> performance, sécurité, accessibilité, observabilité, refonte de la dette, polish.
> Objectif : un niveau de qualité « licorne », c'est-à-dire qu'un tiers puisse auditer
> le code, la prod et les données **sans trouver de trou**.
>
> Ce dossier est **le plan de travail**. Il est fait pour être lu par petits morceaux :
> un axe à la fois, un lot à la fois. Ne jamais charger les 8 fichiers d'un coup.

---

## 1. Ce que « licorne » veut dire concrètement (les 6 portes)

Chaque porte est **mesurable** ; une porte fermée = le programme avance. Rien ne se
déclare fait « parce que ça marche chez moi ».

| Porte | Critère de passage | Mesure |
| --- | --- | --- |
| 🟢 **P1 — CI verte et obligatoire** | Tous les jobs verts sur `main`, y compris E2E ; aucun `--continue-on-error` | `gh run list --workflow=ci.yml` → `success` |
| 🟢 **P2 — Vérification** | Couverture plancher par module, aucun chemin critique non testé, contrats API testés | seuils CI bloquants |
| 🟢 **P3 — Zéro bug connu** | Aucune erreur 5xx inexpliquée en prod ; tout incident = test de non-régression | logs + tests |
| 🟢 **P4 — Performance tenue** | Budgets : API p95, LCP/CLS/INP, poids JS, taille d'image, mémoire conteneur | mesure automatisée |
| 🟢 **P5 — Sécurité & vie privée** | Aucun point d'entrée non filtré ; secrets hors repo ; RGPD prouvable | audit + tests |
| 🟢 **P6 — Accessibilité & i18n** | WCAG 2.2 AA sur les parcours clés ; 100 % des chaînes localisées fr/en | axe + Lingui |

---

## 2. Les 8 axes (les fichiers de travail)

| Axe | Fichier | Périmètre principal | Nb de lots |
| --- | --- | --- | --- |
| 🧪 **A1 — Vérification 100 %** | [`01-verification.md`](./01-verification.md) | tests, CI, gates, environnements de test, contrats, charge | ~18 |
| 🐞 **A2 — Chasse aux bugs** | [`02-bugs-et-incidents.md`](./02-bugs-et-incidents.md) | prod, logs, 5xx, régressions, non-régression permanente | ~14 |
| ⚡ **A3 — Performance & échelle** | [`03-performance-echelle.md`](./03-performance-echelle.md) | SQL/N+1/index, cache, latence, Web Vitals, bundle, images | ~16 |
| 🏗️ **A4 — Refonte & simplification** | [`04-architecture-refonte.md`](./04-architecture-refonte.md) | dette, duplications, code mort, contrats partagés, cohérence | ~15 |
| 🛡️ **A5 — Sécurité & vie privée** | [`05-securite-vie-privee.md`](./05-securite-vie-privee.md) | auth, rate limit, RLS, secrets, headers, dépendances, RGPD | ~17 |
| 📈 **A6 — Observabilité & fiabilité** | [`06-observabilite-fiabilite.md`](./06-observabilite-fiabilite.md) | logs, traces, métriques, SLO, alertes, DR | ~15 |
| ♿ **A7 — Accessibilité & i18n** | [`07-accessibilite-i18n.md`](./07-accessibilite-i18n.md) | WCAG 2.2 AA, clavier, lecteurs d'écran, fr/en 100 % | ~14 |
| ✨ **A8 — Expérience & polish** | [`08-experience-polish.md`](./08-experience-polish.md) | états vides/erreur/chargement, parité web/mobile, cohérence | ~14 |

**Total : ~123 micro-lots.** Un lot = un commit. Jamais deux lots dans un commit.

---

## 3. Comment on travaille (règles anti-crash du contexte)

Ces règles existent parce qu'un plan trop gros en une fois fait perdre le fil **et**
fait dériver le code. Elles sont **non négociables**.

1. **Un lot = un commit = un seul sujet.** Message détaillé, **sans footer**.
2. **Budget de diff : ≤ 250 lignes** et **≤ 1 module** par lot. Au-delà, découper.
3. **Trois chantiers en parallèle maximum**, et **un dossier = un seul thread** :
   deux threads ne doivent jamais éditer le même fichier en même temps.
4. **Aucun lot n'est « fini »** sans : `typecheck` du périmètre, tests du périmètre,
   et la **sortie vérifiable** listée dans la ligne du lot (observée, pas supposée).
5. **Jamais de seuil de couverture abaissé**, jamais de test désactivé, jamais de
   `skip` sans lien vers un lot de ce plan qui le réactivera.
6. **Un bug trouvé hors lot → on ne dérive pas** : on l'ajoute au fichier de l'axe
   concerné (numéro suivant) et on continue le lot en cours.
7. **Reprise à froid en 60 s** : lire le §5 (état), puis ouvrir **un seul** fichier
   d'axe, puis exécuter le premier lot non coché. Rien d'autre.
8. **Environnements** : tout test qui a besoin de Postgres/Redis/Docker doit soit
   tourner en CI, soit dire clairement (dans la ligne du lot) qu'il est **CI-only**.

### Matrice d'anti-collision (qui touche quoi)

| Zone de code | Axes autorisés | Remarque |
| --- | --- | --- |
| `apps/api/internal/**` | A1, A2, A3, A4, A5, A6 | cœur : un seul thread à la fois dessus |
| `apps/api/sql/**` | A1, A3, A4, A5 | migrations : jamais deux en parallèle |
| `packages/**` | A1, A3, A4, A5, A7 | partagé par toutes les apps : PR séparée |
| `apps/studio/**` | A2, A7, A8 | produit principal |
| `apps/core/**`, `apps/tenants/**` | A2, A7, A8 | lecture publique |
| `apps/admin/**` | A2, A5, A8 | surface sensible |
| `apps/mobile/**` | A1, A3, A5, A8 | parité mobile |
| `.github/**`, `Dockerfile*`, `scripts/**` | A1, A6 | infra de vérification |
| `docs/**` | tous | jamais bloquant |

---

## 4. Phasage (dans quel ordre, et pourquoi)

| Phase | Objectif | Contenu | Pourquoi d'abord |
| --- | --- | --- | --- |
| **P0 — Débloquer la vérité** | CI verte + inventaires exhaustifs | A1 lots 1-6, A2 lots 1-4, A6 lot 1 | On ne peut rien mesurer tant que la CI est rouge et qu'on ne sait pas ce qui casse |
| **P1 — Corriger** | Zéro bug connu consommateur | A2 lots 5-14, A5 lots 1-8 | Les bugs visibles avant les optimisations invisibles |
| **P2 — Élever** | Perf, a11y, i18n, observabilité | A3, A6, A7 | Se fait sur un socle sain |
| **P3 — Verrouiller** | Refonte + gates 100 % | A4, A1 lots 7-18, A5 lots 9-17 | La dette se paie quand les tests la protègent |
| **P4 — Prouver** | Audit externe-ready | A8, portes P1-P6 vérifiées, DR testé | La preuve, pas la promesse |

---

## 5. État au 19/09/2026 (à tenir à jour)

- **CI rouge sur `main`** (pré-existant, non causé par les derniers commits) :
  - `E2E Apps (tenants/studio/admin)` → pages légales tenants : *strict mode violation*
    sur `getByRole('heading', { name: /Conditions générales/ })` (2 éléments) et deux
    `expect(locator).toBeVisible()` qui ne trouvent rien (test « opposition en un clic »).
  - Base des E2E : `relation "goose_db_version" does not exist` → **migrations non
    appliquées** dans l'environnement E2E.
  - `Go Backend — base partagée` : **cancelled** (le job n'aboutit pas).
- **Docker local éteint** : les tests d'intégration Go (testcontainers) ne tournent
  pas sur la machine → **CI-only** tant qu'on n'a pas un environnement local stable.
- **Faits déjà acquis** (ne pas refaire) :
  - `sharp`/libvips en prod : corrigé + garde-fous de build (`scripts/fix-standalone-native-deps.sh`).
  - Smoke test `admin.qoe.fi` : faux positif corrigé (`--resolve`).
  - Invitations média par email : supprimées, migration `00025` appliquée en prod.
  - Audit des points d'upload : [`../SECURITY_UPLOAD_MODERATION_AUDIT.md`](../SECURITY_UPLOAD_MODERATION_AUDIT.md) — les trous listés (mobile, texte) deviennent des lots de **A5**.
  - `openapi/*.yaml` ne documente **ni** `collaborations` **ni** `media` → lots **A4**.
- **Non tracké volontairement** : `scripts/tmp-embed-lassez.mjs` (script temporaire, à
  supprimer dans A4).

### Registre d'exécution (mettre à jour en fin de lot)

| Date | Axe | Lots | Commit |
| --- | --- | --- | --- |
| 19/09/2026 | — | plan créé, audit upload/`sharp` livrés | `1d62cf17`, `64551357`, `305db865` |

---

## 6. Portes de sortie d'un lot (checklist courte)

- [ ] Le lot est **un seul sujet**, diff ≤ 250 lignes.
- [ ] `pnpm typecheck` (périmètre) et/ou `go build ./... && go vet` passent.
- [ ] Les tests du périmètre passent ; **aucun test désactivé**.
- [ ] La **sortie vérifiable** de la ligne du lot est **observée** (log, sortie de test, mesure).
- [ ] Aucune régression de couverture ; jamais de seuil abaissé.
- [ ] La ligne du lot est cochée dans le fichier d'axe + une ligne ajoutée au registre §5.
- [ ] Commit détaillé **sans footer**.

---

## 7. Ce que ce programme ne fait pas

- Il n'ajoute **aucune** fonctionnalité produit, aucune refonte visuelle de fond, aucun
  nouveau module métier : ces idées restent dans `docs/BACKLOG.md`.
- Il ne renomme pas ce qui fonctionne « pour faire joli » sans test qui protège le changement.
- Il ne réécrit pas l'architecture d'un coup : chaque refonte passe par un lot qui
  **préserve le comportement observable** et le prouve par test.
