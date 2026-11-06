'use client';

// =====================================================================
// ⚖️ AppealsQueue — file des recours cockpit (DataGrid + Drawer)
// =====================================================================
// Contestations des mesures visant un compte : consultation du fil
// contradictoire, prise en main et arbitrage (confirmer ou infirmer).
// =====================================================================

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Scale, Check, X, ShieldCheck, UserCheck } from 'lucide-react';
import { decideAbuseAppealAction, getAbuseAppealAction } from '@qoe/sdk/actions/admin';
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
import type { AbuseAppealItem } from '@/lib/admin-data';

interface AppealsQueueProps {
  initialItems: AbuseAppealItem[];
}

const STATUS_LABELS: Record<string, string> = {
  open: 'À prendre',
  under_review: 'En cours',
  decided: 'Tranché',
};

const STATUS_CLASSES: Record<string, string> = {
  open: 'bg-highlight/15 text-highlight border-highlight/40',
  under_review: 'bg-brand/10 text-primary border-primary/30',
  decided: 'bg-muted text-muted-foreground border-border',
};

const OUTCOME_LABELS: Record<string, string> = {
  overturned: 'Infirmé (levé)',
  upheld: 'Confirmé',
};

const OUTCOME_CLASSES: Record<string, string> = {
  overturned: 'bg-success/10 text-success-text border-success/20',
  upheld: 'bg-destructive/10 text-destructive-text border-destructive/20',
};

