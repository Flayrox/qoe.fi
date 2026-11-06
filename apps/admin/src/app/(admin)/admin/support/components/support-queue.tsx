'use client';

// =====================================================================
// 🎫 SupportQueue — file du support cockpit (DataGrid + Drawer)
// =====================================================================
// Dossiers hors recours (accès, imports, livraisons, modération, API) :
// prise en main, échange contradictoire et clôture tracée.
// =====================================================================

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LifeBuoy, Check, UserCheck, ShieldCheck } from 'lucide-react';
import {
  assignSupportTicketAction,
  updateSupportTicketAction,
  getSupportTicketAction,
} from '@qoe/sdk/actions/admin';
import type { SupportKind } from '@qoe/sdk';
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
import type { SupportTicketItem, SupportMetrics } from '@/lib/admin-data';

interface SupportQueueProps {
  initialItems: SupportTicketItem[];
  metrics: SupportMetrics | null;
}

const KIND_LABELS: Record<SupportKind, string> = {
  account_restricted: 'Compte restreint',
  account_lost: 'Compte perdu / MFA',
  content_moderation: 'Contenu modéré',
  api_access: 'Accès API',
  import_issue: 'Import',
  delivery: 'Livraison e-mails',
  report_issue: 'Signalement',
  other: 'Autre',
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Ouvert',
  under_review: 'En cours',
  closed: 'Clos',
};

const STATUS_CLASSES: Record<string, string> = {
  open: 'bg-highlight/15 text-highlight border-highlight/40',
  under_review: 'bg-brand/10 text-primary border-primary/30',
  closed: 'bg-muted text-muted-foreground border-border',
};

