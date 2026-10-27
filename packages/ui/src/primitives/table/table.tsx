'use client';

import { createContext, useContext, type ComponentProps, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { useTableSelectAllCheckbox, useTableSelectionCheckbox } from 'react-aria';
import {
  Cell,
  Column,
  Row,
  Table as AriaTable,
  TableBody as AriaTableBody,
  TableHeader as AriaTableHeader,
  TableStateContext,
  type TableBodyProps as AriaTableBodyProps,
  type TableProps as AriaTableProps,
} from 'react-aria-components';

import { cn } from '@qoe/utils';

import { Avatar } from '../avatar/avatar';
import { Checkbox, type CheckboxIndicator } from '../checkbox/checkbox';
import type { Size } from '../contract';

// =====================================================================
// 📊 Table — une grille qui se lit au clavier
// =====================================================================
// 📖 Un `role="table"` posé sur des `div` ne suffit pas. react-aria donne
//    la navigation entre cellules, l'annonce de la position (« ligne 3
//    sur 12, colonne 2 »), le tri annoncé par `aria-sort` et la sélection
//    qui survit au re-rendu. C'est la raison d'être de cette primitive :
//    sans ça, la table est un tableau de texte pour un lecteur d'écran.
//
// 🎯 Deux densités utiles : `compact` pour un panneau de bord où l'on
//    survole beaucoup de lignes, `md` pour une liste qu'on lit. La taille
//    descend par contexte jusqu'aux cellules : les appelants n'ont pas à
//    répéter un padding sur trente lignes.
// =====================================================================

const TableSizeContext = createContext<Size>('md');

/** Type de l'état de table, tel que react-aria le passe aux cases. */
type TableStateValue = Parameters<typeof useTableSelectAllCheckbox>[0];

/** Padding et typographie d'une cellule, par densité. */
const CELL_SIZES: Record<Size, string> = {
  xs: 'px-2 py-1 type-control-xs',
  sm: 'px-2.5 py-1.5 type-control-xs',
  md: 'px-3 py-2.5 type-control-sm',
  lg: 'px-4 py-3 type-control-md',
};

const HEAD_SIZES: Record<Size, string> = {
  xs: 'px-2 py-1',
  sm: 'px-2.5 py-1.5',
  md: 'px-3 py-2',
  lg: 'px-4 py-2.5',
};

export interface TableProps extends Omit<AriaTableProps, 'className'> {
  /** Densité des lignes. `compact` pour les listes longues de bureau. */
  size?: Size;
  className?: string;
}

/**
 * Racine : le cadre, le défilement horizontal, et rien d'autre.
 *
 * Le défilement est porté par un conteneur, pas par la table : un
 * `overflow` sur un élément `table` coupe les ombres et les popovers.
 */
export function Table({ size = 'md', className, ...props }: TableProps) {
  return (
    <TableSizeContext.Provider value={size}>
      <div
        className={cn(
          'w-full overflow-x-auto rounded-panel border border-border bg-card',
          className
        )}
      >
        <AriaTable
          {...props}
          className="w-full border-collapse text-left outline-hidden [&_td]:border-b [&_td]:border-border/60 [&_th]:border-b [&_th]:border-border"
        />
      </div>
    </TableSizeContext.Provider>
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
  const size = useContext(TableSizeContext);

  return (
    <Column
      {...props}
      allowsSorting={allowsSorting}
      className={({ allowsSorting: sortable, sortDirection }) =>
        cn(
          HEAD_SIZES[size],
          'type-control-xs font-medium tracking-wide text-muted-foreground uppercase',
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
  const size = useContext(TableSizeContext);

  return (
    <Cell
      {...props}
      className={({ isFocusVisible }) =>
        cn(
          CELL_SIZES[size],
          'align-middle text-foreground outline-hidden',
          isFocusVisible && 'ring-2 ring-inset ring-ring/60',
          className
        )
      }
    />
  );
}

/* ---------------------------------------------------------------------
   Sélection
   --------------------------------------------------------------------- */

/**
 * Cellule d'en-tête de la colonne de sélection (« tout sélectionner »).
 *
 * ⚠️ Le contexte d'état n'existe PAS au moment où react-aria collecte les
 * colonnes : il n'est fourni qu'au rendu. D'où deux composants — la cellule
 * est toujours rendue, et c'est la case, rendue plus bas, qui lit l'état.
 * Lire le contexte ici donnerait une colonne invisible.
 */
export function TableSelectAllCell({
  className,
  indicator,
}: {
  className?: string;
  /** Marque de la case : `check` par défaut, `dot` pour une sélection unique. */
  indicator?: CheckboxIndicator;
}) {
  const size = useContext(TableSizeContext);

  return (
    <Column width={36} className={cn('w-9 px-2 align-middle', HEAD_SIZES[size], className)}>
      <TableSelectAllCheckbox indicator={indicator} />
    </Column>
  );
}

function TableSelectAllCheckbox({ indicator }: { indicator?: CheckboxIndicator }) {
  const state = useContext(TableStateContext);
  if (!state) return null;

  return <TableSelectAllCheckboxInner state={state} indicator={indicator} />;
}

function TableSelectAllCheckboxInner({
  state,
  indicator,
}: {
  state: TableStateValue;
  indicator?: CheckboxIndicator;
}) {
  const { checkboxProps } = useTableSelectAllCheckbox(state);

  // « Tout sélectionner » n'a de sens qu'en sélection multiple. En mode
  // unique, la case d'en-tête cocherait une ligne au hasard.
  if (state.selectionManager.selectionMode !== 'multiple') return null;

  // ⚠️ `slot="selection"` est exigé par react-aria : c'est lui qui rattache
  // la case à la sélection de la table. Sans, il lève « A slot prop is
  // required » au premier rendu.
  return <Checkbox slot="selection" {...checkboxProps} size="sm" indicator={indicator} />;
}

/**
 * Case d'une ligne.
 *
 * La clé est explicite : une cellule ne connaît pas sa ligne, et deviner
 * l'identifiant par l'index casserait la sélection dès qu'une ligne est
 * filtrée. Le libellé vient de react-aria (il cite le contenu de la ligne).
 */
export function TableSelectionCell({
  rowId,
  className,
  indicator,
}: {
  rowId: string | number;
  className?: string;
  /** `dot` rend la colonne lisible comme un choix unique, sans seconde primitive. */
  indicator?: CheckboxIndicator;
}) {
  const size = useContext(TableSizeContext);

  return (
    <Cell className={cn('w-9 px-2 align-middle', CELL_SIZES[size], className)}>
      <TableRowCheckbox rowId={rowId} indicator={indicator} />
    </Cell>
  );
}

function TableRowCheckbox({
  rowId,
  indicator,
}: {
  rowId: string | number;
  indicator?: CheckboxIndicator;
}) {
  const state = useContext(TableStateContext);
  if (!state) return null;

  return <TableRowCheckboxInner rowId={rowId} state={state} indicator={indicator} />;
}

function TableRowCheckboxInner({
  rowId,
  state,
  indicator,
}: {
  rowId: string | number;
  state: TableStateValue;
  indicator?: CheckboxIndicator;
}) {
  const { checkboxProps } = useTableSelectionCheckbox({ key: rowId }, state);

  return <Checkbox slot="selection" {...checkboxProps} size="sm" indicator={indicator} />;
}

/**
 * Cellule « personne » : avatar + nom + texte secondaire.
 *
 * Elle existe en tant que primitive parce que c'est la cellule la plus
 * recopiée des listes du Studio (abonnés, co-auteurs, éditeurs) — et la
 * plus souvent recopiée avec un avatar de 48 px dans une ligne de 40.
 */
export interface TablePersonCellProps {
  name: string;
  src?: string | null;
  /** Courriel, identifiant, rôle. */
  meta?: ReactNode;
  className?: string;
}

export function TablePersonCell({ name, src, meta, className }: TablePersonCellProps) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <Avatar name={name} src={src} size="sm" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-medium text-foreground">{name}</span>
        {meta && <span className="truncate type-control-xs text-muted-foreground">{meta}</span>}
      </span>
    </div>
  );
}
