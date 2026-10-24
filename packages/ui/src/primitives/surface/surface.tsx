'use client';

import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@qoe/utils';

import { SURFACE_BASE } from '../contract';

export type SurfaceVariant = 'base' | 'sunken' | 'elevated';
export type SurfacePadding = 'none' | 'sm' | 'md' | 'lg';

const VARIANTS: Record<SurfaceVariant, string> = {
  base: SURFACE_BASE,
  sunken: 'rounded-panel border border-border/60 bg-secondary text-secondary-foreground',
  elevated: cn(SURFACE_BASE, 'shadow-sm'),
};

const PADDING: Record<SurfacePadding, string> = {
  none: '',
  sm: 'p-2',
  md: 'p-3',
  lg: 'p-5',
};

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  /** `base` = carte standard, `sunken` = creux (fond de liste), `elevated` = flottant. */
  variant?: SurfaceVariant;
  padding?: SurfacePadding;
}

/**
 * La surface neutre du système : un conteneur qui porte le fond, la
 * bordure et le rayon — et rien d'autre.
 *
 * C'est le seul endroit qui décide « à quoi ressemble un bloc » :
 * `Card`, les panneaux du lab et les feuilles s'en servent, donc changer
 * `--radius-card` ou `--card` change tous les blocs de l'app d'un coup.
 */
export const Surface = forwardRef<HTMLDivElement, SurfaceProps>(function Surface(
  { variant = 'base', padding = 'none', className, ...props },
  ref
) {
  return (
    <div ref={ref} className={cn(VARIANTS[variant], PADDING[padding], className)} {...props} />
  );
});
