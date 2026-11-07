# 06 — Système UI & UI lab

## État actuel

| Élément | Détail |
|---|---|
| UI lab | `apps/studio/src/app/dev/ui-lab/` — 21 spécimens, catalogue généré |
| Catalogue | `pnpm ui:catalog` → `catalog.json` (scan réel + compteur d'usages) |
| Budget de dette | `ui-budget.json` + `pnpm ui:audit` (ratchet, CI bloquante) |
| Tests visuels | `e2e/visual/ui-lab.visual.spec.ts` |
| Primitives | `packages/ui/src/primitives/*` (~30 entrées dans l'exports map) |

C'est une très bonne base : peu de projets ont un inventaire généré et un
ratchet de dette. Le travail restant est moins « construire » que « finir de
migrer ».

## UI-01 — Sortir le lab de studio (P1)

**Constat** : le lab vit sous `apps/studio/src/app/dev/ui-lab`, donc il n'est
accessible qu'en lançant studio, et il est couplé au routeur d'une app métier.

**Approche** : un package `packages/ui-lab` (ou `apps/ui-lab` minimal) qui
importe `@qoe/ui` et rend les spécimens. Avantages : démarrage rapide, pas
d'auth, réutilisable en CI, et le lab ne dépend plus du code studio.

## UI-02 — Baselines visuelles cross-platform (P1)

**Constat** : les snapshots sont dans
`e2e/visual/__screenshots__/darwin/ui-lab.visual.spec.ts`. Playwright nomme les
baselines par plateforme (`darwin`) → la CI Linux n'aura jamais de baseline et
le test ne protège rien en CI.

**Approche** :
- forcer `snapshotPathTemplate` sans plateforme, ou générer les baselines dans
  un conteneur Docker (même police, même rendu) ;
- ajouter un job CI dédié, exécuté seulement si `packages/ui/**` change ;
- ajouter un diff commenté dans la PR.

## UI-03 — Finir la migration (P1)

`ui-budget.json` au 2026-11-06 :

| Métrique | Reste |
|---|---:|
| `<button>` bruts | 318 (80 fichiers) |
| `<input>` bruts | 139 (38 fichiers) |
| overlays faits main | 3 |
| primitives locales | 16 |
| primitives inutilisées | 5 |

**Approche** : migrer par écran, pas par composant. Commencer par les écrans
les plus vus (feed, article, réglages) et faire descendre le budget à chaque
PR. Ne pas migrer mécaniquement : un `<button>` brut dans un cas très
spécifique peut rester, mais alors il doit être justifié par un commentaire.

## UI-04 — Documentation du contrat (P1)

L'exports map de `@qoe/ui` contient ~60 entrées, sans page de doc ni règles de
dépréciation. Un dev ne sait pas quelle primitive utiliser entre
`./button`, `./bevel-button`, `./copy-button`, `./save-button`, `./toggle`.

**Approche** : une page par primitive dans le lab (usage, props, à ne pas
faire, accessibilité), générée depuis les sources quand c'est possible. Une
règle simple : une primitive sans spécimen n'existe pas.

## UI-05 — Accessibilité (P1)

À vérifier systématiquement dans le lab :
- contrastes (le thème sombre est un piège classique) ;
- navigation clavier complète (focus visible, ordre logique, `Esc`) ;
- `aria-*` sur les overlays, menus, combobox ;
- respect de `prefers-reduced-motion` (le logo animé 4s et les transitions
  doivent pouvoir être désactivés) ;
- taille de cible tactile ≥ 44 px sur mobile.

**Approche** : `axe-core` dans les tests Playwright du lab, plus un audit manuel
clavier sur les 5 écrans principaux.

## UI-06 — Web ↔ mobile (P2)

`@qoe/ui` dépend de `next`, `@qoe/sdk` et `@qoe/supabase` : il n'est pas
réutilisable par `apps/mobile`. Aujourd'hui le mobile a son propre
`LiquidTabBar` (1 244 lignes) et ses composants.

**Décision à prendre** : soit le mobile garde son design system natif (assumé),
soit on extrait des primitives headless partagées (tokens, états, logique) et
chaque plateforme garde son rendu. Ne pas essayer de partager des composants
React DOM avec React Native.

## UI-07 — Tokens

Les tokens existent (`packages/theme`, `@qoe/ui/tokens`). Vérifier qu'aucune
valeur brute (`#fff`, `12px`, `0.3s`) ne subsiste hors des tokens : ajouter une
règle ESLint ou un scan dans `ui:audit`, comme pour les boutons bruts.

## Prochaine étape concrète

1. Déplacer le lab dans son propre package (UI-01).
2. Générer les baselines en Docker + job CI conditionnel (UI-02).
3. Écrire la doc des 10 primitives les plus utilisées (UI-04).
4. Ajouter `axe-core` sur les spécimens (UI-05).
5. Reprendre la migration écran par écran, budget à la baisse (UI-03).
