'use client';

// =====================================================================
// 🛡️ AbuseQueue — file de revue anti-abus cockpit (DataGrid + Drawer)
// =====================================================================
// Verdicts automatiques non triviaux : classement sans suite (faux positif)
// ou escalade humaine tracée (limitation, pause, suspension).
// =====================================================================

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Ban, EyeOff, PauseCircle, FileSearch } from 'lucide-react';
import { resolveAbuseDecisionAction } from '@qoe/sdk/actions/admin';
import type { AbuseReasonCode } from '@qoe/sdk';
import { Button } from '@qoe/ui/button';
import { Input } from '@qoe/ui/ui/input';
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
import type { RowActionItem } from '@/components/shell/RowMenu';
import { attemptWithStepUp, notifyActionFailure, readMessage } from '@/lib/authz-feedback';
import type { AbuseDecisionItem } from '@/lib/admin-data';

interface AbuseQueueProps {
  initialItems: AbuseDecisionItem[];
}

const REASON_LABELS: Record<string, string> = {
  'burst.signup.publisher': 'Rafale d’inscriptions sur une publication',
  'swarm.report.target': 'Essaim de signalements contre une cible',
  'swarm.report.reporter': 'Raid de signalement (volume du plaignant)',
  'swarm.like.target': 'Essaim de likes sur une pensée',
  'swarm.like.liker': 'Volume de likes (ferme d’engagement)',
};

const RESULT_LABELS: Record<string, string> = {
  needs_review: 'Revue priorisée',
  limit_distribution: 'Limitation',
  pause_sending: 'Envois en pause',
  suspend: 'Suspension',
};

const RESULT_CLASSES: Record<string, string> = {
  needs_review: 'bg-highlight/15 text-highlight border-highlight/40',
  limit_distribution: 'bg-muted text-muted-foreground border-border',
  pause_sending: 'bg-muted text-muted-foreground border-border',
  suspend: 'bg-destructive/10 text-destructive-text border-destructive/20',
};

