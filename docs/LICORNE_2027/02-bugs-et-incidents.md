# 🐞 A2 — Chasse aux bugs et aux incidents

> **But :** zéro bug connu, et la preuve que ce qui a cassé ne cassera plus.
> **Porte de sortie de l'axe :** plus aucune 5xx inexpliquée en prod sur 14 jours,
> chaque incident passé a son test de non-régression, et un modèle de post-mortem
> est appliqué systématiquement.

**État actuel :** seulement **4 marqueurs** `TODO/FIXME/HACK` dans tout le code — la dette
n'est donc **pas marquée**, elle est invisible : il faut la retrouver par la mesure, pas
par le grep. Trois incidents récents sont documentés partiellement (logo média / `sharp`,
smoke test `admin.qoe.fi`, invitations média mortes) sans format commun.

**Périmètre principal :** `apps/api/**`, `apps/*/src/**`, logs prod, `docs/`.

| # | Lot | Fichiers | Sortie vérifiable | Taille |
| --- | --- | --- | --- | --- |
| 2.1 | Inventaire des 5xx sur 14 jours (Caddy, API, studio, core, tenants, admin) | accès VPS en lecture, `docs/LICORNE_2027/annexe-erreurs.md` | tableau endpoint × fréquence × première/trace | M |
| 2.2 | Inventaire des erreurs côté client (console navigateur, erreurs remontées par l'app) | `packages/observability`, app mobile | liste catégorisée, sans PII | M |
| 2.3 | Inventaire des échecs silencieux : `catch` vides, promesses non gérées, `.catch(() => {})` | `apps/**`, `packages/**` | chaque `catch` vide est justifié ou corrigé | M |
| 2.4 | Triage priorisé (impact × fréquence × difficulté) de tout ce qui précède | annexe ci-dessus | liste ordonnée, prête à consommer par les lots suivants | S |
| 2.5 → 2.10 | **Corrections par domaine** (un lot par bug confirmé, du plus grave au plus rare) : auth/session, articles/paywall, médias/uploads, collaborations, messagerie, notifications, réglages | selon le bug | test de non-régression qui échoue avant le correctif et passe après | S→M |
| 2.11 | Chaque incident passé reçoit son test de non-régression | `**/*_test.go`, `*.test.ts*` | 3 incidents déjà documentés → 3 tests | S |
| 2.12 | Modèle de post-mortem standardisé (symptôme, diagnostic, cause racine, correctif, garde-fou, leçon) | `docs/POSTMORTEMS.md` (nouveau) + gabarit | 3 post-mortems existants reformatés dans ce modèle | S |
| 2.13 | Détection de régression sur les parcours produit : journal de santé public (uptime + latence des routes clés) | externes + CI | alerte si un parcours critique tombe | M |
| 2.14 | Revue systématique des zones « jamais testées » remontées par A1 lot 1.4, avec correction des bugs trouvés au passage | selon inventaire | chaque zone visitée produit ≥ 1 test | L |

**Règles :**
- Un bug trouvé **hors** du lot en cours ne fait pas dériver : il est ajouté ici (lot
  suivant disponible) et on termine le lot en cours.
- Un correctif sans test de non-régression n'est **pas** considéré comme fait.
- Aucun correctif ne mélange refonte et réparation (les refontes vivent dans A4).

**Anti-collision :** c'est l'axe qui édite le plus largement. Il doit être le **seul** à
modifier du code métier quand il tourne, ou partager la matrice d'anti-collision du
`README.md` (un dossier = un thread).

**Reprise à froid :** les lots 2.1-2.4 sont les seuls à faire d'abord : sans inventaire,
on corrige au hasard.
