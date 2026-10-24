'use client';

import { type HTMLAttributes } from 'react';
import { cn } from '@qoe/utils';

export interface ButtonGroupProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Colle les boutons en partageant les bordures, au lieu de les espacer.
   * Utile pour un sélecteur d'alignement ou un couple Annuler/Valider.
   */
  attached?: boolean;
  orientation?: 'horizontal' | 'vertical';
}

/**
 * Groupe de boutons.
 *
 * `role="group"` + `aria-label` (à fournir par l'appelant) : un groupe sans
 * nom accessible est annoncé comme une suite de boutons sans contexte.
 *
 * L'implémentation en `attached` utilise des sélecteurs d'enfants plutôt
 * qu'un clonage : les boutons gardent leur identité, leurs props et leur
 * `ref`, et un bouton non-`Button` dans le groupe ne casse rien.
 */
export function ButtonGroup({
  attached = false,
  orientation = 'horizontal',
  className,
  ...props
}: ButtonGroupProps) {
  return (
    <div
      role="group"
      className={cn(
        'inline-flex',
        orientation === 'horizontal' ? 'flex-row items-center' : 'flex-col items-stretch',
        attached
          ? cn(
              'gap-0',
              // Un seul rayon par extrémité, et les bordures internes fusionnées.
              '[&>*]:rounded-none',
              orientation === 'horizontal'
                ? '[&>*:first-child]:rounded-l-control [&>*:last-child]:rounded-r-control [&>*+*]:-ml-px'
                : '[&>*:first-child]:rounded-t-control [&>*:last-child]:rounded-b-control [&>*+*]:-mt-px'
            )
          : 'gap-1.5',
        className
      )}
      {...props}
    />
  );
}
