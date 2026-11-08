'use client';

// =====================================================================
// 📬 DeliveryTable — table outbox cockpit (DataGrid + Drawer)
// =====================================================================
// Supervision des envois transactionnels : tri, facettes, relance
// unitaire et inspection de la dernière erreur sans quitter l'écran.
// =====================================================================

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw, AlertTriangle, Mail } from 'lucide-react';
import {
  batchRetryDeliveriesAction,
  retryNotificationDeliveryAction,
} from '@/lib/admin-aux-actions';
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
import type { RowActionItem } from '@/components/shell/RowMenu';

export interface DeliveryRow {
  id: string;
  recipient: string;
  status: string;
  channel: string;
  attempts: number;
  provider: string | null;
  lastError: string | null;
  createdAt: string;
  notification: { type: string; articleTitle: string | null };
}

const STATUS_LABELS: Record<string, string> = {
  QUEUED: 'En attente',
  PROCESSING: 'En cours',
  SENT: 'Envoyé',
  FAILED: 'Échec',
  DISABLED: 'Désactivé',
};

const STATUS_CLASSES: Record<string, string> = {
  QUEUED: 'bg-highlight/15 text-highlight border-highlight/40',
  PROCESSING: 'bg-brand/10 text-primary border-primary/30',
  SENT: 'bg-success/10 text-success-text border-success/20',
  FAILED: 'bg-destructive/10 text-destructive-text border-destructive/20',
  DISABLED: 'bg-muted text-muted-foreground border-border',
};

