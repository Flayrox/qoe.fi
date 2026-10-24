'use client';

import { type HTMLAttributes } from 'react';
import { cn } from '@qoe/utils';

export interface SeparatorProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical';
  /**
   * Un séparateur purement décoratif doit être invisible pour les lecteurs
   * d'écran. Par défaut on le considère décoratif : un trait entre deux
   * sections n'apporte presque jamais d'information sémantique.
   */
  decorative?: boolean;
}

/**
 * Trait de séparation.
 *
 * Détail qui compte : sans `decorative={false}`, on expose
 * `role="presentation"`, sinon un lecteur d'écran annonce « séparateur »
 * à chaque trait — bruit inutile sur les longues pages.
 */
export function Separator({
  orientation = 'horizontal',
  decorative = true,
  className,
  ...props
}: SeparatorProps) {
  return (
    <div
      role={decorative ? 'presentation' : 'separator'}
      aria-orientation={decorative ? undefined : orientation}
      aria-hidden={decorative || undefined}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px self-stretch',
        className
      )}
      {...props}
    />
  );
}
