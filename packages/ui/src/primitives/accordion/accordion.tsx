'use client';

import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Button as AriaButton,
  Disclosure,
  DisclosureGroup,
  DisclosurePanel,
  Heading,
  type DisclosureGroupProps,
  type DisclosureProps,
} from 'react-aria-components';

import { cn } from '@qoe/utils';

// =====================================================================
// 🪗 Accordion — sections dépliables
// =====================================================================
// 📖 react-aria gère l'état (`expandedKeys`), le lien
//    `aria-expanded`/`aria-controls` entre le déclencheur et le panneau, la
//    possibilité d'ouvrir plusieurs sections, et le défilement du panneau
//    dans le viewport quand il s'ouvre.
//
// 🎯 Le séparateur est un pseudo-élément de l'item, pas une bordure de plus :
//    le dernier item n'en porte pas, et `hideSeparator` reste possible sans
//    toucher au DOM.
// =====================================================================

export interface AccordionProps extends Omit<DisclosureGroupProps, 'className'> {
  className?: string;
  /** Accordéon en accordéon : une seule section ouverte à la fois. */
  allowsMultipleExpanded?: boolean;
}

export function Accordion({ className, ...props }: AccordionProps) {
  return <DisclosureGroup {...props} className={cn('w-full', className)} />;
}

export interface AccordionItemProps extends Omit<DisclosureProps, 'className' | 'children'> {
  /** Titre de la section. Il devient le nom accessible du déclencheur. */
  title: ReactNode;
  children: ReactNode;
  className?: string;
  /** Supprime le trait de séparation (le dernier item d'une carte). */
  hideSeparator?: boolean;
}

/**
 * Une section : déclencheur + panneau.
 *
 * Le titre est un vrai `h3` (via `Heading`), pas un `div` : les lecteurs
 * d'écran peuvent naviguer de section en section, et le niveau s'aligne sur
 * la hiérarchie de la page.
 */
export function AccordionItem({
  title,
  children,
  className,
  hideSeparator = false,
  ...props
}: AccordionItemProps) {
  return (
    <Disclosure
      {...props}
      className={cn(
        'group border-0',
        !hideSeparator && 'border-b border-border last:border-b-0',
        className
      )}
    >
      <Heading>
        <AriaButton
          slot="trigger"
          className={cn(
            'flex w-full items-center justify-between gap-3 py-3 text-left',
            'type-control-md font-medium text-foreground',
            'outline-hidden transition-colors data-[hovered]:text-primary',
            'focus-visible:rounded-control focus-visible:ring-2 focus-visible:ring-ring/60',
            // La rotation suit `aria-expanded` du déclencheur, pas un
            // attribut du conteneur : c'est l'état réel, et il survit au
            // remaniement du DOM entre react-aria et nous.
            '[&[aria-expanded=true]>svg]:rotate-180'
          )}
        >
          {title}
          <ChevronDown
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground transition-transform duration-200"
            strokeWidth={1.75}
          />
        </AriaButton>
      </Heading>
      <DisclosurePanel className="pb-3 outline-hidden">
        <div className="type-control-sm leading-relaxed text-muted-foreground">{children}</div>
      </DisclosurePanel>
    </Disclosure>
  );
}
