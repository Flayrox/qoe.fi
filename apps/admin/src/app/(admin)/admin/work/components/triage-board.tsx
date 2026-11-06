'use client';

// Tableau de triage de « Ma file » : chaque ligne porte les mêmes champs pour
// les six files. Une écriture passe par `attemptWithStepUp` : les files dont la
// capacité est un pouvoir de décision (recours, anti-abus, imports, doubles
// validations) exigent une preuve forte récente, et l'écran propose alors la
// vérification puis rejoue la même action — sans perdre la saisie.

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { attemptWithStepUp, notifyActionFailure, readMessage } from '@/lib/authz-feedback';
import { triageQueueItemAction, type TriageActionInput } from '@/lib/admin-triage-actions';
import type {
  AdminQueuePriority,
  AdminQueueTriageEntry,
  AdminWorkQueueView,
} from '@/lib/admin-data';

const PRIORITIES: { value: AdminQueuePriority; label: string }[] = [
  { value: 'low', label: 'Basse' },
  { value: 'normal', label: 'Normale' },
  { value: 'high', label: 'Haute' },
  { value: 'urgent', label: 'Urgente' },
];

const SLA_LABELS: Record<string, string> = {
  breached: 'SLA dépassé',
  due_soon: 'Échéance proche',
  on_track: 'Dans les temps',
  closed: 'Fermé',
};

const SLA_CLASSES: Record<string, string> = {
  breached: 'bg-destructive/10 text-destructive-text border-destructive/20',
  due_soon: 'bg-highlight/15 text-highlight border-highlight/40',
  on_track: 'bg-success/10 text-success-text border-success/20',
  closed: 'bg-muted text-muted-foreground border-border',
};

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

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('fr-FR');
}

function TriageRow({
  entry,
  label,
  onDone,
}: {
  entry: AdminQueueTriageEntry;
  label: string;
  onDone: () => void;
}) {
  const [priority, setPriority] = useState<AdminQueuePriority>(entry.priority ?? 'normal');
  const [dueInput, setDueInput] = useState<string>(toLocalInput(entry.dueAt));
  const [assignMode, setAssignMode] = useState<'keep' | 'me' | 'clear'>('keep');
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const submit = () => {
    startTransition(async () => {
      const input: TriageActionInput = {
        queue: entry.queue,
        id: entry.id,
        priority,
        dueAt: dueInput ? new Date(dueInput).toISOString() : '',
        assignToMe: assignMode === 'me',
        clearAssignee: assignMode === 'clear',
      };
      const result = await attemptWithStepUp(() => triageQueueItemAction(input), {
        reason: 'Trier un dossier de la file staff',
      });
      if (result.ok) {
        setSavedAt(new Date().toLocaleTimeString('fr-FR'));
        setAssignMode('keep');
        onDone();
        return;
      }
      notifyActionFailure(result, readMessage(result) ?? 'Triage impossible');
    });
  };

  return (
    <tr className="border-t border-border/60 align-top">
      <td className="px-4 py-4">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <Link href={entry.href} className="mt-1 block text-sm font-medium hover:underline">
          {entry.title}
        </Link>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {entry.status} · {entry.id}
        </p>
      </td>

      <td className="px-4 py-4 text-sm">
        {entry.assignedName ?? <span className="text-muted-foreground">Libre</span>}
        {entry.assignedToMe ? (
          <span className="ml-2 rounded-full border border-[#EE4B2B]/30 bg-[#EE4B2B]/5 px-2 py-0.5 text-[10px] text-[#B5371C]">
            moi
          </span>
        ) : null}
      </td>

      <td className="px-4 py-4">
        <span
          className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium ${
            SLA_CLASSES[entry.slaState] ?? SLA_CLASSES.on_track
          }`}
        >
          {SLA_LABELS[entry.slaState] ?? entry.slaState}
        </span>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {formatDate(entry.dueAt ?? entry.slaDueAt)}
        </p>
      </td>

      <td className="px-4 py-4">
        <div className="flex flex-col gap-2">
          <select
            aria-label={`Priorité de ${entry.title}`}
            value={priority}
            onChange={(event) => setPriority(event.target.value as AdminQueuePriority)}
            className="rounded-lg border border-border bg-white px-2 py-1.5 text-xs"
          >
            {PRIORITIES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <input
            type="datetime-local"
            aria-label={`Échéance de ${entry.title}`}
            value={dueInput}
            onChange={(event) => setDueInput(event.target.value)}
            className="rounded-lg border border-border bg-white px-2 py-1.5 text-xs"
          />
          <select
            aria-label={`Assignation de ${entry.title}`}
            value={assignMode}
            onChange={(event) => setAssignMode(event.target.value as 'keep' | 'me' | 'clear')}
            className="rounded-lg border border-border bg-white px-2 py-1.5 text-xs"
          >
            <option value="keep">Assignation inchangée</option>
            <option value="me">Me l’assigner</option>
            <option value="clear">Libérer</option>
          </select>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="rounded-lg bg-[#EE4B2B] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {pending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          {savedAt && (
            <p role="status" className="text-[11px] text-muted-foreground">
              Triage enregistré · audité à {savedAt}
            </p>
          )}
        </div>
      </td>
    </tr>
  );
}

export function TriageBoard({ view }: { view: AdminWorkQueueView }) {
  const router = useRouter();
  const labels = new Map(view.items.map((item) => [item.key, item.label]));

  if (view.entries.length === 0) {
    return (
      <div className="rounded-lg border border-border/60 bg-muted/20 p-8 text-center text-sm text-muted-foreground">
        Aucun dossier ouvert dans les six files.
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Triage</h2>
        <p className="text-xs text-muted-foreground">
          Priorité, échéance et assignation sont communes aux six files. L’échéance vide rétablit le
          SLA par défaut de la file.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border/60 bg-white shadow-sm">
        <table className="min-w-[900px] w-full text-left">
          <thead className="bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Dossier</th>
              <th className="px-4 py-3 font-medium">Assigné à</th>
              <th className="px-4 py-3 font-medium">SLA</th>
              <th className="px-4 py-3 font-medium">Triage</th>
            </tr>
          </thead>
          <tbody>
            {view.entries.map((entry) => (
              <TriageRow
                key={`${entry.queue}:${entry.id}`}
                entry={entry}
                label={labels.get(entry.queue) ?? entry.queue}
                onDone={() => router.refresh()}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
