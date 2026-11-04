'use client';

import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@qoe/utils';

import { type Tone } from '../contract';

// =====================================================================
// 🏷️ Badge — marqueur d'état, de nature ou de compteur
// =====================================================================
// 📖 Un badge informe ; il ne déclenche rien. Dès qu'une pastille devient
//    cliquable ou filtrable, ce n'est plus un `Badge`, c'est un `Tag`
//    (`@qoe/ui/tag-group`) ou un `ToggleButton` (`@qoe/ui/toggle`).
//
// 🎯 Même matrice `Tone` que `Button` : un statut « publié » (`success`),
//    « payant » (`vivid`), « en revue » (`brand`) ou « brouillon »
//    (`neutral`) partage exactement les mêmes jetons sémantiques dans
//    les deux thèmes.
// =====================================================================

export type BadgeVariant = 'soft' | 'outline' | 'solid';
export type BadgeSize = 'xs' | 'sm';

const BADGE_SURFACES: Record<BadgeVariant, Record<Tone, string>> = {
  soft: {
    neutral: 'bg-secondary text-secondary-foreground',
    brand: 'bg-primary/10 text-primary',
    vivid: 'bg-highlight/15 text-highlight',
    danger: 'bg-destructive/10 text-destructive-text',
    success: 'bg-success/15 text-success-text',
  },
  outline: {
    neutral: 'border border-border/70 bg-transparent text-muted-foreground',
    brand: 'border border-primary/35 bg-primary/5 text-primary',
    vivid: 'border border-highlight/35 bg-highlight/10 text-highlight',
    danger: 'border border-destructive/35 bg-destructive/5 text-destructive-text',
    success: 'border border-success/35 bg-success/10 text-success-text',
  },
  solid: {
    neutral: 'bg-foreground text-background',
    brand: 'bg-primary text-primary-foreground',
    vivid: 'bg-brand-vivid text-brand-vivid-foreground',
    danger: 'bg-destructive text-destructive-foreground',
    success: 'bg-success text-success-foreground',
  },
};

const BADGE_SIZES: Record<BadgeSize, string> = {
  xs: 'h-5 gap-1 px-1.5 text-[10.5px] leading-none [&_svg]:size-3',
  sm: 'h-control-xs gap-1.5 px-2 type-control-xs [&_svg]:size-3.5',
};

export interface BadgeStyleOptions {
  variant?: BadgeVariant;
  tone?: Tone;
  size?: BadgeSize;
  shape?: 'rounded' | 'pill';
  className?: string;
}

export function badgeClasses({
  variant = 'soft',
  tone = 'neutral',
  size = 'xs',
  shape = 'rounded',
  className,
}: BadgeStyleOptions = {}) {
  return cn(
    'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium',
    shape === 'pill' ? 'rounded-full' : 'rounded-control',
    BADGE_SIZES[size],
    BADGE_SURFACES[variant][tone],
    '[&_svg]:shrink-0',
    className
  );
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Poids visuel. Défaut `soft` : discret dans une ligne ou un en-tête. */
  variant?: BadgeVariant;
  /** Intention sémantique. Défaut `neutral`. */
  tone?: Tone;
  /** Densité : `xs` (20 px, dans une phrase/en-tête) ou `sm` (24 px, barre). */
  size?: BadgeSize;
  /** `rounded` suit `--radius-button` ; `pill` est réservé aux compteurs/états ronds. */
  shape?: 'rounded' | 'pill';
  /** Point d'état coloré en tête de libellé (`currentColor`). */
  dot?: boolean;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  {
    variant = 'soft',
    tone = 'neutral',
    size = 'xs',
    shape = 'rounded',
    dot = false,
    className,
    children,
    ...props
  },
  ref
) {
  return (
    <span ref={ref} className={badgeClasses({ variant, tone, size, shape, className })} {...props}>
      {dot && <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />}
      {children}
    </span>
  );
});
