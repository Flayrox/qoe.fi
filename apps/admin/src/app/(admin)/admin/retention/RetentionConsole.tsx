'use client';

// =====================================================================
// 🛡️ RetentionConsole — supervision & purge des politiques de rétention
// =====================================================================
// Présentation cockpit des durées de rétention (Art. 5(1)(e) RGPD).
// Permet la simulation (Dry-Run), la purge ciblée ou globale avec step-up
// N2 et l'inspection du journal d'audit scellé.
// =====================================================================

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarClock,
  CheckCircle2,
  Database,
  History,
  Play,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { Button } from '@qoe/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@qoe/ui';
import { DataGrid, type GridColumn } from '@/components/shell/DataGrid';
import type { RowActionItem } from '@/components/shell/RowMenu';
import type {
  RetentionJournalEntry,
  RetentionPolicyRow,
  RetentionPurgeSummary,
} from '@/lib/admin-data';
import { runRetentionPurgeAction } from '@/lib/admin-compliance-actions';
import {
  attemptWithStepUp,
  isFailure,
  notifyActionFailure,
  readMessage,
} from '@/lib/authz-feedback';

function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function RetentionConsole({
  policies,
  journal,
}: {
  policies: RetentionPolicyRow[];
  journal: RetentionJournalEntry[];
}) {
  const router = useRouter();
  const [status, setStatus] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  // Purge confirmation dialog state
  const [targetTable, setTargetTable] = React.useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = React.useState(false);
  const [purgeSummary, setPurgeSummary] = React.useState<RetentionPurgeSummary | null>(null);

  const totalRows = policies.reduce((acc, p) => acc + p.totalRows, 0);
  const expiredRows = policies.reduce((acc, p) => acc + p.expiredRows, 0);
  const protectedCount = policies.filter((p) => p.isProtected).length;

  const triggerPurge = (tableName?: string, dryRun?: boolean) => {
    startTransition(async () => {
      const result = await attemptWithStepUp(() => runRetentionPurgeAction(tableName, dryRun));

      if (isFailure(result) || !('summary' in result)) {
        notifyActionFailure(result, readMessage(result) ?? 'Purge impossible');
        return;
      }

      setPurgeSummary(result.summary);
      const actionLabel = dryRun ? 'Simulation terminée' : 'Purge exécutée';
      setStatus(
        `${actionLabel} (${result.summary.totalDeleted} ligne(s)) · audité à ${new Date().toLocaleTimeString('fr-FR')}`
      );
      setIsConfirmOpen(false);
      setTargetTable(null);
      router.refresh();
    });
  };

  const policyColumns: GridColumn<RetentionPolicyRow>[] = [
    {
      id: 'table',
      header: 'Table & Données',
      sort: { kind: 'text', value: (p) => p.table },
      cell: (p) => (
        <div className="flex min-w-0 flex-col">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-foreground">{p.table}</span>
            {p.isProtected && (
              <span className="inline-flex items-center gap-0.5 rounded border border-neural-blue/30 bg-neural-blue/10 px-1.5 py-0 text-[9px] font-semibold text-neural-blue">
                <ShieldCheck className="h-2.5 w-2.5" /> Protégée
              </span>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground">{p.label}</span>
        </div>
      ),
    },
    {
      id: 'purpose',
      header: 'Finalité & Base légale',
      cell: (p) => (
        <div className="flex min-w-0 flex-col">
          <span className="line-clamp-1 text-[11px] text-foreground" title={p.purpose}>
            {p.purpose}
          </span>
          <span className="line-clamp-1 text-[10px] text-muted-foreground" title={p.legalBasis}>
            {p.legalBasis}
          </span>
        </div>
      ),
    },
    {
      id: 'retention',
      header: 'Règle de rétention',
      width: 170,
      sort: { kind: 'text', value: (p) => p.retentionPeriod },
      cell: (p) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{p.retentionPeriod}</span>
          <span className="text-[10px] tabular-nums text-muted-foreground">{p.purgeRule}</span>
        </div>
      ),
    },
    {
      id: 'totalRows',
      header: 'Lignes',
      width: 100,
      align: 'right',
      sort: { kind: 'number', value: (p) => p.totalRows },
      cell: (p) => (
        <span className="tabular-nums text-muted-foreground">
          {p.totalRows.toLocaleString('fr-FR')}
        </span>
      ),
    },
    {
      id: 'expiredRows',
      header: 'Périmées',
      width: 110,
      align: 'right',
      sort: { kind: 'number', value: (p) => p.expiredRows },
      cell: (p) => {
        if (p.isProtected) {
          return <span className="text-[11px] text-muted-foreground">0</span>;
        }
        if (p.expiredRows > 0) {
          return (
            <span className="inline-flex items-center gap-1 rounded border border-highlight/30 bg-highlight/10 px-2 py-0.5 text-[10px] font-semibold text-highlight tabular-nums">
              <CalendarClock className="h-3 w-3" /> {p.expiredRows.toLocaleString('fr-FR')}
            </span>
          );
        }
        return <span className="text-[11px] tabular-nums text-success-text">0</span>;
      },
    },
    {
      id: 'lastPurge',
      header: 'Dernière purge',
      width: 140,
      sort: { kind: 'text', value: (p) => p.lastPurgeAt ?? '' },
      cell: (p) => (
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {formatDateTime(p.lastPurgeAt)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      width: 120,
      align: 'right',
      cell: (p) => {
        if (p.isProtected) return null;
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="outline"
              size="xs"
              className="h-6 gap-1 px-2 text-[10px]"
              title="Purger cette table"
              onClick={() => {
                setTargetTable(p.table);
                setIsConfirmOpen(true);
              }}
            >
              <Trash2 className="h-3 w-3" /> Purger
            </Button>
          </div>
        );
      },
    },
  ];

  const policyRowMenu = (p: RetentionPolicyRow): RowActionItem[] => {
    if (p.isProtected) return [];
    return [
      {
        id: 'dry-run',
        label: `Simuler la purge (${p.table})`,
        icon: <Play className="h-3.5 w-3.5" />,
        onSelect: () => triggerPurge(p.table, true),
      },
      {
        id: 'purge',
        label: `Exécuter la purge (${p.table})`,
        tone: 'danger' as const,
        icon: <Trash2 className="h-3.5 w-3.5" />,
        onSelect: () => {
          setTargetTable(p.table);
          setIsConfirmOpen(true);
        },
      },
    ];
  };

  const journalColumns: GridColumn<RetentionJournalEntry>[] = [
    {
      id: 'date',
      header: 'Horodatage',
      width: 150,
      sort: { kind: 'text', value: (j) => j.createdAt },
      cell: (j) => (
        <span className="tabular-nums text-muted-foreground">{formatDateTime(j.createdAt)}</span>
      ),
    },
    {
      id: 'table',
      header: 'Table ciblée',
      width: 180,
      sort: { kind: 'text', value: (j) => j.table },
      cell: (j) => <span className="font-medium text-foreground">{j.table}</span>,
    },
    {
      id: 'deleted',
      header: 'Lignes supprimées',
      width: 130,
      align: 'right',
      sort: { kind: 'number', value: (j) => j.deleted },
      cell: (j) => (
        <span
          className={`tabular-nums font-semibold ${
            j.dryRun ? 'text-muted-foreground' : 'text-foreground'
          }`}
        >
          {j.deleted.toLocaleString('fr-FR')} {j.dryRun && '(simulation)'}
        </span>
      ),
    },
    {
      id: 'duration',
      header: 'Durée',
      width: 100,
      align: 'right',
      sort: { kind: 'number', value: (j) => j.durationMs },
      cell: (j) => <span className="tabular-nums text-muted-foreground">{j.durationMs} ms</span>,
    },
    {
      id: 'operator',
      header: 'Opérateur / Acteur',
      cell: (j) => <span className="truncate text-muted-foreground">{j.actorEmail}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      {/* En-tête et métriques globales */}
      <section className="space-y-4 rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">
                Politiques de rétention par table (Art. 5(1)(e) RGPD)
              </h2>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              Chaque table stockant des données personnelles, comportementales ou techniques
              applique une durée de conservation bornée. Les purges sont inaltérablement tracées
              dans le journal d’audit.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {status && (
              <span className="rounded border border-success/20 bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success-text">
                {status}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={pending}
              onClick={() => triggerPurge(undefined, true)}
            >
              <Play className="h-3.5 w-3.5" /> Simuler tout (Dry Run)
            </Button>
            <Button
              tone="danger"
              size="sm"
              className="gap-1.5"
              disabled={pending}
              onClick={() => {
                setTargetTable(null);
                setIsConfirmOpen(true);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Purger les tables
            </Button>
          </div>
        </div>

        {/* Métriques */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded border border-border bg-muted/30 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Tables sous politique
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
              {policies.length}
            </p>
          </div>
          <div className="rounded border border-border bg-muted/30 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Lignes totales
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">
              {totalRows.toLocaleString('fr-FR')}
            </p>
          </div>
          <div className="rounded border border-border bg-muted/30 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Lignes périmées (à purger)
            </p>
            <p
              className={`mt-1 text-2xl font-bold tabular-nums ${
                expiredRows > 0 ? 'text-highlight' : 'text-success-text'
              }`}
            >
              {expiredRows.toLocaleString('fr-FR')}
            </p>
          </div>
          <div className="rounded border border-border bg-muted/30 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Tables protégées
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-neural-blue">
              {protectedCount}
            </p>
          </div>
        </div>

        {/* Bilan de la dernière purge */}
        {purgeSummary && (
          <div className="rounded border border-success/30 bg-success/5 p-4 text-[12px] space-y-2">
            <div className="flex items-center gap-2 font-semibold text-success-text">
              <CheckCircle2 className="h-4 w-4" /> Bilan de l’opération{' '}
              {purgeSummary.dryRun ? '(Simulation)' : '(Exécution réelle)'}
            </div>
            <div className="flex flex-wrap items-center gap-6 text-[11px] text-muted-foreground">
              <div>
                <span className="text-foreground">Lignes concernées :</span>{' '}
                <span className="tabular-nums font-semibold text-foreground">
                  {purgeSummary.totalDeleted.toLocaleString('fr-FR')}
                </span>
              </div>
              <div>
                <span className="text-foreground">Durée totale :</span>{' '}
                <span className="tabular-nums">{purgeSummary.totalDurationMs} ms</span>
              </div>
              <div>
                <span className="text-foreground">Horodatage :</span>{' '}
                <span className="tabular-nums">{purgeSummary.purgedAt}</span>
              </div>
            </div>
          </div>
        )}

        {/* Grille des politiques */}
        <DataGrid
          ariaLabel="Politiques de rétention par table"
          rows={policies.map((p) => ({ ...p, id: p.table }))}
          columns={policyColumns}
          rowMenu={policyRowMenu}
          density="compact"
        />
      </section>

      {/* Journal d'audit des purges */}
      <section className="space-y-4 rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">
              Journal d’audit des purges (AdminAuditLog)
            </h3>
          </div>
          <span className="text-[11px] text-muted-foreground">
            {journal.length} opération(s) enregistrée(s)
          </span>
        </div>

        <DataGrid
          ariaLabel="Journal des purges de rétention"
          rows={journal}
          columns={journalColumns}
          density="compact"
          emptyState={
            <div className="py-8 text-center text-xs text-muted-foreground">
              Aucune purge enregistrée dans le journal.
            </div>
          }
        />
      </section>

      {/* Confirmation Dialog */}
      <Dialog
        isOpen={isConfirmOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsConfirmOpen(false);
            setTargetTable(null);
          }
        }}
        size="md"
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive-text">
              <ShieldAlert className="h-5 w-5" /> Confirmation de purge de rétention
            </DialogTitle>
            <DialogDescription>
              {targetTable ? (
                <>
                  Vous êtes sur le point de purger définitivement les lignes périmées de la table{' '}
                  <span className="font-semibold text-foreground">{targetTable}</span>.
                </>
              ) : (
                <>
                  Vous êtes sur le point de purger définitivement l’ensemble des lignes périmées sur{' '}
                  <strong>toutes les tables éligibles</strong>.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-3">
            <div className="rounded border border-destructive/20 bg-destructive/10 p-3 text-[11px] leading-relaxed text-destructive-text">
              <p className="font-semibold">Conséquences de l’acte :</p>
              <ul className="mt-1 list-disc pl-4 space-y-0.5">
                <li>Suppression définitive et irréversible des enregistrements expirés.</li>
                <li>
                  Consignation inaltérable de l’opération dans le journal d’audit (AdminAuditLog).
                </li>
                <li>Les tables sous protection légale (AdminAuditLog) ne seront pas altérées.</li>
              </ul>
            </div>
          </DialogBody>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                setIsConfirmOpen(false);
                setTargetTable(null);
              }}
            >
              Annuler
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => triggerPurge(targetTable ?? undefined, true)}
              className="gap-1.5"
            >
              <Play className="h-3.5 w-3.5" /> Simuler d’abord
            </Button>
            <Button
              tone="danger"
              size="sm"
              disabled={pending}
              onClick={() => triggerPurge(targetTable ?? undefined, false)}
              className="gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" /> Confirmer la purge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
