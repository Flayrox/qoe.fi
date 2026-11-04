'use client';

import { type DOMAttributes, type ReactElement, type ReactNode } from 'react';
import {
  Focusable,
  Tooltip as AriaTooltip,
  TooltipTrigger,
  type TooltipProps as AriaTooltipProps,
} from 'react-aria-components';

import { cn } from '@qoe/utils';

// =====================================================================
// 💬 Tooltip — infobulle courte sur contrôle muet, sur react-aria
// =====================================================================
// 📖 L'attribut natif `title="..."` s'affiche avec une seconde de retard,
//    ignore le clavier et ne peut pas être stylé. Un `Tooltip` react-aria
//    s'ouvre au survol COMME au focus clavier, se ferme à Échap sans
//    avaler l'événement de la modale parente, et relie l'élément par
//    `aria-describedby`.
//
// 🎯 `Focusable` transmet les gestionnaires directement à l'enfant (ex.
//    notre `<Button shape="icon">`) : aucun `<button>` supplémentaire
//    n'est injecté dans le DOM.
// =====================================================================

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
  /** Texte court (1 ligne ou raccourci clavier). Si vide, le composant rend `children` nu. */
  content: ReactNode;
  /** L'élément interactif décrit par l'infobulle (`<Button>`, lien…). */
  children: ReactElement;
  /** Côté préféré ; react-aria inverse automatiquement près des bords d'écran. */
  placement?: TooltipPlacement;
  /** Délai avant apparition au pointeur (ms). Défaut `400`. */
  delay?: number;
  /** Délai avant fermeture (ms). Défaut `0`. */
  closeDelay?: number;
  /** Distance entre le déclencheur et la bulle (px). Défaut `6`. */
  offset?: AriaTooltipProps['offset'];
  isDisabled?: boolean;
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  className?: string;
}

export function Tooltip({
  content,
  children,
  placement = 'top',
  delay = 400,
  closeDelay = 0,
  offset = 6,
  isDisabled,
  isOpen,
  defaultOpen,
  onOpenChange,
  className,
}: TooltipProps) {
  if (content === null || content === undefined || content === false || content === '') {
    return children;
  }

  return (
    <TooltipTrigger
      delay={delay}
      closeDelay={closeDelay}
      isDisabled={isDisabled}
      isOpen={isOpen}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
    >
      <Focusable>{children as ReactElement<DOMAttributes<Element>, string>}</Focusable>
      <AriaTooltip
        placement={placement}
        offset={offset}
        className={cn(
          'z-50 max-w-xs select-none rounded-control bg-foreground px-2 py-1 type-control-xs font-medium text-background shadow-md',
          'transition duration-150 ease-out data-[entering]:opacity-0 data-[exiting]:opacity-0',
          className
        )}
      >
        {content}
      </AriaTooltip>
    </TooltipTrigger>
  );
}
