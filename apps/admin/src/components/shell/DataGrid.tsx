'use client';

import * as React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  sortRows,
  type ColumnSort,
  type SortDescriptorLike,
  type SortSpec,
} from '@qoe/ui/table';
import { cn } from '@qoe/utils';
import { RowActions, RowActionsSurface, type RowActionItem } from './RowMenu';

// =====================================================================
// 📊 DataGrid — une seule grille pour toutes les listes d'exploitation
// =====================================================================
// Densité `xs` de @qoe/ui/table (~26 px de ligne), tri déclaré par colonne
// (texte / nombre / rang, jamais « alphabétique par défaut »), et clic droit
// sur n'importe quelle cellule d'une ligne.
//
// Le tri est déclaratif : chaque colonne dit ce qu'elle CONTIENT, ce qui
// évite « 10 » avant « 9 » et « Brouillon » avant « Publié ».
// =====================================================================

export interface GridColumn<T> {
  id: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Le tri n'existe que si la colonne déclare sa nature. */
  sort?: ColumnSort<T>;
  width?: number;
  align?: 'left' | 'right';
  className?: string;
}

interface DataGridProps<T extends { id: string }> {
  ariaLabel: string;
  rows: readonly T[];
  columns: GridColumn<T>[];
  initialSort?: SortDescriptorLike;
  emptyState?: React.ReactNode;
  /** Actions de ligne — les mêmes pour le bouton « … » et le clic droit. */
  rowMenu?: (row: T) => RowActionItem[];
  className?: string;
}

export function DataGrid<T extends { id: string }>({
  ariaLabel,
  rows,
  columns,
  initialSort,
  emptyState,
  rowMenu,
  className,
}: DataGridProps<T>) {
  const [descriptor, setDescriptor] = React.useState<SortDescriptorLike>(
    initialSort ?? { column: columns[0]?.id ?? 'id', direction: 'ascending' }
  );
  const [menu, setMenu] = React.useState<{ point: { x: number; y: number }; row: T } | null>(null);

  const spec = React.useMemo(
    () =>
      Object.fromEntries(
        columns.filter((column) => column.sort).map((column) => [column.id, column.sort])
      ) as SortSpec<T>,
    [columns]
  );
  const sorted = React.useMemo(
    () => sortRows(rows as T[], descriptor, spec),
    [rows, descriptor, spec]
  );
  const closeMenu = React.useCallback(() => setMenu(null), []);

  return (
    <div
      className={cn('min-w-0', className)}
      onContextMenu={(event) => {
        if (!rowMenu) return;
        const rowElement = (event.target as HTMLElement).closest('tbody tr');
        if (!rowElement?.parentElement) return;
        // L'index DOM est la seule clé fiable : react-aria ne garantit pas
        // d'attribut d'identifiant sur le `<tr>`, et l'état vide n'est pas
        // un `<tr>`.
        const index = Array.from(rowElement.parentElement.children).indexOf(rowElement);
        const row = sorted[index];
        if (!row) return;
        event.preventDefault();
        setMenu({ point: { x: event.clientX, y: event.clientY }, row });
      }}
    >
      <Table
        aria-label={ariaLabel}
        size="xs"
        sortDescriptor={descriptor}
        onSortChange={setDescriptor}
        className="rounded-md border-border/70"
      >
        <TableHeader>
          {columns.map((column) => (
            <TableColumn
              key={column.id}
              id={column.id}
              width={column.width}
              allowsSorting={Boolean(column.sort)}
              className={column.align === 'right' ? 'text-right' : undefined}
            >
              {column.header}
            </TableColumn>
          ))}
          {rowMenu && (
            <TableColumn id="__row-actions" width={32}>
              <span className="sr-only">Actions</span>
            </TableColumn>
          )}
        </TableHeader>
        <TableBody items={sorted} emptyState={emptyState ?? 'Aucune ligne.'}>
          {(row) => (
            <TableRow id={row.id}>
              {columns.map((column) => (
                <TableCell
                  key={column.id}
                  className={cn(column.align === 'right' && 'text-right', column.className)}
                >
                  {column.cell(row)}
                </TableCell>
              ))}
              {rowMenu && (
                <TableCell className="w-8 text-right">
                  <RowActions items={rowMenu(row)} label="Actions de la ligne" />
                </TableCell>
              )}
            </TableRow>
          )}
        </TableBody>
      </Table>

      {menu && rowMenu && (
        <RowActionsSurface
          items={rowMenu(menu.row)}
          label="Actions de la ligne"
          point={menu.point}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}
