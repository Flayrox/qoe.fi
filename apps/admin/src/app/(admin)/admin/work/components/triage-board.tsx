'use client';

// Tableau de triage de « Ma file » : chaque ligne porte les mêmes champs pour
// les six files. Une écriture passe par `attemptWithStepUp` : les files dont la
// capacité est un pouvoir de décision (recours, anti-abus, imports, doubles
// validations) exigent une preuve forte récente, et l'écran propose alors la
// vérification puis rejoue la même action — sans perdre la saisie.
//
// Densité : une ligne fait ~26 px, la priorité se change dans la ligne et
// l'échéance au clic, sans bouton « Enregistrer » ni formulaire à trois étages.
// Le reste vit dans le clic droit (assigner, libérer, copier, audit).

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@qoe/ui/button';
import { CopyableId } from '@/components/shell/CopyableId';
import { DataGrid, type GridColumn } from '@/components/shell/DataGrid';
import { GridViewToolbar } from '@/components/shell/GridView';
import { InlineChoice, InlineDate } from '@/components/shell/InlineScalar';
import {
  filterRows,
  useGridView,
  type GridFacetDef,
  type GridViewState,
} from '@/components/shell/grid-view';
import type { RowActionItem } from '@/components/shell/RowMenu';
import { attemptWithStepUp, notifyActionFailure, readMessage } from '@/lib/authz-feedback';
import { triageQueueItemAction, type TriageActionInput } from '@/lib/admin-triage-actions';
import type {
  AdminQueuePriority,
  AdminQueueSLAState,
  AdminQueueTriageEntry,
  AdminWorkQueueView,
} from '@/lib/admin-data';

const PRIORITIES: { id: AdminQueuePriority; label: string }[] = [
  { id: 'low', label: 'Basse' },
  { id: 'normal', label: 'Normale' },
  { id: 'high', label: 'Haute' },
  { id: 'urgent', label: 'Urgente' },
];

const SLA_LABELS: Record<AdminQueueSLAState, string> = {
  breached: 'SLA dépassé',
  due_soon: 'Échéance proche',
  on_track: 'Dans les temps',
  closed: 'Fermé',
};

const SLA_CLASSES: Record<AdminQueueSLAState, string> = {
  breached: 'bg-destructive/10 text-destructive-text border-destructive/20',
  due_soon: 'bg-highlight/15 text-highlight border-highlight/40',
  on_track: 'bg-success/10 text-success-text border-success/20',
  closed: 'bg-muted text-muted-foreground border-border',
};

const SLA_RANK: AdminQueueSLAState[] = ['breached', 'due_soon', 'on_track', 'closed'];
const PRIORITY_RANK: AdminQueuePriority[] = ['urgent', 'high', 'normal', 'low'];

interface UndoSnapshot {
  id: string;
  queue: string;
  priority: AdminQueuePriority;
  dueAt: string | null;
  assignedName: string | null;
}

