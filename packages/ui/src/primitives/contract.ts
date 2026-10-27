// =====================================================================
// 📐 contract.ts — le vocabulaire commun des primitives @qoe/ui
// =====================================================================
// 📖 Tout ce qui est ici est partagé par les 29 primitives. Rien de
//    spécifique à un composant : si une décision ne concerne qu'un seul
//    composant, elle vit dans son dossier.
//
// 🎯 La règle qui fait tenir l'ensemble : un composant ne décide jamais
//    d'une couleur, d'un rayon ou d'une taille. Il CHOISIT dans ce
//    contrat, qui lit lui-même les tokens de `@qoe/theme`.
//
//    Conséquence concrète : changer `--radius-button` change les 29
//    composants ; changer `--control-h-md` change leur densité ; personne
//    n'a besoin d'aller dans les écrans.
// =====================================================================

/**
 * Intention sémantique. `neutral` est le défaut, jamais une couleur.
 *
 * `brand` = le vermillon de la maison ; `vivid` = le même orange poussé
 * d'un cran (actions qu'on veut voir, jamais des alertes). `danger` et
 * `success` sont des états, pas des accents : ils ne servent pas à décorer.
 */
export type Tone = 'neutral' | 'brand' | 'vivid' | 'danger' | 'success';

/**
 * Poids visuel du composant.
 * `solid` = action principale, `soft` = action courante, `outline` = action
 * secondaire posée sur une surface, `ghost` = action de barre d'outils.
 */
export type Variant = 'solid' | 'soft' | 'outline' | 'ghost';

/**
 * Densité. 4 pas, alignés sur l'échelle `--control-h-*` du thème.
 * Pas de `xl` : au-delà de 36 px, ce n'est plus un contrôle mais un CTA,
 * et un CTA doit être un cas explicite, pas une taille de plus.
 */
export type Size = 'xs' | 'sm' | 'md' | 'lg';

/**
 * Hauteur + typographie + gouttière interne, par taille.
 * Les valeurs viennent des tokens : `h-control-md` = `--control-h-md`.
 */
export const SIZE_CLASSES: Record<Size, string> = {
  xs: 'h-control-xs gap-1 px-2 type-control-xs',
  sm: 'h-control-sm gap-1.5 px-2.5 type-control-sm',
  md: 'h-control-md gap-1.5 px-3 type-control-md',
  lg: 'h-control-lg gap-2 px-3.5 type-control-lg',
};

/**
 * Champ de saisie (input, combobox, champ de couleur, zone de texte) :
 * hauteur, gouttière et typographie par densité. Le bouton et le champ
 * partagent les mêmes hauteurs, pas les mêmes paddings — un bouton a un
 * libellé centré, un champ a du texte qui commence au bord.
 */
export const FIELD_SIZES: Record<Size, string> = {
  xs: 'h-control-xs px-2 type-control-xs',
  sm: 'h-control-sm px-2.5 type-control-sm',
  md: 'h-control-md px-3 type-control-md',
  lg: 'h-control-lg px-3.5 type-control-lg',
};

/**
 * Densité des éléments de liste (menu, options de sélecteur, de combobox).
 *
 * Un `size` qui ne change que le déclencheur ment : la liste s'ouvre à la
 * même hauteur, et un menu compact reste épais. Ces hauteurs suivent la
 * même échelle que les contrôles.
 */
export const MENU_SIZES: Record<Size, string> = {
  xs: 'min-h-6 px-1.5 type-control-xs',
  sm: 'min-h-7 px-2 type-control-sm',
  md: 'min-h-8 px-2 type-control-md',
  lg: 'min-h-9 px-2.5 type-control-lg',
};

/**
 * Largeur d'un panneau flottant (menu d'actions, liste de sélection).
 *
 * Trois contraintes, et il faut les trois :
 * - `w-max` : c'est le contenu qui décide. Un menu de trois mots courts
 *   n'a aucune raison de faire 224 px ; c'était le cas tant que le
 *   panneau avait un `min-w-56` codé en dur, si bien qu'un déclencheur
 *   `⋯` de 24 px ouvrait un panneau de 224 px.
 * - `min-w-[min(--trigger-width,14rem)]` : le panneau ne devient jamais
 *   plus étroit que son déclencheur — sinon la liste paraît décalée sous
 *   le bouton — mais on plafonne cette assise. Un champ pleine largeur
 *   (formulaire de réglages) ouvrait sinon une liste aussi large que lui,
 *   deux fois plus large que ses options.
 * - `max-w` : un libellé long tronque au lieu de pousser le panneau hors
 *   de l'écran. Le plafond suit `--available-width` quand react-aria le
 *   fournit (bords de fenêtre), avec un repli fixe.
 */
export const MENU_POPOVER_WIDTH =
  'w-max min-w-[min(var(--trigger-width),14rem)] ' +
  'max-w-[min(18rem,calc(var(--available-width)-0.75rem))]';

/**
 * Anneau de focus : identique partout, visible au clavier uniquement.
 * Un anneau qui diffère d'un composant à l'autre est le premier signe
 * d'un design system qui se délite.
 */
export const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-background';

/** État désactivé, pour un `<button disabled>` comme pour un `aria-disabled`. */
export const DISABLED =
  'disabled:pointer-events-none disabled:opacity-50 ' +
  'aria-disabled:pointer-events-none aria-disabled:opacity-50';

/**
 * Icônes : elles suivent la densité du contrôle et ne cassent jamais
 * l'alignement du texte. On cible les `svg` plutôt que d'imposer une prop
 * `icon` — les composants restent composables (`<Button><Plus />Ajouter</Button>`).
 */
export const ICON_SLOT = '[&_svg]:size-3.5 [&_svg]:shrink-0';

/**
 * Surface d'un composant : c'est ici que se joue la cohérence des fonds.
 * `rounded-panel` lit `--radius-card`, `border-border` lit `--border`.
 */
export const SURFACE_BASE = 'rounded-panel border border-border bg-card text-card-foreground';
