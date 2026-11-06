'use client';

// =====================================================================
// 🤝 ApprovalsQueue — file des doubles validations cockpit (DataGrid + Drawer)
// =====================================================================
// Décider une double validation, une par une :
// - L'auteur d'une demande ne peut jamais valider lui-même
// - Le motif de la demande est affiché en entier avant de décider
// - Décision individuelle, nominative et tracée (statut inline horodaté)
// =====================================================================

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Handshake, Check, X, ShieldCheck, ShieldAlert } from 'lucide-react';
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
import { decideApprovalAction } from '@/lib/admin-approval-actions';
import {
  APPROVAL_ACT_LABELS,
  APPROVAL_STATUS_LABELS,
  isApprovalOpen,
  type AdminApprovalItem,
} from '@/lib/admin-approval-types';

interface ApprovalsQueueProps {
  initialItems: AdminApprovalItem[];
  currentUserId: string;
}

const STATUS_CLASSES: Record<string, string> = {
  pending: 'bg-highlight/15 text-highlight border-highlight/40',
  approved: 'bg-success/10 text-success-text border-success/20',
  rejected: 'bg-destructive/10 text-destructive-text border-destructive/20',
  consumed: 'bg-muted text-muted-foreground border-border',
};

export function ApprovalsQueue({ initialItems, currentUserId }: ApprovalsQueueProps) {
  const router = useRouter();
  const [items, setItems] = useState<AdminApprovalItem[]>(initialItems);
  const [preview, setPreview] = useState<AdminApprovalItem | null>(null);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const grid = useGridView('admin.approvals.queue', {
    column: 'createdAt',
    direction: 'descending',
  });

  const runDecision = async (item: AdminApprovalItem, decision: 'approved' | 'rejected') => {
    setIsSubmitting(true);
    const result = await attemptWithStepUp(
      () => decideApprovalAction({ approvalId: item.id, decision, note }),
      { reason: `Validation ${item.act} — ${APPROVAL_ACT_LABELS[item.act] ?? item.act}` }
    );
    setIsSubmitting(false);

    if (result.success) {
      const updated: AdminApprovalItem = {
        ...item,
        status: decision,
        decidedBy: currentUserId,
        decidedAt: new Date().toISOString(),
        note,
      };

      setItems((prev) => prev.map((it) => (it.id === item.id ? updated : it)));
      setPreview(updated);
      setNote('');

      const label = decision === 'approved' ? 'Demande approuvée' : 'Demande refusée';
      setStatus(`${label} · audité à ${new Date().toLocaleTimeString('fr-FR')}`);
      router.refresh();
      return true;
    }

    notifyActionFailure(result, readMessage(result) ?? 'Action impossible');
    return false;
  };

  const columns: GridColumn<AdminApprovalItem>[] = [
    {
      id: 'act',
      header: 'Acte / Cible',
      width: 180,
      sort: { kind: 'text', value: (i) => `${i.act}:${i.target}` },
      cell: (i) => (
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className="text-[10px] font-semibold text-muted-foreground truncate"
            title={APPROVAL_ACT_LABELS[i.act] ?? i.act}
          >
            {APPROVAL_ACT_LABELS[i.act] ?? i.act}
          </span>
          <CopyableId id={i.target} max={6} />
        </div>
      ),
    },
    {
      id: 'reason',
      header: 'Motif de la demande',
      sort: { kind: 'text', value: (i) => i.reason },
      cell: (i) => (
        <span className="truncate text-[11px] font-medium text-foreground" title={i.reason}>
          {i.reason}
        </span>
      ),
    },
    {
      id: 'requestedBy',
      header: 'Demandeur',
      width: 140,
      sort: { kind: 'text', value: (i) => i.requestedBy },
      cell: (i) => (
        <div className="flex items-center gap-1">
          <CopyableId id={i.requestedBy} max={6} />
          {i.requestedBy === currentUserId && (
            <span className="rounded-full border border-primary/30 bg-primary/10 px-1 text-[10px] text-primary">
              moi
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Statut',
      width: 104,
      sort: { kind: 'text', value: (i) => i.status },
      cell: (i) => {
        const open = isApprovalOpen(i);
        const label = open ? 'En attente' : (APPROVAL_STATUS_LABELS[i.status] ?? i.status);
        const cls = open
          ? STATUS_CLASSES.pending
          : (STATUS_CLASSES[i.status] ?? STATUS_CLASSES.consumed);

        return (
          <span
            className={`inline-flex rounded-full border px-1.5 py-0 text-[10px] font-medium ${cls}`}
          >
            {label}
          </span>
        );
      },
    },
    {
      id: 'expiresAt',
      header: 'Échéance',
      width: 130,
      sort: { kind: 'number', value: (i) => new Date(i.expiresAt).getTime() },
      cell: (i) => (
        <span className="tabular-nums text-[11px] text-muted-foreground">
          {new Date(i.expiresAt).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      ),
    },
    {
      id: 'decidedBy',
      header: 'Décideur',
      width: 120,
      sort: { kind: 'text', value: (i) => i.decidedBy || '' },
      cell: (i) =>
        i.decidedBy ? (
          <CopyableId id={i.decidedBy} max={6} />
        ) : (
          <span className="text-[10px] text-muted-foreground/60">—</span>
        ),
    },
  ];

  const facetDefs: GridFacetDef<AdminApprovalItem>[] = [
    {
      id: 'status',
      label: 'Statut',
      values: [
        { id: 'open', label: 'En attente', test: (i) => isApprovalOpen(i) },
        { id: 'approved', label: 'Approuvées', test: (i) => i.status === 'approved' },
        { id: 'rejected', label: 'Refusées', test: (i) => i.status === 'rejected' },
        { id: 'consumed', label: 'Exercées', test: (i) => i.status === 'consumed' },
      ],
    },
    {
      id: 'origin',
      label: 'Origine',
      values: [
        { id: 'mine', label: 'Mes demandes', test: (i) => i.requestedBy === currentUserId },
        { id: 'others', label: 'Autres demandeurs', test: (i) => i.requestedBy !== currentUserId },
      ],
    },
    {
      id: 'act',
      label: 'Acte',
      values: Object.entries(APPROVAL_ACT_LABELS).map(([key, label]) => ({
        id: key,
        label,
        test: (i) => i.act === key,
      })),
    },
  ];

  const visible = filterRows(items, grid.state.facets, facetDefs);

  const rowMenu = (item: AdminApprovalItem): RowActionItem[] => {
    const open = isApprovalOpen(item);
    const canDecide = open && item.requestedBy !== currentUserId;

    return [
      {
        id: 'open',
        label: 'Aperçu de la demande',
        shortcut: 'Entrée',
        onSelect: () => setPreview(item),
      },
      ...(canDecide
        ? [
            {
              id: 'approve',
              label: 'Approuver l’acte…',
              onSelect: () => setPreview(item),
            },
            {
              id: 'reject',
              label: 'Refuser l’acte…',
              onSelect: () => setPreview(item),
            },
          ]
        : []),
      {
        id: 'copy-target',
        label: 'Copier l’ID cible',
        onSelect: () => void navigator.clipboard.writeText(item.target),
      },
      {
        id: 'copy-id',
        label: 'Copier l’ID de validation',
        onSelect: () => void navigator.clipboard.writeText(item.id),
      },
      {
        id: 'audit',
        label: 'Voir l’audit de la cible',
        onSelect: () => router.push(`/admin/audit?subject=${encodeURIComponent(item.target)}`),
      },
    ];
  };

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
        ariaLabel="File des doubles validations"
        rows={visible}
        columns={columns}
        initialSort={{ column: 'createdAt', direction: 'descending' }}
        sort={grid.state.sort}
        onSortChange={(sort) => grid.update({ sort } as Partial<GridViewState>)}
        hiddenColumns={grid.state.hidden}
        density={grid.state.density}
        columnOrder={grid.state.order}
        emptyState="Aucune demande de validation ne correspond aux filtres appliqués."
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
          <DrawerContent aria-label="Aperçu de la double validation">
            <DrawerHeader>
              <DrawerTitle>
                Validation #{preview.id.slice(0, 8)} ·{' '}
                {APPROVAL_ACT_LABELS[preview.act] ?? preview.act}
              </DrawerTitle>
            </DrawerHeader>

            <DrawerBody className="space-y-4">
              <dl className="grid grid-cols-[104px_1fr] gap-x-2 gap-y-1.5 text-[12px]">
                <dt className="text-muted-foreground">ID Demande</dt>
                <dd>
                  <CopyableId id={preview.id} />
                </dd>
                <dt className="text-muted-foreground">Cible</dt>
                <dd>
                  <CopyableId id={preview.target} />
                </dd>
                <dt className="text-muted-foreground">Acte visé</dt>
                <dd className="font-semibold text-foreground">
                  {APPROVAL_ACT_LABELS[preview.act] ?? preview.act}
                </dd>
                <dt className="text-muted-foreground">Capacité requise</dt>
                <dd className="tabular-nums text-muted-foreground">{preview.capability}</dd>
                <dt className="text-muted-foreground">Demandeur</dt>
                <dd>
                  <div className="flex items-center gap-1">
                    <CopyableId id={preview.requestedBy} />
                    {preview.requestedBy === currentUserId && (
                      <span className="rounded-full border border-primary/30 bg-primary/10 px-1 text-[10px] text-primary">
                        moi
                      </span>
                    )}
                  </div>
                </dd>
                <dt className="text-muted-foreground">Statut</dt>
                <dd>
                  <span
                    className={`inline-flex rounded-full border px-1.5 py-0 text-[10px] font-medium ${
                      isApprovalOpen(preview)
                        ? STATUS_CLASSES.pending
                        : (STATUS_CLASSES[preview.status] ?? STATUS_CLASSES.consumed)
                    }`}
                  >
                    {isApprovalOpen(preview)
                      ? 'En attente'
                      : (APPROVAL_STATUS_LABELS[preview.status] ?? preview.status)}
                  </span>
                </dd>
                <dt className="text-muted-foreground">Échéance (72h)</dt>
                <dd className="tabular-nums">
                  {new Date(preview.expiresAt).toLocaleString('fr-FR')}
                </dd>
                {preview.decidedBy && (
                  <>
                    <dt className="text-muted-foreground">Décideur</dt>
                    <dd>
                      <CopyableId id={preview.decidedBy} />
                    </dd>
                  </>
                )}
                {preview.decidedAt && (
                  <>
                    <dt className="text-muted-foreground">Décidé le</dt>
                    <dd className="tabular-nums">
                      {new Date(preview.decidedAt).toLocaleString('fr-FR')}
                    </dd>
                  </>
                )}
              </dl>

              <div className="space-y-1 border-t border-border/60 pt-3">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Motif écrit de la demande
                </span>
                <div className="rounded border border-border bg-muted/30 p-2.5 text-[12px] leading-relaxed select-text whitespace-pre-wrap font-medium">
                  {preview.reason}
                </div>
              </div>

              {preview.note && (
                <div className="space-y-1">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Note du décideur
                  </span>
                  <div className="rounded border border-border bg-muted/20 p-2 text-[11px] text-muted-foreground leading-normal">
                    {preview.note}
                  </div>
                </div>
              )}

              {isApprovalOpen(preview) ? (
                preview.requestedBy === currentUserId ? (
                  <div className="rounded border border-highlight/30 bg-highlight/10 p-3 text-[11px] text-highlight flex items-center gap-2">
                    <ShieldAlert className="size-4 shrink-0" />
                    <span>
                      Vous êtes l’auteur de cette demande. Une seconde personne autorisée doit la
                      valider.
                    </span>
                  </div>
                ) : (
                  <div className="rounded border border-border/80 bg-background p-3 space-y-3">
                    <span className="text-[11px] font-semibold text-foreground uppercase tracking-wide">
                      Décision nominative
                    </span>

                    <Input
                      placeholder="Motif de décision (tracé à l’audit, requis pour refus)…"
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
                        onClick={() => void runDecision(preview, 'approved')}
                      >
                        <Check className="size-3.5" />
                        Approuver l’acte
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="solid"
                        tone="danger"
                        disabled={!note.trim() || isSubmitting}
                        onClick={() => void runDecision(preview, 'rejected')}
                      >
                        <X className="size-3.5" />
                        Refuser l’acte
                      </Button>
                    </div>
                  </div>
                )
              ) : (
                <div className="rounded border border-border bg-muted/20 p-3 text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5 shrink-0" />
                  <span>
                    Demande close ({APPROVAL_STATUS_LABELS[preview.status] ?? preview.status}).
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
                    router.push(`/admin/audit?subject=${encodeURIComponent(preview.target)}`)
                  }
                >
                  <Handshake className="size-3.5" />
                  Audit de la cible
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
