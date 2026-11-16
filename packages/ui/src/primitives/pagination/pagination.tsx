'use client';

import { cn } from '@qoe/utils';

import { Button } from '../button/button';
import { IconButton } from '../icon-button/icon-button';
import { Icon } from '../../icons';

// =====================================================================
// 📄 Pagination — les pages, sans trou ni doublon
// =====================================================================
// 📖 Une pagination fausse est un bug silencieux : deux « 4 » cliquables,
//    une ellipse qui masque la page courante, ou un `aria-current` posé
//    sur le mauvais bouton. Le calcul de plage est donc une fonction pure
//    exportée, testable sans rendu.
//
// 🎯 `aria-current="page"` sur la page active, `aria-label` sur chaque
//    numéro (« Page 4 ») et sur le conteneur (« Pagination »). Les flèches
//    sont des `IconButton`, donc nommées et carrées.
// =====================================================================

export type PaginationToken = number | 'ellipsis-start' | 'ellipsis-end';

/**
 * Les jetons à afficher, ellipse comprise.
 *
 * Règle : on garde toujours la première et la dernière page, `siblingCount`
 * voisins de chaque côté de la page courante, et une ellipse seulement si
 * elle masque au moins deux pages — une ellipse qui cache une seule page
 * coûte plus qu'elle ne gagne.
 */
export function paginationRange(
  page: number,
  pageCount: number,
  siblingCount = 1
): PaginationToken[] {
  const total = Math.max(1, Math.floor(pageCount));
  const current = Math.min(Math.max(1, Math.floor(page)), total);
  const siblings = Math.max(0, Math.floor(siblingCount));
  const slots = siblings * 2 + 5;

  if (total <= slots) return range(1, total);

  const leftSibling = Math.max(current - siblings, 1);
  const rightSibling = Math.min(current + siblings, total);
  const showLeftEllipsis = leftSibling > 2;
  const showRightEllipsis = rightSibling < total - 1;

  if (!showLeftEllipsis && showRightEllipsis) {
    const leftItems = 3 + siblings * 2;
    return [...range(1, leftItems), 'ellipsis-end', total];
  }

  if (showLeftEllipsis && !showRightEllipsis) {
    const rightItems = 3 + siblings * 2;
    return [1, 'ellipsis-start', ...range(total - rightItems + 1, total)];
  }

  return [1, 'ellipsis-start', ...range(leftSibling, rightSibling), 'ellipsis-end', total];
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let value = from; value <= to; value += 1) out.push(value);
  return out;
}

export interface PaginationProps {
  /** Page courante, 1-indexée. */
  page: number;
  pageCount: number;
  onPageChange?: (page: number) => void;
  /** Voisins de chaque côté de la page courante. Défaut `1`. */
  siblingCount?: number;
  /** Nom du conteneur (« Pagination des articles »). */
  label?: string;
  className?: string;
}

export function Pagination({
  page,
  pageCount,
  onPageChange,
  siblingCount = 1,
  label = 'Pagination',
  className,
}: PaginationProps) {
  const total = Math.max(1, pageCount);
  const current = Math.min(Math.max(1, page), total);
  const tokens = paginationRange(current, total, siblingCount);

  const go = (target: number) => {
    if (target < 1 || target > total || target === current) return;
    onPageChange?.(target);
  };

  return (
    <nav aria-label={label} className={cn('flex items-center gap-1', className)}>
      <IconButton
        label="Page précédente"
        size="sm"
        variant="ghost"
        tooltip={false}
        disabled={current <= 1}
        onClick={() => go(current - 1)}
      >
        <Icon name="chevron-left" />
      </IconButton>

      {tokens.map((token) =>
        typeof token === 'number' ? (
          <Button
            key={token}
            size="sm"
            variant={token === current ? 'solid' : 'ghost'}
            tone="neutral"
            aria-label={`Page ${token}`}
            aria-current={token === current ? 'page' : undefined}
            onClick={() => go(token)}
            className="min-w-7 px-1.5 font-mono text-[11.5px] tabular-nums"
          >
            {token}
          </Button>
        ) : (
          <span
            key={token}
            aria-hidden
            className="flex size-7 items-center justify-center font-mono text-[11px] text-muted-foreground/70"
          >
            …
          </span>
        )
      )}

      <IconButton
        label="Page suivante"
        size="sm"
        variant="ghost"
        tooltip={false}
        disabled={current >= total}
        onClick={() => go(current + 1)}
      >
        <Icon name="chevron-right" />
      </IconButton>
    </nav>
  );
}
