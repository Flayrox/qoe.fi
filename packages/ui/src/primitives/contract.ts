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

/** Intention sémantique. `neutral` est le défaut, jamais une couleur. */
export type Tone = 'neutral' | 'brand' | 'danger' | 'success';

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
