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

interface UndoSnapshot {
  id: string;
  queue: string;
  priority: AdminQueuePriority;
  dueAt: string | null;
  assignedName: string | null;
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
  const [undoSnapshots, setUndoSnapshots] = React.useState<UndoSnapshot[]>([]);
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

  const snapshotRows = (rows: AdminQueueTriageEntry[]): UndoSnapshot[] =>
    rows.map((row) => ({
      id: row.id,
      queue: row.queue,
      priority: row.priority,
      dueAt: row.dueAt,
      assignedName: row.assignedName,
    }));

  const bulkAssign = (rows: AdminQueueTriageEntry[], assignToMe: boolean) => {
    void (async () => {
      setUndoSnapshots(snapshotRows(rows));
      for (const row of rows) {
        const result = await attemptWithStepUp(
          () =>
            triageQueueItemAction({
              queue: row.queue,
              id: row.id,
              priority: row.priority,
              dueAt: row.dueAt ?? '',
              assignToMe,
              clearAssignee: !assignToMe,
            }),
          { reason: assignToMe ? 'Assigner une sélection de dossiers' : 'Libérer une sélection' }
        );
        if (!result.ok) {
          notifyActionFailure(result, readMessage(result) ?? 'Action groupée impossible');
          return;
        }
      }
      setStatus(
        `${rows.length} dossier(s) ${assignToMe ? 'assigné(s)' : 'libéré(s)'} · audité à ${new Date().toLocaleTimeString('fr-FR')}`
      );
      router.refresh();
    })();
  };

  const bulkPriority = (rows: AdminQueueTriageEntry[], priority: AdminQueuePriority) => {
    void (async () => {
      setUndoSnapshots(snapshotRows(rows));
      for (const row of rows) {
        const result = await attemptWithStepUp(
          () =>
            triageQueueItemAction({
              queue: row.queue,
              id: row.id,
              priority,
              dueAt: row.dueAt ?? '',
              assignToMe: false,
              clearAssignee: false,
            }),
          { reason: 'Modifier la priorité d’une sélection' }
        );
        if (!result.ok) {
          notifyActionFailure(result, readMessage(result) ?? 'Modification groupée impossible');
          return;
        }
      }
      setStatus(
        `Priorité passée à ${PRIORITY_LABELS[priority]} sur ${rows.length} dossier(s) · audité à ${new Date().toLocaleTimeString('fr-FR')}`
      );
      router.refresh();
    })();
  };

  const bulkDueAt = (rows: AdminQueueTriageEntry[], hoursOffset: number | null) => {
    void (async () => {
      setUndoSnapshots(snapshotRows(rows));
      const targetDue =
        hoursOffset !== null ? new Date(Date.now() + hoursOffset * 3600 * 1000).toISOString() : '';
      for (const row of rows) {
        const result = await attemptWithStepUp(
          () =>
            triageQueueItemAction({
              queue: row.queue,
              id: row.id,
              priority: row.priority,
              dueAt: targetDue,
              assignToMe: false,
              clearAssignee: false,
            }),
          { reason: 'Modifier l’échéance d’une sélection' }
        );
        if (!result.ok) {
          notifyActionFailure(result, readMessage(result) ?? 'Modification d’échéance impossible');
          return;
        }
      }
      setStatus(
        `Échéance mise à jour sur ${rows.length} dossier(s) · audité à ${new Date().toLocaleTimeString('fr-FR')}`
      );
      router.refresh();
    })();
  };

  const undoBulk = () => {
    void (async () => {
      const items = [...undoSnapshots];
      for (const item of items) {
        const result = await attemptWithStepUp(
          () =>
            triageQueueItemAction({
              queue: item.queue,
              id: item.id,
              priority: item.priority,
              dueAt: item.dueAt ?? '',
              assignToMe: false,
              clearAssignee: !item.assignedName,
            }),
          { reason: 'Annuler les modifications groupées' }
        );
        if (!result.ok) {
          notifyActionFailure(result, readMessage(result) ?? 'Annulation impossible');
          return;
        }
      }
      setUndoSnapshots([]);
      setStatus(
        `Modifications annulées sur ${items.length} dossier(s) · audité à ${new Date().toLocaleTimeString('fr-FR')}`
      );
      router.refresh();
    })();
  };

  const columns: GridColumn<AdminQueueTriageEntry>[] = [
    {
      id: 'dossier',
      header: 'Dossier',
      minWidth: 240,
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
      minWidth: 90,
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
      minWidth: 80,
      sort: { kind: 'rank', rank: PRIORITY_RANK, value: (row) => row.priority },
      cell: (row) => <span className="text-muted-foreground">{PRIORITY_LABELS[row.priority]}</span>,
    },
    {
      id: 'sla',
      header: 'SLA',
      minWidth: 90,
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
      minWidth: 100,
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
        onMoveColumn={(id, delta) =>
          grid.moveColumn(
            id,
            delta,
            columns.map((column) => column.id)
          )
        }
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
          {undoSnapshots.length > 0 && (
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="h-5 px-1 text-[11px] underline underline-offset-2"
              onClick={undoBulk}
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
        columnOrder={grid.state.order}
        emptyState="Aucun dossier ouvert : les six files sont vides."
        selectable
        rowHref={(row) => row.href}
        onRowOpen={(row) => setPreview(row)}
        onAssign={(rows) => bulkAssign(rows, true)}
        bulkActions={(rows) => (
          <>
            <Button
              type="button"
              size="xs"
              variant="soft"
              tone="brand"
              className="h-6 px-1.5 text-[11px]"
              onClick={() => bulkAssign(rows, true)}
            >
              M’assigner
            </Button>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="h-6 px-1.5 text-[11px] text-muted-foreground"
              onClick={() => bulkAssign(rows, false)}
            >
              Libérer
            </Button>
            <details className="relative">
              <summary className="cursor-pointer list-none rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
                Priorité ▾
              </summary>
              <div className="absolute left-0 z-30 mt-1 flex flex-col gap-0.5 rounded-md border border-border bg-popover p-1 text-[11px] shadow-lg">
                {PRIORITY_RANK.map((p) => (
                  <Button
                    key={p}
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => bulkPriority(rows, p)}
                    className="h-6 justify-start px-2 font-normal text-foreground"
                  >
                    {PRIORITY_LABELS[p]}
                  </Button>
                ))}
              </div>
            </details>
            <details className="relative">
              <summary className="cursor-pointer list-none rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground [&::-webkit-details-marker]:hidden">
                Échéance ▾
              </summary>
              <div className="absolute left-0 z-30 mt-1 flex flex-col gap-0.5 rounded-md border border-border bg-popover p-1 text-[11px] shadow-lg">
                {[
                  { label: '+24 heures', hours: 24 },
                  { label: '+48 heures', hours: 48 },
                  { label: '+7 jours', hours: 168 },
                  { label: 'Effacer', hours: null },
                ].map((item) => (
                  <Button
                    key={item.label}
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={() => bulkDueAt(rows, item.hours)}
                    className="h-6 justify-start px-2 font-normal text-foreground"
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </details>
          </>
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
