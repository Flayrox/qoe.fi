'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@qoe/utils';

import {
  DISABLED,
  FOCUS_RING,
  ICON_SLOT,
  SIZE_CLASSES,
  type Size,
  type Tone,
  type Variant,
} from '../contract';

/**
 * Matrice variante × ton.
 *
 * Volontairement écrite à la main plutôt que générée : chaque case a été
 * choisie pour son contraste réel, et une génération automatique produirait
 * des combinaisons illisibles (`solid` + `success` sur fond clair, etc.).
 * Toute nouvelle case doit être vérifiée dans les deux thèmes.
 */
const SURFACES: Record<Variant, Record<Tone, string>> = {
  solid: {
    neutral: 'bg-foreground text-background hover:bg-foreground/90',
    brand: 'bg-primary text-primary-foreground hover:bg-primary/90',
    danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
    success: 'bg-success text-foreground hover:bg-success/90',
  },
  soft: {
    neutral: 'bg-secondary text-secondary-foreground hover:bg-secondary/70',
    brand: 'bg-primary/10 text-primary hover:bg-primary/15',
    danger: 'bg-destructive/10 text-destructive hover:bg-destructive/15',
    success: 'bg-success/15 text-foreground hover:bg-success/25',
  },
  outline: {
    neutral: 'border border-border bg-transparent text-foreground hover:bg-secondary',
    brand: 'border border-primary/40 bg-transparent text-primary hover:bg-primary/10',
    danger: 'border border-destructive/40 bg-transparent text-destructive hover:bg-destructive/10',
    success: 'border border-success/40 bg-transparent text-foreground hover:bg-success/10',
  },
  ghost: {
    neutral: 'bg-transparent text-foreground hover:bg-secondary',
    brand: 'bg-transparent text-primary hover:bg-primary/10',
    danger: 'bg-transparent text-destructive hover:bg-destructive/10',
    success: 'bg-transparent text-foreground hover:bg-success/10',
  },
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Poids visuel. Défaut `soft` : l'action courante, pas l'action principale. */
  variant?: Variant;
  /** Intention. Défaut `neutral` — la couleur est un choix, pas un défaut. */
  tone?: Tone;
  /** Densité, alignée sur `--control-h-*`. Défaut `md`. */
  size?: Size;
  /**
   * `icon` donne un bouton carré (même largeur que hauteur), sans padding
   * horizontal — le cas de la croix de fermeture ou de l'action de barre.
   * Le libellé reste obligatoire côté accessibilité (`aria-label`).
   */
  shape?: 'default' | 'icon';
  /** Occupe toute la largeur de son conteneur. */
  block?: boolean;
}

/**
 * Le bouton de qoe.fi — et à ce titre le composant de référence du package :
 * tout ce qui suit (champ, onglet, badge) reprend cette structure.
 *
 * Trois décisions à connaître :
 *
 * 1. **`type="button"` par défaut.** Un `<button>` sans `type` dans un
 *    formulaire déclenche un submit : c'est la fuite la plus fréquente des
 *    design systems maison. On inverse le défaut, et `type="submit"` reste
 *    possible explicitement.
 * 2. **Aucune couleur en dur.** Chaque case de `SURFACES` lit un token
 *    sémantique, donc le composant suit les deux thèmes sans code.
 * 3. **`className` est fusionné, pas remplacé.** Le point d'appel peut
 *    ajuster la disposition (largeur, marge), pas l'identité visuelle.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'soft',
    tone = 'neutral',
    size = 'md',
    shape = 'default',
    block = false,
    className,
    type = 'button',
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap',
        'rounded-control font-medium transition-colors duration-150',
        SIZE_CLASSES[size],
        shape === 'icon' && 'aspect-square px-0',
        SURFACES[variant][tone],
        FOCUS_RING,
        DISABLED,
        ICON_SLOT,
        block && 'w-full',
        className
      )}
      {...props}
    />
  );
});