export function TriageBoard({ view }: { view: AdminWorkQueueView }) {
  const router = useRouter();
  const labels = new Map(view.items.map((item) => [item.key, item.label]));
  const [status, setStatus] = useState<string | null>(null);
  const [undoSnapshots, setUndoSnapshots] = useState<UndoSnapshot[]>([]);
  const grid = useGridView('admin.work.triage', { column: 'sla', direction: 'ascending' });

  const save = async (input: TriageActionInput, message: string): Promise<boolean> => {
    const result = await attemptWithStepUp(() => triageQueueItemAction(input), {
      reason: 'Trier un dossier de la file staff',
    });
    if (result.ok) {
      setStatus(`${message} · audité à ${new Date().toLocaleTimeString('fr-FR')}`);
      router.refresh();
      return true;
    }
    notifyActionFailure(result, readMessage(result) ?? 'Triage impossible');
    return false;
  };

  const patch = (
    entry: AdminQueueTriageEntry,
    changes: Partial<
      Pick<TriageActionInput, 'priority' | 'dueAt' | 'assignToMe' | 'clearAssignee'>
    >,
    message: string
  ): Promise<boolean> =>
    save(
      {
        queue: entry.queue,
        id: entry.id,
        priority: changes.priority ?? entry.priority,
        dueAt: changes.dueAt ?? entry.dueAt ?? '',
        assignToMe: changes.assignToMe ?? false,
        clearAssignee: changes.clearAssignee ?? false,
      },
      message
    );

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
        const ok = await save(
          {
            queue: row.queue,
            id: row.id,
            priority: row.priority,
            dueAt: row.dueAt ?? '',
            assignToMe,
            clearAssignee: !assignToMe,
          },
          assignToMe ? 'Dossier assigné' : 'Assignation libérée'
        );
        if (!ok) return;
      }
      setStatus(
        `${rows.length} dossier(s) ${assignToMe ? 'assigné(s)' : 'libéré(s)'} · audité à ${new Date().toLocaleTimeString('fr-FR')}`
      );
    })();
  };

  const bulkPriority = (rows: AdminQueueTriageEntry[], priority: AdminQueuePriority) => {
    void (async () => {
      setUndoSnapshots(snapshotRows(rows));
      for (const row of rows) {
        const ok = await save(
          {
            queue: row.queue,
            id: row.id,
            priority,
            dueAt: row.dueAt ?? '',
            assignToMe: false,
            clearAssignee: false,
          },
          'Priorité modifiée'
        );
        if (!ok) return;
      }
      setStatus(
        `Priorité passée à ${PRIORITIES.find((p) => p.id === priority)?.label ?? priority} sur ${rows.length} dossier(s) · audité à ${new Date().toLocaleTimeString('fr-FR')}`
      );
    })();
  };

  const bulkDueAt = (rows: AdminQueueTriageEntry[], hoursOffset: number | null) => {
    void (async () => {
      setUndoSnapshots(snapshotRows(rows));
      const targetDue =
        hoursOffset !== null ? new Date(Date.now() + hoursOffset * 3600 * 1000).toISOString() : '';
      for (const row of rows) {
        const ok = await save(
          {
            queue: row.queue,
            id: row.id,
            priority: row.priority,
            dueAt: targetDue,
            assignToMe: false,
            clearAssignee: false,
          },
          'Échéance modifiée'
        );
        if (!ok) return;
      }
      setStatus(
        `Échéance mise à jour sur ${rows.length} dossier(s) · audité à ${new Date().toLocaleTimeString('fr-FR')}`
      );
    })();
  };

  const undoBulk = () => {
    void (async () => {
      const items = [...undoSnapshots];
      for (const item of items) {
        const ok = await save(
          {
            queue: item.queue,
            id: item.id,
            priority: item.priority,
            dueAt: item.dueAt ?? '',
            assignToMe: false,
            clearAssignee: !item.assignedName,
          },
          'Annulation'
        );
        if (!ok) return;
      }
      setUndoSnapshots([]);
      setStatus(
        `Modifications annulées sur ${items.length} dossier(s) · audité à ${new Date().toLocaleTimeString('fr-FR')}`
      );
    })();
  };

  const menu = (entry: AdminQueueTriageEntry): RowActionItem[] => [
    { id: 'open', label: 'Ouvrir le dossier', onSelect: () => router.push(entry.href) },
    {
      id: 'me',
      label: 'M’assigner',
      onSelect: () => patch(entry, { assignToMe: true }, 'Assigné'),
    },
    ...(entry.assignedName
      ? [
          {
            id: 'release',
            label: 'Libérer l’assignation',
            onSelect: () => patch(entry, { clearAssignee: true }, 'Assignation libérée'),
          },
        ]
      : []),
    {
      id: 'copy',
      label: 'Copier l’identifiant',
      shortcut: '⌘C',
      onSelect: () => void navigator.clipboard.writeText(entry.id),
    },
    {
      id: 'audit',
      label: 'Voir l’audit',
      onSelect: () => router.push(`/admin/audit?subject=${encodeURIComponent(entry.id)}`),
    },
  ];

  const columns: GridColumn<AdminQueueTriageEntry>[] = [
    {
      id: 'dossier',
      header: 'Dossier',
      minWidth: 240,
      sort: { kind: 'text', value: (entry) => entry.title },
      cell: (entry) => (
        <div className="flex min-w-0 items-center gap-2">
          <span className="w-[88px] shrink-0 truncate text-[10px] uppercase tracking-wide text-muted-foreground">
            {labels.get(entry.queue) ?? entry.queue}
          </span>
          <Link
            href={entry.href}
            title={entry.title}
            className="min-w-0 flex-1 truncate font-medium text-foreground hover:underline"
          >
            {entry.title}
          </Link>
          <CopyableId id={entry.id} max={6} />
        </div>
      ),
    },
    {
      id: 'assigned',
      header: 'Assigné',
      minWidth: 90,
      sort: { kind: 'text', value: (entry) => entry.assignedName ?? '' },
      cell: (entry) =>
        entry.assignedName ? (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            {entry.assignedName}
            {entry.assignedToMe && (
              <span className="rounded-full border border-[#EE4B2B]/30 bg-[#EE4B2B]/5 px-1 text-[10px] text-[#B5371C]">
                moi
              </span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground/70">Libre</span>
        ),
    },
    {
      id: 'priority',
      header: 'Priorité',
      width: 104,
      minWidth: 104,
      sort: { kind: 'rank', rank: PRIORITY_RANK, value: (entry) => entry.priority },
      cell: (entry) => (
        <InlineChoice
          label={`Priorité de ${entry.title}`}
          value={entry.priority}
          options={PRIORITIES}
          onSave={(nextValue) =>
            patch(entry, { priority: nextValue as AdminQueuePriority }, 'Priorité modifiée')
          }
          onStatus={setStatus}
          successLabel="Priorité modifiée"
        />
      ),
    },
    {
      id: 'sla',
      header: 'SLA',
      minWidth: 90,
      sort: { kind: 'rank', rank: SLA_RANK, value: (entry) => entry.slaState },
      cell: (entry) => (
        <span
          className={`inline-flex rounded-full border px-1.5 py-0 text-[10px] font-medium ${
            SLA_CLASSES[entry.slaState] ?? SLA_CLASSES.on_track
          }`}
        >
          {SLA_LABELS[entry.slaState] ?? entry.slaState}
        </span>
      ),
    },
    {
      id: 'due',
      header: 'Échéance',
      width: 168,
      minWidth: 168,
      sort: {
        kind: 'number',
        value: (entry) => new Date(entry.dueAt ?? entry.slaDueAt).getTime(),
      },
      cell: (entry) => (
        <InlineDate
          label={`Échéance de ${entry.title}`}
          value={entry.dueAt}
          onSave={(nextIso) => patch(entry, { dueAt: nextIso }, 'Échéance modifiée')}
          onStatus={setStatus}
          successLabel="Échéance modifiée"
        />
      ),
    },
  ];

  const facetDefs: GridFacetDef<AdminQueueTriageEntry>[] = [
    {
      id: 'queue',
      label: 'File',
      values: view.items.map((item) => ({
        id: item.key,
        label: item.label,
        test: (entry) => entry.queue === item.key,
      })),
    },
    {
      id: 'priority',
      label: 'Priorité',
      values: PRIORITIES.map((item) => ({
        id: item.id,
        label: item.label,
        test: (entry) => entry.priority === item.id,
      })),
    },
    {
      id: 'sla',
      label: 'SLA',
      values: SLA_RANK.map((state) => ({
        id: state,
        label: SLA_LABELS[state],
        test: (entry) => entry.slaState === state,
      })),
    },
  ];
  const visible = filterRows(view.entries, grid.state.facets, facetDefs);

  if (view.entries.length === 0) {
    return (
      <p className="rounded-md border border-border bg-muted/20 px-3 py-6 text-center text-[12px] text-muted-foreground">
        Aucun dossier ouvert dans les six files.
      </p>
    );
  }

  return (
    <section className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-semibold">Triage</h2>
        <p className="text-[11px] text-muted-foreground">
          Priorité et échéance s’enregistrent à la modification · clic droit pour assigner.
        </p>
      </div>

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
        ariaLabel="Triage des dossiers de la file staff"
        rows={visible}
        columns={columns}
        initialSort={{ column: 'sla', direction: 'ascending' }}
        sort={grid.state.sort}
        onSortChange={(sort) => grid.update({ sort } as Partial<GridViewState>)}
        hiddenColumns={grid.state.hidden}
        density={grid.state.density}
        columnOrder={grid.state.order}
        emptyState="Aucun dossier ouvert dans les six files."
        selectable
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
                    {PRIORITIES.find((item) => item.id === p)?.label ?? p}
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
        rowMenu={menu}
      />
    </section>
  );
}
