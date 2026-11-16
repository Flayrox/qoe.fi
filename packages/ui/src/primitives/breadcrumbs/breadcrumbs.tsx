import type { ElementType, ReactNode } from 'react';
import { cn } from '@qoe/utils';

import { Icon } from '../../icons';

// =====================================================================
// 🧭 Breadcrumbs — où l'on est, et comment remonter
// =====================================================================
// 📖 Le fil d'Ariane n'est pas une décoration de page : c'est le seul
//    repère quand la barre latérale est repliée sur mobile. Il doit donc
//    être un vrai `<nav>` avec une liste ordonnée, et son dernier élément
//    ne doit pas être un lien (on est déjà là).
//
// 🎯 `linkAs` permet de brancher `next/link` sans que le package UI ne
//    dépende de Next. Sans lui, un `<a href>` suffit.
// =====================================================================

export interface BreadcrumbItem {
  label: string;
  /** Absent sur l'élément courant : il est alors rendu en texte. */
  href?: string;
  /** Icône optionnelle, à gauche du libellé. */
  icon?: ReactNode;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  /** Nom du repère de navigation. */
  label?: string;
  /** Composant de lien de l'application (`next/link`). Défaut `a`. */
  linkAs?: ElementType;
  /** Réduit les libellés longs au lieu de les faire passer à la ligne. */
  truncate?: boolean;
  className?: string;
}

export function Breadcrumbs({
  items,
  label = 'Fil d’Ariane',
  linkAs,
  truncate = true,
  className,
}: BreadcrumbsProps) {
  const Link = linkAs ?? 'a';

  return (
    <nav aria-label={label} className={className}>
      <ol className="flex min-w-0 flex-wrap items-center gap-1">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
              {index > 0 && (
                <Icon
                  name="chevron-right"
                  size="xs"
                  className="text-muted-foreground/50"
                  aria-hidden
                />
              )}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className={cn(
                    'inline-flex min-w-0 items-center gap-1 rounded-tag px-1 py-0.5 text-[12px] text-muted-foreground',
                    'transition-colors hover:bg-muted/60 hover:text-foreground',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                    truncate && 'truncate'
                  )}
                >
                  {item.icon && <span className="shrink-0 [&_svg]:size-3.5">{item.icon}</span>}
                  <span className={cn(truncate && 'truncate')}>{item.label}</span>
                </Link>
              ) : (
                <span
                  aria-current={isLast ? 'page' : undefined}
                  className={cn(
                    'inline-flex min-w-0 items-center gap-1 px-1 py-0.5 text-[12px]',
                    isLast ? 'font-medium text-foreground' : 'text-muted-foreground',
                    truncate && 'truncate'
                  )}
                >
                  {item.icon && <span className="shrink-0 [&_svg]:size-3.5">{item.icon}</span>}
                  <span className={cn(truncate && 'truncate')}>{item.label}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