export function SupportQueue({ initialItems }: SupportQueueProps) {
  const router = useRouter();
  const [items, setItems] = useState<SupportTicketItem[]>(initialItems);
  const [preview, setPreview] = useState<SupportTicketItem | null>(null);
  const [note, setNote] = useState('');
  const [reply, setReply] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const grid = useGridView('admin.support.queue', {
    column: 'createdAt',
    direction: 'descending',
  });

  const loadFullDetail = async (item: SupportTicketItem) => {
    setPreview(item);
    const res = await getSupportTicketAction({ ticketId: item.id });
    if (res.ok && res.data?.ticket) {
      setPreview(res.data.ticket as SupportTicketItem);
    }
  };

  const assignTicket = async (item: SupportTicketItem) => {
    setIsSubmitting(true);
    const outcome = await attemptWithStepUp(
      () => assignSupportTicketAction({ ticketId: item.id }),
      { reason: `Prise en main du ticket support ${item.id}` }
    );
    setIsSubmitting(false);

    if (outcome.ok) {
      const updated: SupportTicketItem = {
        ...item,
        status: 'under_review',
      };
      setItems((prev) => prev.map((it) => (it.id === item.id ? updated : it)));
      setPreview(updated);
      setStatus(`Ticket pris en main · audité à ${new Date().toLocaleTimeString('fr-FR')}`);
      router.refresh();
      return true;
    }

    notifyActionFailure(outcome, readMessage(outcome) ?? 'Action impossible');
    return false;
  };

  const closeTicket = async (item: SupportTicketItem) => {
    setIsSubmitting(true);
    const outcome = await attemptWithStepUp(
      () =>
        updateSupportTicketAction({
          ticketId: item.id,
          status: 'closed',
          staffNote: note,
          reply,
        }),
      { reason: `Clôture du ticket support ${item.id}` }
    );
    setIsSubmitting(false);

    if (outcome.ok) {
      const updated: SupportTicketItem = {
        ...item,
        status: 'closed',
        closedAt: new Date().toISOString(),
      };
      setItems((prev) => prev.map((it) => (it.id === item.id ? updated : it)));
      setPreview(updated);
      setNote('');
      setReply('');
      setStatus(`Ticket clos · audité à ${new Date().toLocaleTimeString('fr-FR')}`);
      router.refresh();
      return true;
    }

    notifyActionFailure(outcome, readMessage(outcome) ?? 'Action impossible');
    return false;
  };

  const columns: GridColumn<SupportTicketItem>[] = [
    {
      id: 'ticket',
      header: 'Ticket / Motif',
      width: 170,
      sort: { kind: 'text', value: (t) => `${t.kind}:${t.id}` },
      cell: (t) => (
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className="text-[10px] font-semibold text-muted-foreground truncate"
            title={KIND_LABELS[t.kind] ?? t.kind}
          >
            {KIND_LABELS[t.kind] ?? t.kind}
          </span>
          <CopyableId id={t.id} max={6} />
        </div>
      ),
    },
    {
      id: 'subject',
      header: 'Objet',
      sort: { kind: 'text', value: (t) => t.subject },
      cell: (t) => (
        <span className="truncate text-[11px] font-medium text-foreground" title={t.subject}>
          {t.subject}
        </span>
      ),
    },
    {
      id: 'openedBy',
      header: 'Demandeur',
      width: 140,
      sort: { kind: 'text', value: (t) => t.openedBy },
      cell: (t) => <CopyableId id={t.openedBy} max={6} />,
    },
    {
      id: 'status',
      header: 'Statut',
      width: 104,
      sort: { kind: 'text', value: (t) => t.status },
      cell: (t) => (
        <span
          className={`inline-flex rounded-full border px-1.5 py-0 text-[10px] font-medium ${
            STATUS_CLASSES[t.status] ?? STATUS_CLASSES.open
          }`}
        >
          {STATUS_LABELS[t.status] ?? t.status}
        </span>
      ),
    },
    {
      id: 'assignee',
      header: 'Assigné',
      width: 130,
      sort: { kind: 'text', value: (t) => t.assignee || '' },
      cell: (t) =>
        t.assignee ? (
          <CopyableId id={t.assignee} max={6} />
        ) : (
          <span className="text-[10px] text-muted-foreground/60">Non assigné</span>
        ),
    },
    {
      id: 'createdAt',
      header: 'Date',
      width: 110,
      sort: { kind: 'number', value: (t) => new Date(t.createdAt).getTime() },
      cell: (t) => (
        <span className="tabular-nums text-[11px] text-muted-foreground">
          {new Date(t.createdAt).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      ),
    },
  ];

  const facetDefs: GridFacetDef<SupportTicketItem>[] = [
    {
      id: 'status',
      label: 'Statut',
      values: [
        { id: 'open', label: 'Ouverts', test: (t) => t.status === 'open' },
        { id: 'under_review', label: 'En cours', test: (t) => t.status === 'under_review' },
        { id: 'closed', label: 'Clos', test: (t) => t.status === 'closed' },
      ],
    },
    {
      id: 'assignment',
      label: 'Assignation',
      values: [
        { id: 'unassigned', label: 'Non assignés', test: (t) => !t.assignee },
        { id: 'assigned', label: 'Assignés', test: (t) => Boolean(t.assignee) },
      ],
    },
    {
      id: 'kind',
      label: 'Motif',
      values: Object.entries(KIND_LABELS).map(([key, label]) => ({
        id: key,
        label,
        test: (t) => t.kind === key,
      })),
    },
  ];

  const visible = filterRows(items, grid.state.facets, facetDefs);

  const rowMenu = (item: SupportTicketItem): RowActionItem[] => [
    {
      id: 'open',
      label: 'Aperçu du dossier',
      shortcut: 'Entrée',
      onSelect: () => void loadFullDetail(item),
    },
    ...(item.status !== 'closed'
      ? [
          {
            id: 'assign',
            label: 'Prendre en main',
            onSelect: () => void assignTicket(item),
          },
          {
            id: 'close',
            label: 'Clore le ticket…',
            onSelect: () => void loadFullDetail(item),
          },
        ]
      : []),
    {
      id: 'copy-id',
      label: 'Copier l’ID du ticket',
      onSelect: () => void navigator.clipboard.writeText(item.id),
    },
    {
      id: 'copy-user',
      label: 'Copier l’ID demandeur',
      onSelect: () => void navigator.clipboard.writeText(item.openedBy),
    },
    {
      id: 'audit',
      label: 'Voir l’audit du ticket',
      onSelect: () => router.push(`/admin/audit?subject=${encodeURIComponent(item.id)}`),
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
        ariaLabel="File des tickets support"
        rows={visible}
        columns={columns}
        initialSort={{ column: 'createdAt', direction: 'descending' }}
        sort={grid.state.sort}
        onSortChange={(sort) => grid.update({ sort } as Partial<GridViewState>)}
        hiddenColumns={grid.state.hidden}
        density={grid.state.density}
        columnOrder={grid.state.order}
        emptyState="Aucun ticket support ne correspond aux filtres appliqués."
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
          <DrawerContent aria-label="Aperçu du ticket support">
            <DrawerHeader>
              <DrawerTitle>
                Ticket #{preview.id.slice(0, 8)} · {KIND_LABELS[preview.kind] ?? preview.kind}
              </DrawerTitle>
            </DrawerHeader>

            <DrawerBody className="space-y-4">
              <dl className="grid grid-cols-[104px_1fr] gap-x-2 gap-y-1.5 text-[12px]">
                <dt className="text-muted-foreground">ID Ticket</dt>
                <dd>
                  <CopyableId id={preview.id} />
                </dd>
                <dt className="text-muted-foreground">Objet</dt>
                <dd className="font-semibold text-foreground">{preview.subject}</dd>
                <dt className="text-muted-foreground">Demandeur</dt>
                <dd>
                  <CopyableId id={preview.openedBy} />
                </dd>
                <dt className="text-muted-foreground">Motif</dt>
                <dd>{KIND_LABELS[preview.kind] ?? preview.kind}</dd>
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
                <dt className="text-muted-foreground">Assigné à</dt>
                <dd>
                  {preview.assignee ? (
                    <CopyableId id={preview.assignee} />
                  ) : (
                    <span className="text-muted-foreground/60 italic">Non assigné</span>
                  )}
                </dd>
                {preview.relatedId && (
                  <>
                    <dt className="text-muted-foreground">Objet lié</dt>
                    <dd>
                      <span className="text-[10px] uppercase font-semibold text-muted-foreground mr-1">
                        {preview.relatedType}:
                      </span>
                      <CopyableId id={preview.relatedId} />
                    </dd>
                  </>
                )}
                <dt className="text-muted-foreground">Date d’ouverture</dt>
                <dd className="tabular-nums">
                  {new Date(preview.createdAt).toLocaleString('fr-FR')}
                </dd>
                {preview.closedAt && (
                  <>
                    <dt className="text-muted-foreground">Clos le</dt>
                    <dd className="tabular-nums">
                      {new Date(preview.closedAt).toLocaleString('fr-FR')}
                    </dd>
                  </>
                )}
              </dl>

              <div className="space-y-2 border-t border-border/60 pt-3">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Fil de messages
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
                      Aucun message détaillé dans le fil.
                    </p>
                  )}
                </div>
              </div>

              {preview.status !== 'closed' ? (
                <div className="rounded border border-border/80 bg-background p-3 space-y-3">
                  <span className="text-[11px] font-semibold text-foreground uppercase tracking-wide">
                    Traitement du ticket
                  </span>

                  <div className="space-y-2">
                    <Input
                      placeholder="Note interne staff (audit)…"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      className="h-7 text-[11px]"
                    />
                    <Input
                      placeholder="Réponse adressée au demandeur…"
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      className="h-7 text-[11px]"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {!preview.assignee && (
                      <Button
                        type="button"
                        size="xs"
                        variant="soft"
                        tone="brand"
                        disabled={isSubmitting}
                        onClick={() => void assignTicket(preview)}
                      >
                        <UserCheck className="size-3.5" />
                        Prendre en main
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="xs"
                      variant="solid"
                      tone="brand"
                      disabled={isSubmitting}
                      onClick={() => void closeTicket(preview)}
                    >
                      <Check className="size-3.5" />
                      Clore le ticket
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded border border-border bg-muted/20 p-3 text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5 shrink-0" />
                  <span>Dossier clos. L’utilisateur peut ouvrir un nouveau ticket si besoin.</span>
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
                    router.push(`/admin/audit?subject=${encodeURIComponent(preview.id)}`)
                  }
                >
                  <LifeBuoy className="size-3.5" />
                  Audit du ticket
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
