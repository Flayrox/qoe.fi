import type { ReactNode } from 'react';
import { cn } from '@qoe/utils';

// =====================================================================
// 📋 DescriptionList — les paires « terme / valeur » d'un détail
// =====================================================================
// 📖 Une fiche d'article, un panneau de réglages, un récapitulatif de
//    facture : ce sont toujours des `<dl>`. Les écrire en `div/span`
//    alignés à la main prive le lecteur d'écran du lien entre « Publié le »
//    et sa date.
//
// 🎯 Deux dispositions : `rows` (terme à gauche, valeur à droite, pour les
//    panneaux étroits) et `stacked` (terme au-dessus, pour le mobile et
//    les libellés longs). `columns` répartit les paires sur une grille.
// =====================================================================

export type DescriptionListLayout = 'rows' | 'stacked';

export interface DescriptionItemProps {
  term: ReactNode;
  children: ReactNode;
  /** Précision sous la valeur. */
  hint?: ReactNode;
  className?: string;
}

export function DescriptionItem({ term, children, hint, className }: DescriptionItemProps) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-[11px] font-medium text-muted-foreground">{term}</dt>
      <dd className="mt-0.5 text-[12.5px] leading-snug text-foreground">
        {children}
        {hint && <span className="mt-0.5 block text-[11px] text-muted-foreground">{hint}</span>}
      </dd>
    </div>
  );
}

export interface DescriptionListItem {
  term: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  /** Identifiant stable ; à défaut, l'index est utilisé. */
  id?: string;
}

export interface DescriptionListProps {
  items: DescriptionListItem[];
  layout?: DescriptionListLayout;
  /** Nombre de colonnes sur grand écran. Défaut `1`. */
  columns?: 1 | 2 | 3;
  /** Traits entre les lignes, pour les tableaux de détail. */
  divided?: boolean;
  className?: string;
}

const COLUMNS: Record<1 | 2 | 3, string> = {
  1: 'grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
};

export function DescriptionList({
  items,
  layout = 'rows',
  columns = 1,
  divided = false,
  className,
}: DescriptionListProps) {
  return (
    <dl
      className={cn(
        'grid gap-x-6 gap-y-3',
        COLUMNS[columns],
        layout === 'rows' && columns === 1 && 'gap-y-0',
        className
      )}
    >
      {items.map((item, index) => (
        <div
          key={item.id ?? index}
          className={cn(
            'min-w-0',
            divided && 'border-b border-border/30 pb-2 last:border-0',
            layout === 'rows' &&
              columns === 1 &&
              'grid grid-cols-[minmax(0,10rem)_1fr] items-baseline gap-3 py-1.5'
          )}
        >
          <dt className="text-[11px] font-medium text-muted-foreground">{item.term}</dt>
          <dd className="mt-0.5 min-w-0 text-[12.5px] leading-snug text-foreground">
            {item.value}
            {item.hint && (
              <span className="mt-0.5 block text-[11px] text-muted-foreground">{item.hint}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