export function AppealsQueue({ initialItems }: AppealsQueueProps) {
  const router = useRouter();
  const [items, setItems] = useState<AbuseAppealItem[]>(initialItems);
  const [preview, setPreview] = useState<AbuseAppealItem | null>(null);
  const [note, setNote] = useState('');
  const [reply, setReply] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const grid = useGridView('admin.appeals.queue', {
    column: 'createdAt',
    direction: 'descending',
  });

  const loadFullDetail = async (item: AbuseAppealItem) => {
    setPreview(item);
    const res = await getAbuseAppealAction({ appealId: item.id });
    if (res.ok && res.data?.appeal) {
      setPreview(res.data.appeal as AbuseAppealItem);
    }
  };

  const runDecision = async (
    item: AbuseAppealItem,
    nextStatus: string,
    outcome?: 'upheld' | 'overturned'
  ) => {
    setIsSubmitting(true);
    const result = await attemptWithStepUp(
      () =>
        decideAbuseAppealAction({
          appealId: item.id,
          status: nextStatus,
          outcome,
          staffNote: note,
          reply,
        }),
      { reason: `Décision sur recours ${item.id} — ${nextStatus}` }
    );
    setIsSubmitting(false);

    if (result.ok) {
      const updated: AbuseAppealItem = {
        ...item,
        status: nextStatus as AbuseAppealItem['status'],
        outcome: (outcome ?? item.outcome) as AbuseAppealItem['outcome'],
        staffNote: note || item.staffNote,
      };

      setItems((prev) => prev.map((it) => (it.id === item.id ? updated : it)));
      setPreview(updated);
      setNote('');
      setReply('');

      const label =
        nextStatus === 'under_review'
          ? 'Dossier pris en main'
          : outcome === 'overturned'
            ? 'Mesure levée'
            : 'Mesure confirmée';
      setStatus(`${label} · audité à ${new Date().toLocaleTimeString('fr-FR')}`);
      router.refresh();
      return true;
    }

    notifyActionFailure(result, readMessage(result) ?? 'Action impossible');
    return false;
  };

  const columns: GridColumn<AbuseAppealItem>[] = [
    {
      id: 'subject',
      header: 'Sujet visé',
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
      id: 'openedBy',
      header: 'Demandeur',
      width: 140,
      sort: { kind: 'text', value: (a) => a.openedBy },
      cell: (a) => <CopyableId id={a.openedBy} max={6} />,
    },
    {
      id: 'status',
      header: 'Statut',
      width: 104,
      sort: { kind: 'text', value: (a) => a.status },
      cell: (a) => (
        <span
          className={`inline-flex rounded-full border px-1.5 py-0 text-[10px] font-medium ${
            STATUS_CLASSES[a.status] ?? STATUS_CLASSES.open
          }`}
        >
          {STATUS_LABELS[a.status] ?? a.status}
        </span>
      ),
    },
    {
      id: 'outcome',
      header: 'Décision',
      width: 130,
      sort: { kind: 'text', value: (a) => a.outcome || '' },
      cell: (a) =>
        a.outcome ? (
          <span
            className={`inline-flex rounded-full border px-1.5 py-0 text-[10px] font-medium ${
              OUTCOME_CLASSES[a.outcome] ?? ''
            }`}
          >
            {OUTCOME_LABELS[a.outcome] ?? a.outcome}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground/60">—</span>
        ),
    },
    {
      id: 'decidedBy',
      header: 'Tranché par',
      width: 120,
      sort: { kind: 'text', value: (a) => a.decidedBy || '' },
      cell: (a) =>
        a.decidedBy ? (
          <CopyableId id={a.decidedBy} max={6} />
        ) : (
          <span className="text-[10px] text-muted-foreground/60">—</span>
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

  const facetDefs: GridFacetDef<AbuseAppealItem>[] = [
    {
      id: 'status',
      label: 'Statut',
      values: [
        { id: 'open', label: 'À prendre', test: (a) => a.status === 'open' },
        { id: 'under_review', label: 'En cours', test: (a) => a.status === 'under_review' },
        { id: 'decided', label: 'Tranchés', test: (a) => a.status === 'decided' },
      ],
    },
    {
      id: 'outcome',
      label: 'Verdict',
      values: [
        { id: 'overturned', label: 'Infirmés (levés)', test: (a) => a.outcome === 'overturned' },
        { id: 'upheld', label: 'Confirmés', test: (a) => a.outcome === 'upheld' },
      ],
    },
  ];

  const visible = filterRows(items, grid.state.facets, facetDefs);

  const rowMenu = (item: AbuseAppealItem): RowActionItem[] => [
    {
      id: 'open',
      label: 'Aperçu du recours',
      shortcut: 'Entrée',
      onSelect: () => void loadFullDetail(item),
    },
    ...(item.status === 'open'
      ? [
          {
            id: 'take',
            label: 'Prendre en main',
            onSelect: () => void runDecision(item, 'under_review'),
          },
        ]
      : []),
    ...(item.status !== 'decided'
      ? [
          {
            id: 'decide',
            label: 'Trancher le recours…',
            onSelect: () => void loadFullDetail(item),
          },
        ]
      : []),
    {
      id: 'copy-subject',
      label: 'Copier l’ID du sujet',
      onSelect: () => void navigator.clipboard.writeText(item.subjectId),
    },
    {
      id: 'copy-appeal',
      label: 'Copier l’ID du recours',
      onSelect: () => void navigator.clipboard.writeText(item.id),
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
        ariaLabel="File des recours contre les mesures de compte"
        rows={visible}
        columns={columns}
        initialSort={{ column: 'createdAt', direction: 'descending' }}
        sort={grid.state.sort}
        onSortChange={(sort) => grid.update({ sort } as Partial<GridViewState>)}
        hiddenColumns={grid.state.hidden}
        density={grid.state.density}
        columnOrder={grid.state.order}
        emptyState="Aucun recours ne correspond aux filtres appliqués."
        onRowOpen={(row) => void loadFullDetail(row)}
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
          <DrawerContent aria-label="Aperçu du recours">
            <DrawerHeader>
              <DrawerTitle>
                Recours #{preview.id.slice(0, 8)} · {preview.subjectType}
              </DrawerTitle>
            </DrawerHeader>

            <DrawerBody className="space-y-4">
              <dl className="grid grid-cols-[104px_1fr] gap-x-2 gap-y-1.5 text-[12px]">
                <dt className="text-muted-foreground">ID Recours</dt>
                <dd>
                  <CopyableId id={preview.id} />
                </dd>
                <dt className="text-muted-foreground">Sujet visé</dt>
                <dd>
                  <CopyableId id={preview.subjectId} />
                </dd>
                <dt className="text-muted-foreground">Demandeur</dt>
                <dd>
                  <CopyableId id={preview.openedBy} />
                </dd>
                <dt className="text-muted-foreground">Date de dépôt</dt>
                <dd className="tabular-nums">
                  {new Date(preview.createdAt).toLocaleString('fr-FR')}
                </dd>
                <dt className="text-muted-foreground">Statut</dt>
                <dd>
                  <span
                    className={`inline-flex rounded-full border px-1.5 py-0 text-[10px] font-medium ${
                      STATUS_CLASSES[preview.status] ?? STATUS_CLASSES.open
                    }`}
                  >
                    {STATUS_LABELS[preview.status] ?? preview.status}
                  </span>
                </dd>
                {preview.outcome && (
                  <>
                    <dt className="text-muted-foreground">Décision</dt>
                    <dd className="font-medium">
                      {OUTCOME_LABELS[preview.outcome] ?? preview.outcome}
                    </dd>
                  </>
                )}
                {preview.decidedBy && (
                  <>
                    <dt className="text-muted-foreground">Tranché par</dt>
                    <dd>
                      <CopyableId id={preview.decidedBy} />
                    </dd>
                  </>
                )}
              </dl>

              <div className="space-y-2 border-t border-border/60 pt-3">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Échanges contradictoires
                </span>

                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {(preview.messages ?? []).map((m) => {
                    const isUser = m.authorId === preview.openedBy;
                    return (
                      <div
                        key={m.id}
                        className={`rounded p-2.5 text-[11px] leading-relaxed select-text ${
                          isUser
                            ? 'bg-muted/40 text-foreground border border-border/70'
                            : 'bg-primary/10 text-primary border border-primary/20 ml-4'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{m.body}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground tabular-nums">
                          {isUser ? 'Utilisateur' : 'Staff'} ·{' '}
                          {new Date(m.createdAt).toLocaleString('fr-FR')}
                        </p>
                      </div>
                    );
                  })}
                  {(preview.messages ?? []).length === 0 && (
                    <p className="text-[11px] italic text-muted-foreground">
                      Aucun message détaillé joint au recours.
                    </p>
                  )}
                </div>
              </div>

              {preview.status !== 'decided' ? (
                <div className="rounded border border-border/80 bg-background p-3 space-y-3">
                  <span className="text-[11px] font-semibold text-foreground uppercase tracking-wide">
                    Trancher le recours
                  </span>

                  <div className="space-y-2">
                    <Input
                      placeholder="Note interne (audit, non visible)…"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="h-7 text-[11px]"
                    />
                    <Input
                      placeholder="Réponse notifiée à l’utilisateur…"
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      className="h-7 text-[11px]"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {preview.status === 'open' && (
                      <Button
                        type="button"
                        size="xs"
                        variant="soft"
                        tone="brand"
                        disabled={isSubmitting}
                        onClick={() => void runDecision(preview, 'under_review')}
                      >
                        <UserCheck className="size-3.5" />
                        Prendre en main
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      disabled={isSubmitting}
                      onClick={() => void runDecision(preview, 'decided', 'upheld')}
                    >
                      <X className="size-3.5" />
                      Confirmer la mesure
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="solid"
                      tone="brand"
                      disabled={isSubmitting}
                      onClick={() => void runDecision(preview, 'decided', 'overturned')}
                    >
                      <Check className="size-3.5" />
                      Infirmer (lever la mesure)
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded border border-border bg-muted/20 p-3 text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5 shrink-0" />
                  <span>
                    Dossier clos — pour rouvrir, l’utilisateur doit déposer un nouveau recours.
                  </span>
                </div>
              )}
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
                  <Scale className="size-3.5" />
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
