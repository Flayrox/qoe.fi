'use client';

import {
  ToggleButton as AriaToggleButton,
  ToggleButtonGroup,
  type ToggleButtonProps,
  type ToggleButtonGroupProps,
} from 'react-aria-components';

import { cn } from '@qoe/utils';

import { buttonClasses } from '../button/button';
import type { Size, Tone, Variant } from '../contract';

// =====================================================================
// 🔘 ToggleButton — un bouton qui reste enfoncé
// =====================================================================
// 📖 La différence avec un bouton normal n'est pas visuelle, elle est
//    sémantique : `aria-pressed`. Un lecteur d'écran annonce « enfoncé »,
//    ce qu'un `className={active && 'bg-primary'}` ne dit jamais.
//
// 🎯 Un seul endroit pour l'état : `isSelected`. Pas de `useState` local,
//    pas de classe conditionnelle laissée à l'appelant.
// =====================================================================

export interface ToggleButtonPrimitiveProps extends Omit<ToggleButtonProps, 'className'> {
  size?: Size;
  tone?: Tone;
  /** Peau au repos. À l'état enfoncé, elle passe en `soft` du même ton. */
  variant?: Variant;
  className?: string;
}

export function ToggleButton({
  size = 'sm',
  tone = 'neutral',
  variant = 'ghost',
  className,
  ...props
}: ToggleButtonPrimitiveProps) {
  return (
    <AriaToggleButton
      {...props}
      className={({ isSelected, isDisabled, isHovered, isFocusVisible, isPressed }) =>
        cn(
          buttonClasses({ variant: isSelected ? 'soft' : variant, tone, size }),
          // L'état enfoncé doit se lire sans couleur : un fond, et un texte
          // qui passe en medium — la graisse ne bouge pas au survol.
          isSelected && 'font-medium',
          isHovered && !isSelected && 'bg-secondary',
          isPressed && 'scale-[0.98]',
          isFocusVisible && 'ring-2 ring-ring/60 ring-offset-2 ring-offset-background',
          isDisabled && 'pointer-events-none opacity-50',
          className
        )
      }
    />
  );
}

export interface ToggleButtonGroupPrimitiveProps extends Omit<ToggleButtonGroupProps, 'className'> {
  className?: string;
  /**
   * `pill` (défaut) : rail arrondi avec fond doux (`bg-muted/60`).
   * `inset` : rail segmenté en creux (`rounded-control bg-muted/40`), la même
   * peau que `Tabs variant="segmented"` — pour les barres d'outils, filtres et réglages.
   */
  variant?: 'pill' | 'inset';
}

/**
 * Groupe de bascules exclusives (un seul choix) ou multiples.
 *
 * Le groupe porte `role="group"` et son nom (`aria-label`), les enfants
 * portent `aria-pressed` : sans le groupe, trois boutons enfoncés ne
 * disent pas qu'ils forment une seule question.
 */
export function ToggleGroup({
  className,
  variant = 'pill',
  ...props
}: ToggleButtonGroupPrimitiveProps) {
  return (
    <ToggleButtonGroup
      {...props}
      data-variant={variant}
      className={cn(
        'inline-flex items-center gap-0.5 p-0.5',
        variant === 'pill' ? 'rounded-control bg-muted/60' : 'rounded-control bg-muted/40',
        className
      )}
    />
  );
}
