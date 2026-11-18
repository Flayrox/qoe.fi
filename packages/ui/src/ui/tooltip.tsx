'use client';

import * as React from 'react';
import type { DOMAttributes, ReactElement } from 'react';
import {
  Focusable,
  TooltipTrigger as AriaTooltipTrigger,
  Tooltip as AriaTooltip,
  OverlayArrow,
  type TooltipProps as AriaTooltipProps,
} from 'react-aria-components';
import { cn } from '@qoe/utils';

/**
 * Délai par défaut des infobulles de l'arbre.
 *
 * ⚠️ `TooltipProvider` ignorait complètement sa prop `delay` (il rendait ses
 * enfants dans un fragment) : l'éditeur demandait 450 ms, le teaser de
 * fonctionnalité 100 ms, et tout le monde obtenait les 300 ms de `Tooltip`.
 * Le délai vit maintenant dans un contexte que `Tooltip` lit par défaut.
 */
const TooltipDelayContext = React.createContext<number | undefined>(undefined);

/** Intervalle de base, quand ni le provider ni l'appelant ne décident. */
const DEFAULT_TOOLTIP_DELAY = 300;

/**
 * Résolution du délai : l'infobulle gagne, puis le provider, puis le défaut.
 * Extraite pour être testable — c'était précisément la règle qui manquait
 * (le provider ne participait pas du tout à la résolution).
 */
export function resolveTooltipDelay(delay?: number, providerDelay?: number): number {
  return delay ?? providerDelay ?? DEFAULT_TOOLTIP_DELAY;
}

export function TooltipProvider({
  children,
  delay,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  return <TooltipDelayContext.Provider value={delay}>{children}</TooltipDelayContext.Provider>;
}

export function Tooltip({
  children,
  delay,
  ...props
}: {
  children: React.ReactNode;
  delay?: number;
  [key: string]: unknown;
}) {
  const providerDelay = React.useContext(TooltipDelayContext);
  const resolvedDelay = resolveTooltipDelay(delay, providerDelay);

  // ⚠️ react-aria ne clone pas le déclencheur : il publie ses props dans un
  // contexte que seuls ses propres composants (`Button`, `Focusable`…)
  // consomment. Un `<button>` nu en enfant de `TooltipTrigger` ne recevait
  // donc AUCUN gestionnaire — ni survol, ni focus, ni Échap — et aucune
  // infobulle du produit ne s'ouvrait (l'icône « (i) » des fonctionnalités à
  // venir était un bouton muet). `Focusable` branche les props sur l'élément
  // fourni sans ajouter de balise au DOM.
  const [trigger, ...rest] = React.Children.toArray(children);
  const isElement = React.isValidElement(trigger);

  return (
    <AriaTooltipTrigger delay={resolvedDelay} {...props}>
      {isElement ? (
        <Focusable>{trigger as ReactElement<DOMAttributes<Element>, string>}</Focusable>
      ) : (
        trigger
      )}
      {rest}
    </AriaTooltipTrigger>
  );
}

export function TooltipTrigger({
  children,
  className,
  onClick,
  disabled,
  ...props
}: React.ComponentProps<'button'>) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={className} {...props}>
      {children}
    </button>
  );
}

export interface TooltipContentProps {
  children: React.ReactNode;
  className?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: string;
  sideOffset?: number;
}

export function TooltipContent({
  children,
  className,
  side = 'top',
  align,
  sideOffset = 4,
}: TooltipContentProps) {
  const placement = align ? (`${side} ${align}` as AriaTooltipProps['placement']) : side;
  return (
    <AriaTooltip
      placement={placement}
      offset={sideOffset}
      className={cn(
        'z-50 inline-flex w-fit max-w-xs items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background shadow-md transition duration-150',
        className
      )}
    >
      <OverlayArrow>
        <svg width={8} height={8} viewBox="0 0 8 8" className="fill-foreground">
          <path d="M0 0 L4 4 L8 0 Z" />
        </svg>
      </OverlayArrow>
      {children}
    </AriaTooltip>
  );
}
