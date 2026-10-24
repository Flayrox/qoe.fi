'use client';

import { type ReactNode } from 'react';
import { cn } from '@qoe/utils';

export interface FieldErrorProps {
  children?: ReactNode;
  /**
   * id du message. Le champ doit le référencer via
   * `aria-describedby={id}` — sans ça, le message est visible mais jamais
   * annoncé par un lecteur d'écran.
   */
  id?: string;
  className?: string;
}

/**
 * Message d'erreur d'un champ.
 *
 * Deux comportements qui font la différence :
 * - `role="alert"` : l'erreur apparaît après une soumission, donc elle doit
 *   être annoncée sans que l'utilisateur ait à la chercher.
 * - `return null` sur un contenu vide : un `<p role="alert">` vide est
 *   annoncé pour rien par certains lecteurs d'écran, et laisse un espace
 *   mort dans la mise en page.
 */
export function FieldError({ children, id, className }: FieldErrorProps) {
  if (children === null || children === undefined || children === '') {
    return null;
  }

  return (
    <p id={id} role="alert" className={cn('type-control-xs text-destructive', className)}>
      {children}
    </p>
  );
}
