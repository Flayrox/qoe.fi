'use client';

import { type ComponentProps, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';

import { cn } from '@qoe/utils';
import {
  Cell,
  Column,
  Row,
  Table as AriaTable,
  TableBody as AriaTableBody,
  TableHeader as AriaTableHeader,
  type TableBodyProps as AriaTableBodyProps,
  type TableProps as AriaTableProps,
} from 'react-aria-components';

// =====================================================================
// 📊 Table — une grille qui se lit au clavier
// =====================================================================
// 📖 Un `role="table"` posé sur des `div` ne suffit pas. react-aria donne
//    la navigation entre cellules, l'annonce de la position (« ligne 3
//    sur 12, colonne 2 »), le tri annoncé par `aria-sort` et la sélection
//    qui survit au re-rendu. C'est la raison d'être de cette primitive :
//    sans ça, la table est un tableau de texte pour un lecteur d'écran.
//
// 🎯 Le tri passe par `sortDescriptor` / `onSortChange`, jamais par un
//    `useState` local : la source de vérité reste l'écran qui détient les
//    données, et la flèche affichée est celle de l'état réel.
// =====================================================================

export interface TableProps extends Omit<AriaTableProps, 'className'> {
  className?: string;
}

/**
 * Racine : le cadre, le défilement horizontal, et rien d'autre.
 *
 * Le défilement est porté par un conteneur, pas par la table : un
 * `overflow` sur un élément `table` coupe les ombres et les popovers.
 */
export function Table({ className, ...props }: TableProps) {
  return (
    <div
      className={cn('w-full overflow-x-auto rounded-panel border border-border bg-card', className)}
    >
      <AriaTable
        {...props}
        className="w-full border-collapse text-left outline-hidden [&_td]:border-b [&_td]:border-border/60 [&_th]:border-b [&_th]:border-border"
      />
    </div>
  );
}

export interface TableHeaderProps extends Omit<
  ComponentProps<typeof AriaTableHeader>,
  'className'
> {
  className?: string;
}

export function TableHeader({ className, ...props }: TableHeaderProps) {
  return <AriaTableHeader {...props} className={cn('bg-muted/40', className)} />;
}

export interface TableColumnProps extends Omit<
  ComponentProps<typeof Column>,
  'className' | 'children'
> {
  className?: string;
  children?: ReactNode;
}

/**
 * En-tête de colonne.
 *
 * `allowsSorting` fait de la colonne un bouton : c'est react-aria qui gère
 * la presse et le clavier, nous n'ajoutons que l'icône et la couleur de
 * l'état trié (`aria-sort`, posé par react-aria).
 */
export function TableColumn({ className, children, allowsSorting, ...props }: TableColumnProps) {
  return (
    <Column
      {...props}
      allowsSorting={allowsSorting}
      className={({ allowsSorting: sortable, sortDirection }) =>
        cn(
          'px-3 py-2 type-control-xs font-medium tracking-wide text-muted-foreground uppercase',
          'outline-hidden',
          sortable && 'cursor-pointer select-none hover:text-foreground',
          sortDirection && 'text-foreground',
          className
        )
      }
    >
      {({ allowsSorting: sortable, sortDirection }) => (
        <span className="inline-flex items-center gap-1">
          {children}
          {sortable &&
            (sortDirection === 'ascending' ? (
              <ArrowUp className="size-3 shrink-0" aria-hidden strokeWidth={2} />
            ) : sortDirection === 'descending' ? (
              <ArrowDown className="size-3 shrink-0" aria-hidden strokeWidth={2} />
            ) : (
              <ChevronsUpDown className="size-3 shrink-0 opacity-50" aria-hidden strokeWidth={2} />
            ))}
        </span>
      )}
    </Column>
  );
}

export interface TableBodyProps<T extends object> extends Omit<AriaTableBodyProps<T>, 'className'> {
  className?: string;
  /** Contenu affiché quand aucune ligne ne correspond (filtre vide). */
  emptyState?: ReactNode;
}

export function TableBody<T extends object>({
  className,
  emptyState,
  ...props
}: TableBodyProps<T>) {
  return (
    <AriaTableBody
      {...props}
      className={cn('[&_tr:last-child_td]:border-b-0', className)}
      renderEmptyState={() => (
        <div className="px-3 py-10 text-center type-control-sm text-muted-foreground">
          {emptyState ?? 'Aucun résultat'}
        </div>
      )}
    />
  );
}

export interface TableRowProps extends Omit<ComponentProps<typeof Row>, 'className'> {
  className?: string;
}

export function TableRow({ className, ...props }: TableRowProps) {
  return (
    <Row
      {...props}
      className={({ isSelected, isHovered, isFocusVisible }) =>
        cn(
          'transition-colors outline-hidden',
          isHovered && 'bg-muted/40',
          isSelected && 'bg-primary/5',
          isFocusVisible && 'ring-2 ring-inset ring-ring/60',
          className
        )
      }
    />
  );
}

export interface TableCellProps extends Omit<ComponentProps<typeof Cell>, 'className'> {
  className?: string;
}

export function TableCell({ className, ...props }: TableCellProps) {
  return (
    <Cell
      {...props}
      className={({ isFocusVisible }) =>
        cn(
          'px-3 py-2.5 align-middle type-control-sm text-foreground outline-hidden',
          isFocusVisible && 'ring-2 ring-inset ring-ring/60',
          className
        )
      }
    />
  );
}