export function DeliveryTable({ rows }: { rows: DeliveryRow[] }) {
  const router = useRouter();
  const [items, setItems] = useState<DeliveryRow[]>(rows);
  const [preview, setPreview] = useState<DeliveryRow | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const grid = useGridView('admin.notifications.deliveries', {
    column: 'createdAt',
    direction: 'descending',
  });

  const retry = async (deliveryId: string) => {
    setRetryingId(deliveryId);
    try {
      await retryNotificationDeliveryAction(deliveryId);
      setStatus(
        `Livraison ${deliveryId.slice(0, 8)} relancée · audité à ${new Date().toLocaleTimeString('fr-FR')}`
      );
      setItems((prev) =>
        prev.map((it) => (it.id === deliveryId ? { ...it, status: 'QUEUED', lastError: null } : it))
      );
      if (preview?.id === deliveryId) {
        setPreview((prev) => (prev ? { ...prev, status: 'QUEUED', lastError: null } : null));
      }
      router.refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Relance impossible');
    } finally {
      setRetryingId(null);
    }
  };

  const handleBatchRetry = async (selected: DeliveryRow[]) => {
    const ids = selected.map((r) => r.id);
    setStatus(`Relance de ${ids.length} livraison(s) en cours...`);
    try {
      const res = await batchRetryDeliveriesAction(ids);
      if (res.success) {
        setStatus(
          `Audité · ${res.retriedCount} livraison(s) réarmée(s) à ${new Date().toLocaleTimeString('fr-FR')}`
        );
        setItems((prev) =>
          prev.map((it) =>
            ids.includes(it.id) ? { ...it, status: 'QUEUED', lastError: null } : it
          )
        );
        router.refresh();
      } else {
        setStatus(res.error || 'Erreur lors de la relance');
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Erreur de relance');
    }
  };

  const columns: GridColumn<DeliveryRow>[] = [
    {
      id: 'recipient',
      header: 'Destinataire',
      width: 190,
      sort: { kind: 'text', value: (d) => d.recipient },
      cell: (d) => (
        <span className="truncate text-[11px] font-medium text-foreground" title={d.recipient}>
          {d.recipient}
        </span>
      ),
    },
    {
      id: 'event',
      header: 'Événement',
      sort: {
        kind: 'text',
        value: (d) => `${d.notification.type} ${d.notification.articleTitle || ''}`,
      },
      cell: (d) => (
        <div className="flex min-w-0 items-center gap-1.5 truncate">
          <span className="text-[11px] font-medium text-foreground">{d.notification.type}</span>
          {d.notification.articleTitle && (
            <span className="truncate text-[11px] text-muted-foreground">
              · {d.notification.articleTitle}
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Statut',
      width: 104,
      sort: { kind: 'text', value: (d) => d.status },
      cell: (d) => (
        <span
          className={`inline-flex rounded-full border px-1.5 py-0 text-[10px] font-medium ${
            STATUS_CLASSES[d.status] ?? STATUS_CLASSES.DISABLED
          }`}
        >
          {STATUS_LABELS[d.status] ?? d.status}
        </span>
      ),
    },
    {
      id: 'attempts',
      header: 'Tentatives',
      width: 80,
      sort: { kind: 'number', value: (d) => d.attempts },
      cell: (d) => (
        <span className="tabular-nums text-[11px] text-muted-foreground">{d.attempts}</span>
      ),
    },
    {
      id: 'provider',
      header: 'Fournisseur',
      width: 110,
      sort: { kind: 'text', value: (d) => d.provider || '' },
      cell: (d) => (
        <span className="text-[10px] text-muted-foreground truncate">{d.provider || '—'}</span>
      ),
    },
    {
      id: 'createdAt',
      header: 'Date',
      width: 110,
      sort: { kind: 'number', value: (d) => new Date(d.createdAt).getTime() },
      cell: (d) => (
        <span className="tabular-nums text-[11px] text-muted-foreground">
          {new Date(d.createdAt).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      ),
    },
  ];

  const facetDefs: GridFacetDef<DeliveryRow>[] = [
    {
      id: 'status',
      label: 'Statut',
      values: [
        { id: 'QUEUED', label: 'En attente', test: (d) => d.status === 'QUEUED' },
        { id: 'PROCESSING', label: 'En cours', test: (d) => d.status === 'PROCESSING' },
        { id: 'SENT', label: 'Envoyés', test: (d) => d.status === 'SENT' },
        { id: 'FAILED', label: 'Échecs', test: (d) => d.status === 'FAILED' },
        { id: 'DISABLED', label: 'Désactivés', test: (d) => d.status === 'DISABLED' },
      ],
    },
    {
      id: 'channel',
      label: 'Canal',
      values: [
        { id: 'email', label: 'Email', test: (d) => d.channel === 'email' },
        { id: 'in_app', label: 'In-app', test: (d) => d.channel === 'in_app' },
      ],
    },
  ];

  const visible = filterRows(items, grid.state.facets, facetDefs);

  const rowMenu = (row: DeliveryRow): RowActionItem[] => [
    {
      id: 'open',
      label: 'Aperçu de la livraison',
      shortcut: 'Entrée',
      onSelect: () => setPreview(row),
    },
    ...(['FAILED', 'DISABLED'].includes(row.status)
      ? [
          {
            id: 'retry',
            label: 'Relancer l’envoi',
            onSelect: () => void retry(row.id),
          },
        ]
      : []),
    {
      id: 'copy-id',
      label: 'Copier l’identifiant livraison',
      onSelect: () => void navigator.clipboard.writeText(row.id),
    },
    {
      id: 'copy-recipient',
      label: 'Copier l’adresse destinataire',
      onSelect: () => void navigator.clipboard.writeText(row.recipient),
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
        ariaLabel="Tableau des livraisons outbox"
        rows={visible}
        columns={columns}
        initialSort={{ column: 'createdAt', direction: 'descending' }}
        sort={grid.state.sort}
        onSortChange={(sort) => grid.update({ sort } as Partial<GridViewState>)}
        hiddenColumns={grid.state.hidden}
        density={grid.state.density}
        columnOrder={grid.state.order}
        emptyState="Aucune livraison ne correspond aux critères filtrés."
        selectable
        bulkActions={(rows) => (
          <Button
            type="button"
            size="xs"
            variant="soft"
            tone="brand"
            className="h-6 px-2 text-[11px] gap-1"
            onClick={() => handleBatchRetry(rows)}
          >
            <RefreshCw className="h-3 w-3" />
            Relancer la sélection ({rows.length})
          </Button>
        )}
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
          <DrawerContent aria-label="Aperçu de la livraison">
            <DrawerHeader>
              <DrawerTitle>
                Livraison #{preview.id.slice(0, 8)} · {preview.channel}
              </DrawerTitle>
            </DrawerHeader>

            <DrawerBody className="space-y-4">
              <dl className="grid grid-cols-[104px_1fr] gap-x-2 gap-y-1.5 text-[12px]">
                <dt className="text-muted-foreground">ID Livraison</dt>
                <dd>
                  <CopyableId id={preview.id} />
                </dd>
                <dt className="text-muted-foreground">Destinataire</dt>
                <dd className="font-semibold text-foreground select-text">{preview.recipient}</dd>
                <dt className="text-muted-foreground">Canal</dt>
                <dd className="capitalize">{preview.channel}</dd>
                <dt className="text-muted-foreground">Événement</dt>
                <dd>{preview.notification.type}</dd>
                {preview.notification.articleTitle && (
                  <>
                    <dt className="text-muted-foreground">Article</dt>
                    <dd>{preview.notification.articleTitle}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">Statut</dt>
                <dd>
                  <span
                    className={`inline-flex rounded-full border px-1.5 py-0 text-[10px] font-medium ${
                      STATUS_CLASSES[preview.status] ?? STATUS_CLASSES.DISABLED
                    }`}
                  >
                    {STATUS_LABELS[preview.status] ?? preview.status}
                  </span>
                </dd>
                <dt className="text-muted-foreground">Tentatives</dt>
                <dd className="tabular-nums">{preview.attempts}</dd>
                <dt className="text-muted-foreground">Fournisseur</dt>
                <dd>{preview.provider || '—'}</dd>
                <dt className="text-muted-foreground">Date création</dt>
                <dd className="tabular-nums">
                  {new Date(preview.createdAt).toLocaleString('fr-FR')}
                </dd>
              </dl>

              {preview.lastError && (
                <div className="space-y-1 rounded border border-destructive/30 bg-destructive/5 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold text-destructive-text">
                    <AlertTriangle className="size-3.5" />
                    <span>Dernier motif d’échec :</span>
                  </div>
                  <pre className="mt-1 text-[11px] text-destructive-text leading-relaxed whitespace-pre-wrap select-text">
                    {preview.lastError}
                  </pre>
                </div>
              )}
            </DrawerBody>

            <DrawerFooter>
              <div className="flex w-full items-center justify-between">
                {['FAILED', 'DISABLED'].includes(preview.status) ? (
                  <Button
                    type="button"
                    size="xs"
                    variant="soft"
                    tone="brand"
                    disabled={retryingId === preview.id}
                    onClick={() => void retry(preview.id)}
                  >
                    {retryingId === preview.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="size-3.5" />
                    )}
                    Relancer l’envoi
                  </Button>
                ) : (
                  <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Mail className="size-3.5" /> Outbox transactionnelle
                  </span>
                )}
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
