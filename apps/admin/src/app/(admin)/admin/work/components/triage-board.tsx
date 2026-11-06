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

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Select } from '@qoe/ui/select';
import { Input } from '@qoe/ui/ui/input';
import { CopyableId } from '@/components/shell/CopyableId';
import { DataGrid, type GridColumn } from '@/components/shell/DataGrid';
import { GridViewToolbar } from '@/components/shell/GridView';
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

/** Date RFC3339 → valeur d'un input `datetime-local` (heure locale). */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export function TriageBoard({ view }: { view: AdminWorkQueueView }) {
  const router = useRouter();
  const labels = new Map(view.items.map((item) => [item.key, item.label]));
  const [status, setStatus] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const grid = useGridView('admin.work.triage', { column: 'sla', direction: 'ascending' });

  const save = (input: TriageActionInput, message: string) => {
    startTransition(async () => {
      const result = await attemptWithStepUp(() => triageQueueItemAction(input), {
        reason: 'Trier un dossier de la file staff',
      });
      if (result.ok) {
        setStatus(`${message} · audité à ${new Date().toLocaleTimeString('fr-FR')}`);
        router.refresh();
        return;
      }
      notifyActionFailure(result, readMessage(result) ?? 'Triage impossible');
    });
  };

  const patch = (
    entry: AdminQueueTriageEntry,
    changes: Partial<
      Pick<TriageActionInput, 'priority' | 'dueAt' | 'assignToMe' | 'clearAssignee'>
    >,
    message: string
  ) =>
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
      sort: { kind: 'rank', rank: PRIORITY_RANK, value: (entry) => entry.priority },
      cell: (entry) => <PriorityCell entry={entry} onPatch={patch} />,
    },
    {
      id: 'sla',
      header: 'SLA',
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
      sort: {
        kind: 'number',
        value: (entry) => new Date(entry.dueAt ?? entry.slaDueAt).getTime(),
      },
      cell: (entry) => <DueCell entry={entry} onPatch={patch} />,
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
          {pending && ' · enregistrement…'}
        </p>
      </div>

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
        <p role="status" className="text-[11px] text-muted-foreground">
          {status}
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
        emptyState="Aucun dossier ouvert dans les six files."
        rowMenu={menu}
      />
    </section>
  );
}

/** Sélecteur de priorité compact : la modification EST l'enregistrement. */
function PriorityCell({
  entry,
  onPatch,
}: {
  entry: AdminQueueTriageEntry;
  onPatch: (
    entry: AdminQueueTriageEntry,
    changes: { priority: AdminQueuePriority },
    message: string
  ) => void;
}) {
  return (
    <Select
      label={`Priorité de ${entry.title}`}
      hideLabel
      size="xs"
      value={entry.priority}
      options={PRIORITIES}
      onValueChange={(value) =>
        onPatch(entry, { priority: value as AdminQueuePriority }, 'Priorité modifiée')
      }
    />
  );
}

/** Échéance : le champ garde la valeur locale, l'enregistrement part au blur. */
function DueCell({
  entry,
  onPatch,
}: {
  entry: AdminQueueTriageEntry;
  onPatch: (entry: AdminQueueTriageEntry, changes: { dueAt: string }, message: string) => void;
}) {
  const initial = toLocalInput(entry.dueAt);
  const [value, setValue] = useState(initial);

  return (
    <Input
      type="datetime-local"
      aria-label={`Échéance de ${entry.title}`}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        if (value === initial) return;
        onPatch(entry, { dueAt: value ? new Date(value).toISOString() : '' }, 'Échéance modifiée');
      }}
      className="h-6 w-full rounded border-transparent bg-transparent px-1 text-[11px] tabular-nums text-muted-foreground shadow-none hover:border-border focus:border-border focus:bg-background focus:text-foreground focus-visible:ring-0"
    />
  );
}
