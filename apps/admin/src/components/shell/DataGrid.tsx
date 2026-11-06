'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@qoe/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  TableSelectAllCell,
  TableSelectionCell,
  selectionToKeySet,
  sortRows,
  type SelectionLike,
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
  /** Tri contrôlé (URL) ; sinon l'état est local. */
  sort?: SortDescriptorLike;
  onSortChange?: (descriptor: SortDescriptorLike) => void;
  hiddenColumns?: readonly string[];
  density?: 'compact' | 'normal';
  /** Active la colonne de sélection et la barre d'actions groupées. */
  selectable?: boolean;
  bulkActions?: (rows: T[]) => React.ReactNode;
  /** Entrée au clavier : où ouvrir la ligne. */
  rowHref?: (row: T) => string;
  /** Prioritaire sur `rowHref` : ouvre la ligne dans un panneau. */
  onRowOpen?: (row: T) => void;
  /** Raccourci `a` : assigner la sélection (ou la ligne courante). */
  onAssign?: (rows: T[]) => void;
  /** Ordre explicite des colonnes (ids absents = à la fin, ordre déclaré). */
  columnOrder?: readonly string[];
}

export function DataGrid<T extends { id: string }>({
  ariaLabel,
  rows,
  columns,
  initialSort,
  emptyState,
  rowMenu,
  className,
  sort,
  onSortChange,
  hiddenColumns,
  density = 'normal',
  selectable = false,
  bulkActions,
  rowHref,
  onRowOpen,
  onAssign,
  columnOrder,
}: DataGridProps<T>) {
  const router = useRouter();
  const [selectedKeys, setSelectedKeys] = React.useState<Set<string>>(new Set());
  const [cursor, setCursor] = React.useState<number | null>(null);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const [innerSort, setInnerSort] = React.useState<SortDescriptorLike>(
    initialSort ?? { column: columns[0]?.id ?? 'id', direction: 'ascending' }
  );
  const descriptor = sort ?? innerSort;
  const changeSort = (next: SortDescriptorLike) => {
    if (onSortChange) onSortChange(next);
    else setInnerSort(next);
  };

  const visibleColumns = React.useMemo(() => {
    const shown = columns.filter((column) => !hiddenColumns?.includes(column.id));
    if (!columnOrder || columnOrder.length === 0) return shown;
    const rank = new Map(columnOrder.map((id, index) => [id, index]));
    return [...shown].sort(
      (left, right) =>
        (rank.get(left.id) ?? columnOrder.length) - (rank.get(right.id) ?? columnOrder.length)
    );
  }, [columns, hiddenColumns, columnOrder]);
  // Trier sur une colonne masquée n'a plus de sens : on retombe sur la
  // première colonne triable plutôt que de laisser `sortRows` sans spec.
  const effectiveSort: SortDescriptorLike = visibleColumns.some(
    (column) => column.id === descriptor.column && column.sort
  )
    ? descriptor
    : {
        column: visibleColumns.find((column) => column.sort)?.id ?? visibleColumns[0]?.id ?? 'id',
        direction: 'ascending',
      };
  const [menu, setMenu] = React.useState<{ point: { x: number; y: number }; row: T } | null>(null);

  const spec = React.useMemo(
    () =>
      Object.fromEntries(
        visibleColumns.filter((column) => column.sort).map((column) => [column.id, column.sort])
      ) as SortSpec<T>,
    [visibleColumns]
  );
  const sorted = React.useMemo(
    () => sortRows(rows as T[], effectiveSort, spec),
    [rows, effectiveSort, spec]
  );
  const closeMenu = React.useCallback(() => setMenu(null), []);
  const selectedRows = sorted.filter((row) => selectedKeys.has(row.id));

  const moveCursor = (delta: number) => {
    if (sorted.length === 0) return;
    setCursor((current) => {
      const from = current ?? (delta > 0 ? -1 : sorted.length);
      const next = Math.max(0, Math.min(sorted.length - 1, from + delta));
      const element = wrapperRef.current?.querySelectorAll('tbody tr')[next] as
        HTMLElement | undefined;
      element?.scrollIntoView({ block: 'nearest' });
      return next;
    });
  };

  return (
    <div
      ref={wrapperRef}
      className={cn('min-w-0 outline-hidden', className)}
      tabIndex={selectable || rowHref || onRowOpen ? 0 : undefined}
      onKeyDown={(event) => {
        const tag = (event.target as HTMLElement).tagName;
        if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A'].includes(tag)) return;
        if (event.key === 'j') {
          event.preventDefault();
          moveCursor(1);
        } else if (event.key === 'k') {
          event.preventDefault();
          moveCursor(-1);
        } else if (event.key === 'x' && selectable) {
          const row = sorted[cursor ?? 0];
          if (!row) return;
          event.preventDefault();
          setSelectedKeys((current) => {
            const next = new Set(current);
            if (next.has(row.id)) next.delete(row.id);
            else next.add(row.id);
            return next;
          });
        } else if (event.key === 'Enter' && (onRowOpen || rowHref)) {
          const row = sorted[cursor ?? 0];
          if (!row) return;
          event.preventDefault();
          if (onRowOpen) onRowOpen(row);
          else if (rowHref) router.push(rowHref(row));
        } else if (event.key === '?') {
          event.preventDefault();
          setHelpOpen((open) => !open);
        } else if (event.key === 'r' && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          router.refresh();
        } else if (event.key === 'a' && onAssign) {
          const rows =
            selectedRows.length > 0 ? selectedRows : [sorted[cursor ?? 0]].filter(Boolean);
          if (rows.length === 0) return;
          event.preventDefault();
          onAssign(rows);
        } else if (event.key === 'Escape') {
          setHelpOpen(false);
          setSelectedKeys(new Set());
          setCursor(null);
        }
      }}
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
      {helpOpen && (
        <div className="mb-1 grid grid-cols-2 gap-x-6 gap-y-1 rounded-md border border-border bg-popover px-3 py-2 text-[11px] text-muted-foreground">
          {[
            ['j / k', 'ligne suivante / précédente'],
            ['x', 'sélectionner la ligne'],
            ['Entrée', 'ouvrir le détail'],
            ['a', 'assigner la sélection'],
            ['r', 'rafraîchir la vue'],
            ['Échap', 'vider la sélection'],
          ].map(([key, label]) => (
            <span key={key} className="flex items-center justify-between gap-3">
              <kbd className="rounded border border-border bg-muted px-1 text-[10px] text-foreground">
                {key}
              </kbd>
              <span>{label}</span>
            </span>
          ))}
        </div>
      )}

      {selectable && selectedRows.length > 0 && (
        <div className="mb-1 flex h-7 items-center gap-2 rounded-md border border-border bg-muted/40 px-2 text-[11px]">
          <span className="tabular-nums text-foreground">{selectedRows.length} sélectionné(s)</span>
          <div className="flex items-center gap-1">
            {bulkActions ? bulkActions(selectedRows) : null}
          </div>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="ml-auto h-6 px-1.5 text-[11px] font-normal text-muted-foreground"
            onClick={() => setSelectedKeys(new Set())}
          >
            Tout désélectionner
          </Button>
        </div>
      )}

      <Table
        aria-label={ariaLabel}
        size="xs"
        selectionMode={selectable ? 'multiple' : undefined}
        selectedKeys={selectable ? selectedKeys : undefined}
        onSelectionChange={
          selectable
            ? (keys) =>
                setSelectedKeys(
                  selectionToKeySet(
                    keys as SelectionLike,
                    sorted.map((row) => row.id)
                  )
                )
            : undefined
        }
        sortDescriptor={effectiveSort}
        onSortChange={changeSort}
        className={`rounded-md border-border/70 ${density === 'compact' ? '[&_td]:py-0 [&_th]:py-0' : ''}`}
      >
        <TableHeader>
          {selectable && <TableSelectAllCell />}
          {visibleColumns.map((column) => (
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
            <TableRow
              id={row.id}
              className={cursor === sorted.indexOf(row) ? 'bg-muted/60' : undefined}
            >
              {selectable && <TableSelectionCell rowId={row.id} />}
              {visibleColumns.map((column) => (
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
