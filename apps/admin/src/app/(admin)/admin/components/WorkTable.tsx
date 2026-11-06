'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@qoe/ui/button';
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@qoe/ui/drawer';
import { CopyableId } from '@/components/shell/CopyableId';
import { DataGrid, type GridColumn } from '@/components/shell/DataGrid';
import { GridViewToolbar } from '@/components/shell/GridView';
import {
  filterRows,
  useGridView,
  type GridFacetDef,
  type GridViewState,
} from '@/components/shell/grid-view';
import { attemptWithStepUp, notifyActionFailure, readMessage } from '@/lib/authz-feedback';
import { triageQueueItemAction } from '@/lib/admin-triage-actions';
import type {
  AdminQueuePriority,
  AdminQueueSLAState,
  AdminQueueTriageEntry,
} from '@/lib/admin-data';

// =====================================================================
// 🗂️ WorkTable — le tableau « À traiter », triable et actionnable
// =====================================================================
// Même contenu que la vue d'ensemble, mais dans une grille dense : tri par
// SLA / priorité / échéance, clic droit pour assigner ou copier l'ID.
// =====================================================================

const PRIORITY_LABELS: Record<AdminQueuePriority, string> = {
  low: 'Basse',
  normal: 'Normale',
  high: 'Haute',
  urgent: 'Urgente',
};

const SLA_LABELS: Record<AdminQueueSLAState, string> = {
  breached: 'SLA dépassé',
  due_soon: 'Échéance proche',
  on_track: 'Dans les temps',
  closed: 'Fermé',
};

const SLA_TONE: Record<AdminQueueSLAState, string> = {
  breached: 'border-destructive/20 bg-destructive/10 text-destructive-text',
  due_soon: 'border-highlight/40 bg-highlight/15 text-highlight',
  on_track: 'border-success/20 bg-success/10 text-success-text',
  closed: 'border-border bg-muted text-muted-foreground',
};

const SLA_RANK: AdminQueueSLAState[] = ['breached', 'due_soon', 'on_track', 'closed'];
const PRIORITY_RANK: AdminQueuePriority[] = ['urgent', 'high', 'normal', 'low'];