export function AbuseQueue({ initialItems }: AbuseQueueProps) {
  const router = useRouter();
  const [items, setItems] = useState<AbuseDecisionItem[]>(initialItems);
  const [preview, setPreview] = useState<AbuseDecisionItem | null>(null);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const grid = useGridView('admin.abuse.queue', {
    column: 'createdAt',
    direction: 'descending',
  });

  const closeDecision = async (item: AbuseDecisionItem, result: string) => {
    setIsSubmitting(true);
    const outcome = await attemptWithStepUp(
      () =>
        resolveAbuseDecisionAction({
          subjectType: item.subjectType,
          subjectId: item.subjectId,
          result,
          note,
        }),
      { reason: `Arbitrage anti-abus ${result} sur ${item.subjectId}` }
    );
    setIsSubmitting(false);

    if (outcome.ok) {
      // Dossier clos : il sort de la file
      setItems((prev) => prev.filter((it) => it.id !== item.id));
      setPreview(null);
      setNote('');

      const label =
        result === 'allow' ? 'Dossier classé sans suite' : `Escalade tracée (${result})`;
      setStatus(`${label} · audité à ${new Date().toLocaleTimeString('fr-FR')}`);
      router.refresh();
      return true;
    }

    notifyActionFailure(outcome, readMessage(outcome) ?? 'Action impossible');
    return false;
  };

  const columns: GridColumn<AbuseDecisionItem>[] = [
    {
      id: 'subject',
      header: 'Sujet',
      width: 170,
      sort: { kind: 'text', value: (a) => `${a.subjectType}:${a.subjectId}` },
      cell: (a) => (
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="text-[10px] uppercase font-semibold text-muted-foreground">
            {a.subjectType}
          </span>
          <CopyableId id={a.subjectId} max={6} />
        </div>
      ),
    },
    {
      id: 'result',
      header: 'Verdict initial',
      width: 130,
      sort: { kind: 'text', value: (a) => a.result },
      cell: (a) => (
        <span
          className={`inline-flex rounded-full border px-1.5 py-0 text-[10px] font-medium ${
            RESULT_CLASSES[a.result] ?? RESULT_CLASSES.needs_review
          }`}
        >
          {RESULT_LABELS[a.result] ?? a.result}
        </span>
      ),
    },
    {
      id: 'reasons',
      header: 'Motifs détectés',
      sort: { kind: 'text', value: (a) => a.reasonCodes.join(', ') },
      cell: (a) => (
        <div className="flex min-w-0 items-center gap-1 truncate">
          {a.reasonCodes.map((r) => (
            <span
              key={r}
              className="inline-flex rounded border border-border/80 bg-muted/40 px-1 py-0 text-[10px] text-muted-foreground truncate"
              title={REASON_LABELS[r] ?? r}
            >
              {REASON_LABELS[r] ?? r}
            </span>
          ))}
        </div>
      ),
    },
    {
      id: 'facts',
      header: 'Faits',
      width: 80,
      sort: { kind: 'number', value: (a) => a.recentFacts },
      cell: (a) => (
        <span className="tabular-nums text-[11px] text-muted-foreground">
          {a.recentFacts} fait{a.recentFacts > 1 ? 's' : ''}
        </span>
      ),
    },
    {
      id: 'decidedBy',
      header: 'Source',
      width: 110,
      sort: { kind: 'text', value: (a) => a.decidedBy },
      cell: (a) => (
        <span className="text-[11px] text-muted-foreground">
          {a.decidedBy === 'human' ? 'Humain' : 'Automate'}
        </span>
      ),
    },
    {
      id: 'createdAt',
      header: 'Date',
      width: 110,
      sort: { kind: 'number', value: (a) => new Date(a.createdAt).getTime() },
      cell: (a) => (
        <span className="tabular-nums text-[11px] text-muted-foreground">
          {new Date(a.createdAt).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      ),
    },
  ];

  const facetDefs: GridFacetDef<AbuseDecisionItem>[] = [
    {
      id: 'result',
      label: 'Verdict',
      values: [
        { id: 'needs_review', label: 'Revue priorisée', test: (a) => a.result === 'needs_review' },
        {
          id: 'limit_distribution',
          label: 'Limitation',
          test: (a) => a.result === 'limit_distribution',
        },
        { id: 'pause_sending', label: 'Pause envois', test: (a) => a.result === 'pause_sending' },
        { id: 'suspend', label: 'Suspension', test: (a) => a.result === 'suspend' },
      ],
    },
    {
      id: 'source',
      label: 'Source',
      values: [
        { id: 'auto', label: 'Automate', test: (a) => a.decidedBy === 'auto' },
        { id: 'human', label: 'Humain', test: (a) => a.decidedBy === 'human' },
      ],
    },
  ];

  const visible = filterRows(items, grid.state.facets, facetDefs);

  const rowMenu = (item: AbuseDecisionItem): RowActionItem[] => [
    {
      id: 'open',
      label: 'Aperçu du dossier',
      shortcut: 'Entrée',
      onSelect: () => setPreview(item),
    },
    {
      id: 'allow',
      label: 'Classer sans suite (faux positif)',
      onSelect: () => void closeDecision(item, 'allow'),
    },
    {
      id: 'limit',
      label: 'Limiter la distribution…',
      onSelect: () => setPreview(item),
    },
    {
      id: 'pause',
      label: 'Mettre en pause les envois…',
      onSelect: () => setPreview(item),
    },
    {
      id: 'suspend',
      label: 'Suspendre le compte…',
      onSelect: () => setPreview(item),
    },
    {
      id: 'copy-subject',
      label: 'Copier l’ID du sujet',
      onSelect: () => void navigator.clipboard.writeText(item.subjectId),
    },
    {
      id: 'audit',
      label: 'Voir l’audit du sujet',
      onSelect: () => router.push(`/admin/audit?subject=${encodeURIComponent(item.subjectId)}`),
    },
  ];

  return (
    <div className="space-y-2">
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
        columns={columns.map((column) => ({ id: column.id, label: column.header as string }))}
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
        ariaLabel="File de revue anti-abus"
        rows={visible}
        columns={columns}
        initialSort={{ column: 'createdAt', direction: 'descending' }}
        sort={grid.state.sort}
        onSortChange={(sort) => grid.update({ sort } as Partial<GridViewState>)}
        hiddenColumns={grid.state.hidden}
        density={grid.state.density}
        columnOrder={grid.state.order}
        emptyState="Aucun dossier anti-abus ouvert ne correspond aux filtres appliqués."
        onRowOpen={(row) => setPreview(row)}
        rowMenu={rowMenu}
      />

      <Drawer
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) setPreview(null);
        }}
        width="md"
      >
        {preview && (
          <DrawerContent aria-label="Aperçu du dossier anti-abus">
            <DrawerHeader>
              <DrawerTitle>
                Dossier anti-abus #{preview.id.slice(0, 8)} · {preview.subjectType}
              </DrawerTitle>
            </DrawerHeader>

            <DrawerBody className="space-y-4">
              <dl className="grid grid-cols-[104px_1fr] gap-x-2 gap-y-1.5 text-[12px]">
                <dt className="text-muted-foreground">ID Dossier</dt>
                <dd>
                  <CopyableId id={preview.id} />
                </dd>
                <dt className="text-muted-foreground">Sujet visé</dt>
                <dd>
                  <CopyableId id={preview.subjectId} />
                </dd>
                <dt className="text-muted-foreground">Type de sujet</dt>
                <dd className="capitalize">{preview.subjectType}</dd>
                <dt className="text-muted-foreground">Politique</dt>
                <dd className="tabular-nums">
                  {preview.policy}/{preview.version}
                </dd>
                <dt className="text-muted-foreground">Verdict initial</dt>
                <dd className="font-medium">{RESULT_LABELS[preview.result] ?? preview.result}</dd>
                <dt className="text-muted-foreground">Source</dt>
                <dd>{preview.decidedBy === 'human' ? 'Verdict humain' : 'Automate'}</dd>
                <dt className="text-muted-foreground">Faits récents</dt>
                <dd className="tabular-nums">
                  {preview.recentFacts} fait{preview.recentFacts > 1 ? 's' : ''}
                </dd>
                <dt className="text-muted-foreground">Date</dt>
                <dd className="tabular-nums">
                  {new Date(preview.createdAt).toLocaleString('fr-FR')}
                </dd>
              </dl>

              <div className="space-y-2 border-t border-border/60 pt-3">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Motifs d’abus détectés
                </span>
                <ul className="space-y-1 text-[12px]">
                  {preview.reasonCodes.map((r: AbuseReasonCode) => (
                    <li
                      key={r}
                      className="rounded border border-border/70 bg-muted/30 p-2 text-[11px]"
                    >
                      <span className="font-semibold text-foreground">{REASON_LABELS[r] ?? r}</span>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">Code : {r}</p>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded border border-border/80 bg-background p-3 space-y-3">
                <span className="text-[11px] font-semibold text-foreground uppercase tracking-wide">
                  Arbitrage du dossier
                </span>

                <Input
                  placeholder="Motif tracé (visible à l’audit)…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="h-7 text-[11px]"
                />

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    size="xs"
                    variant="solid"
                    tone="brand"
                    disabled={isSubmitting}
                    onClick={() => void closeDecision(preview, 'allow')}
                  >
                    <Check className="size-3.5" />
                    Classer sans suite
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    disabled={isSubmitting}
                    onClick={() => void closeDecision(preview, 'limit_distribution')}
                  >
                    <EyeOff className="size-3.5" />
                    Limiter
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    disabled={isSubmitting}
                    onClick={() => void closeDecision(preview, 'pause_sending')}
                  >
                    <PauseCircle className="size-3.5" />
                    Pause envois
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="solid"
                    tone="danger"
                    disabled={isSubmitting}
                    onClick={() => void closeDecision(preview, 'suspend')}
                  >
                    <Ban className="size-3.5" />
                    Suspendre
                  </Button>
                </div>
              </div>
            </DrawerBody>

            <DrawerFooter>
              <div className="flex w-full items-center justify-between">
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() =>
                    router.push(`/admin/audit?subject=${encodeURIComponent(preview.subjectId)}`)
                  }
                >
                  <FileSearch className="size-3.5" />
                  Audit du sujet
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
