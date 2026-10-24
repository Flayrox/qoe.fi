'use client';

import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '@qoe/utils';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** `interactive` ajoute les états de survol/focus pour une carte cliquable. */
  interactive?: boolean;
  /** Retire le padding interne : la carte devient le cadre d'une liste. */
  flush?: boolean;
}

/**
 * Carte : un cadre, des zones, aucune décision visuelle locale.
 *
 * `overflow-hidden` n'est pas cosmétique : sans lui, l'en-tête et le
 * pied débordent des coins arrondis dès que le rayon augmente.
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { interactive = false, flush = false, className, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(
        'overflow-hidden rounded-panel border border-border bg-card text-card-foreground',
        flush ? '' : 'p-3',
        interactive &&
          'transition-colors hover:border-foreground/15 hover:bg-secondary/40 ' +
            'focus-within:border-foreground/15',
        className
      )}
      {...props}
    />
  );
});

/**
 * En-tête de carte. Sans `divider`, la séparation passe par l'espace :
 * une bordure de plus dans une interface déjà bordée alourdit l'ensemble.
 */
export const CardHeader = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & { divider?: boolean }
>(function CardHeader({ divider = false, className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn('flex flex-col gap-0.5', divider && 'border-b border-border pb-3', className)}
      {...props}
    />
  );
});

export const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(
  function CardTitle({ className, ...props }, ref) {
    return (
      <h3
        ref={ref}
        className={cn('text-sm font-semibold tracking-tight text-foreground', className)}
        {...props}
      />
    );
  }
);

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  HTMLAttributes<HTMLParagraphElement>
>(function CardDescription({ className, ...props }, ref) {
  return (
    <p ref={ref} className={cn('type-control-sm text-muted-foreground', className)} {...props} />
  );
});

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardContent({ className, ...props }, ref) {
    return <div ref={ref} className={cn('pt-2', className)} {...props} />;
  }
);

export const CardFooter = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & { divider?: boolean }
>(function CardFooter({ divider = false, className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cn(
        'flex items-center gap-1.5',
        divider ? 'mt-3 border-t border-border pt-3' : 'mt-2',
        className
      )}
      {...props}
    />
  );
});