function formatDue(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function WorkTable({
  entries,
  queueLabels,
  limit = 20,
}: {
  entries: readonly AdminQueueTriageEntry[];
  queueLabels: Record<string, string>;
  limit?: number;
}) {
  const router = useRouter();
  const [status, setStatus] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<AdminQueueTriageEntry | null>(null);
  const [undoable, setUndoable] = React.useState<AdminQueueTriageEntry[]>([]);
  const grid = useGridView('admin.work', { column: 'sla', direction: 'ascending' });

  const assign = (entry: AdminQueueTriageEntry) => {
    void (async () => {
      const result = await attemptWithStepUp(
        () =>
          triageQueueItemAction({
            queue: entry.queue,
            id: entry.id,
            priority: entry.priority,
            dueAt: entry.dueAt ?? '',
            assignToMe: true,
            clearAssignee: false,
          }),
        { reason: 'Assigner un dossier de la file staff' }
      );
      if (result.ok) {
        setStatus(`Assigné · audité à ${new Date().toLocaleTimeString('fr-FR')}`);
        router.refresh();
        return;
      }
      notifyActionFailure(result, readMessage(result) ?? 'Assignation impossible');
    })();
  };

  const assignMany = (rows: AdminQueueTriageEntry[]) => {
    void (async () => {
      for (const row of rows) {
        const result = await attemptWithStepUp(
          () =>
            triageQueueItemAction({
              queue: row.queue,
              id: row.id,
              priority: row.priority,
              dueAt: row.dueAt ?? '',
              assignToMe: true,
              clearAssignee: false,
            }),
          { reason: 'Assigner une sélection de dossiers' }
        );
        if (!result.ok) {
          notifyActionFailure(result, readMessage(result) ?? 'Assignation impossible');
          return;
        }
      }
      setStatus(
        `${rows.length} dossier(s) assigné(s) · audité à ${new Date().toLocaleTimeString('fr-FR')}`
      );
      router.refresh();
    })();
  };

  const undoAssign = (rows: AdminQueueTriageEntry[]) => {
    void (async () => {
      for (const row of rows) {
        const result = await attemptWithStepUp(
          () =>
            triageQueueItemAction({
              queue: row.queue,
              id: row.id,
              priority: row.priority,
              dueAt: row.dueAt ?? '',
              assignToMe: false,
              clearAssignee: true,
            }),
          { reason: 'Annuler une assignation groupée' }
        );
        if (!result.ok) {
          notifyActionFailure(result, readMessage(result) ?? 'Annulation impossible');
          return;
        }
      }
      setUndoable([]);
      setStatus(
        `Assignation annulée sur ${rows.length} dossier(s) · audité à ${new Date().toLocaleTimeString('fr-FR')}`
      );
      router.refresh();
    })();
  };

  const columns: GridColumn<AdminQueueTriageEntry>[] = [
    {
      id: 'dossier',
      header: 'Dossier',
      sort: { kind: 'text', value: (row) => row.title },
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="w-[88px] shrink-0 truncate text-[10px] uppercase tracking-wide text-muted-foreground">
            {queueLabels[row.queue] ?? row.queue}
          </span>
          <Link
            href={row.href}
            title={row.title}
            className="min-w-0 flex-1 truncate font-medium text-foreground hover:underline"
          >
            {row.title}
          </Link>
          <CopyableId id={row.id} max={6} />
        </div>
      ),
    },
    {
      id: 'assigned',
      header: 'Assigné',
      sort: { kind: 'text', value: (row) => row.assignedName ?? '' },
      cell: (row) =>
        row.assignedName ? (
          <span className="text-muted-foreground">{row.assignedName}</span>
        ) : (
          <span className="text-muted-foreground/70">Libre</span>
        ),
    },
    {
      id: 'priority',
      header: 'Priorité',
      sort: { kind: 'rank', rank: PRIORITY_RANK, value: (row) => row.priority },
      cell: (row) => <span className="text-muted-foreground">{PRIORITY_LABELS[row.priority]}</span>,
    },
    {
      id: 'sla',
      header: 'SLA',
      sort: { kind: 'rank', rank: SLA_RANK, value: (row) => row.slaState },
      cell: (row) => (
        <span
          className={`inline-flex rounded-full border px-1.5 py-0 text-[10px] font-medium ${SLA_TONE[row.slaState]}`}
        >
          {SLA_LABELS[row.slaState]}
        </span>
      ),
    },
    {
      id: 'due',
      header: 'Échéance',
      align: 'right',
      sort: {
        kind: 'number',
        value: (row) => new Date(row.dueAt ?? row.slaDueAt).getTime(),
      },
      cell: (row) => (
        <span className="tabular-nums text-muted-foreground">
          {formatDue(row.dueAt ?? row.slaDueAt)}
        </span>
      ),
    },
  ];

  const facetDefs: GridFacetDef<AdminQueueTriageEntry>[] = [
    {
      id: 'queue',
      label: 'File',
      values: Object.entries(queueLabels).map(([id, label]) => ({
        id,
        label,
        test: (row) => row.queue === id,
      })),
    },
    {
      id: 'sla',
      label: 'SLA',
      values: SLA_RANK.map((state) => ({
        id: state,
        label: SLA_LABELS[state],
        test: (row) => row.slaState === state,
      })),
    },
  ];
  const visible = filterRows(entries, grid.state.facets, facetDefs).slice(0, limit);

  return (
    <div className="space-y-1.5">
      <GridViewToolbar
        state={grid.state}
        onChange={grid.update}
        onToggleFacet={grid.toggleFacet}
        onToggleColumn={grid.toggleColumn}
        onReset={grid.reset}
        facets={facetDefs}
        columns={columns.map((column) => ({ id: column.id, label: column.id }))}
        views={grid.views}
        onSaveView={grid.saveView}
        onApplyView={grid.applyView}
        onRemoveView={grid.removeView}
        count={visible.length}
      />
      {status && (
        <p role="status" className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{status}</span>
          {undoable.length > 0 && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="h-5 px-1 text-[11px] underline underline-offset-2"
              onClick={() => undoAssign(undoable)}
            >
              Annuler
            </Button>
          )}
        </p>
      )}
      <DataGrid
        ariaLabel="Dossiers à traiter"
        rows={visible}
        columns={columns}
        initialSort={{ column: 'sla', direction: 'ascending' }}
        sort={grid.state.sort}
        onSortChange={(sort) => grid.update({ sort } as Partial<GridViewState>)}
        hiddenColumns={grid.state.hidden}
        density={grid.state.density}
        emptyState="Aucun dossier ouvert : les six files sont vides."
        selectable
        rowHref={(row) => row.href}
        onRowOpen={(row) => setPreview(row)}
        onAssign={(rows) => assignMany(rows)}
        bulkActions={(rows) => (
          <Button
            type="button"
            size="xs"
            variant="soft"
            tone="brand"
            className="h-6 px-1.5 text-[11px]"
            onClick={() => assignMany(rows)}
          >
            M’assigner
          </Button>
        )}
        rowMenu={(row) => [
          {
            id: 'preview',
            label: 'Aperçu du dossier',
            shortcut: '↵',
            onSelect: () => setPreview(row),
          },
          { id: 'open', label: 'Ouvrir le dossier', onSelect: () => router.push(row.href) },
          { id: 'assign', label: 'M’assigner', onSelect: () => assign(row) },
          {
            id: 'copy',
            label: 'Copier l’identifiant',
            shortcut: '⌘C',
            onSelect: () => void navigator.clipboard.writeText(row.id),
          },
          {
            id: 'audit',
            label: 'Voir l’audit',
            onSelect: () => router.push(`/admin/audit?subject=${encodeURIComponent(row.id)}`),
          },
        ]}
      />

      <Drawer
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
        width="md"
      >
        {preview && (
          <DrawerContent aria-label="Aperçu du dossier">
            <DrawerHeader>
              <DrawerTitle>
                {queueLabels[preview.queue] ?? preview.queue} · {preview.title}
              </DrawerTitle>
            </DrawerHeader>
            <DrawerBody>
              <dl className="grid grid-cols-[112px_1fr] gap-x-3 gap-y-2 text-[12px]">
                <dt className="text-muted-foreground">Identifiant</dt>
                <dd>
                  <CopyableId id={preview.id} />
                </dd>
                <dt className="text-muted-foreground">File</dt>
                <dd>{queueLabels[preview.queue] ?? preview.queue}</dd>
                <dt className="text-muted-foreground">Priorité</dt>
                <dd>{PRIORITY_LABELS[preview.priority]}</dd>
                <dt className="text-muted-foreground">SLA</dt>
                <dd>{SLA_LABELS[preview.slaState]}</dd>
                <dt className="text-muted-foreground">Échéance</dt>
                <dd className="tabular-nums">{formatDue(preview.dueAt)}</dd>
                <dt className="text-muted-foreground">Assigné</dt>
                <dd>{preview.assignedName ?? '—'}</dd>
              </dl>
            </DrawerBody>
            <DrawerFooter>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="xs"
                  variant="soft"
                  tone="brand"
                  onClick={() => assign(preview)}
                >
                  M’assigner
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => router.push(preview.href)}
                >
                  Ouvrir
                </Button>
                <DrawerClose>
                  <Button type="button" size="xs" variant="ghost">
                    Fermer
                  </Button>
                </DrawerClose>
              </div>
            </DrawerFooter>
          </DrawerContent>
        )}
      </Drawer>
    </div>
  );
}
