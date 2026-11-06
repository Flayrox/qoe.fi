'use client';

// =====================================================================
// 🛡️ ModerationQueue — file de modération cockpit (DataGrid + Drawer)
// =====================================================================
// Ergonomie cockpit : lignes de 26 px, navigation clavier complète,
// facettes dans l'URL, tiroir de détail 480 px, actions réversibles
// auditées sans toast de succès (statut horodaté inline).
// =====================================================================

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck,
  EyeOff,
  Eye,
  Ban,
  Check,
  X,
  Flag,
  MessageSquareQuote,
  FileText,
  User as UserIcon,
} from 'lucide-react';
import { resolveModerationReportAction } from '@qoe/sdk/actions/admin';
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
import type { ModerationReportItem } from '@/lib/admin-data';

interface ModerationQueueProps {
  initialItems: ModerationReportItem[];
  initialPending: number;
}

const REASON_LABELS: Record<string, string> = {
  spam: 'Spam / pub',
  harassment: 'Harcèlement',
  hate_speech: 'Haine',
  misleading: 'Désinformation',
  other: 'Autre',
};

const ACTION_LABELS: Record<string, string> = {
  hide_post: 'Pensée masquée',
  hide_article: 'Article masqué',
  unhide_post: 'Pensée restaurée',
  unhide_article: 'Article restauré',
  suspend_author: 'Auteur suspendu',
  resolve: 'Résolu sans action',
  dismiss: 'Ignoré',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  resolved: 'Résolu',
  dismissed: 'Ignoré',
};

const STATUS_CLASSES: Record<string, string> = {
  pending: 'bg-highlight/15 text-highlight border-highlight/40',
  resolved: 'bg-success/10 text-success-text border-success/20',
  dismissed: 'bg-muted text-muted-foreground border-border',
};

function TypeBadge({ type }: { type: string }) {
  if (type === 'article') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <FileText className="size-3 shrink-0" />
        <span>Article</span>
      </span>
    );
  }
  if (type === 'user') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <UserIcon className="size-3 shrink-0" />
        <span>Compte</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <MessageSquareQuote className="size-3 shrink-0" />
      <span>Pensée</span>
    </span>
  );
}

export function ModerationQueue({ initialItems }: ModerationQueueProps) {
  const router = useRouter();
  const [items, setItems] = useState<ModerationReportItem[]>(initialItems);
  const [preview, setPreview] = useState<ModerationReportItem | null>(null);
  const [suspendNote, setSuspendNote] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const grid = useGridView('admin.reports.queue', {
    column: 'createdAt',
    direction: 'descending',
  });

  const runAction = async (report: ModerationReportItem, action: string, note = '') => {
    setIsSubmitting(true);
    const result = await attemptWithStepUp(
      () => resolveModerationReportAction({ reportId: report.id, action, note }),
      { reason: `Modération ${action} sur le signalement ${report.id}` }
    );
    setIsSubmitting(false);

    if (result.ok) {
      const nextStatus = action === 'dismiss' ? 'dismissed' : 'resolved';
      const updated: ModerationReportItem = {
        ...report,
        status: nextStatus,
        actionTaken: action,
      };

      setItems((prev) => prev.map((item) => (item.id === report.id ? updated : item)));
      if (preview?.id === report.id) {
        setPreview(updated);
      }
      setSuspendNote('');
      const actionName = ACTION_LABELS[action] ?? action;
      setStatus(`${actionName} · audité à ${new Date().toLocaleTimeString('fr-FR')}`);
      router.refresh();
      return true;
    }

    notifyActionFailure(result, readMessage(result) ?? 'Action impossible');
    return false;
  };

  const columns: GridColumn<ModerationReportItem>[] = [
    {
      id: 'target',
      header: 'Cible',
      width: 170,
      sort: { kind: 'text', value: (r) => `${r.targetType}:${r.targetId}` },
      cell: (r) => (
        <div className="flex min-w-0 items-center gap-1.5">
          <TypeBadge type={r.targetType} />
          <CopyableId id={r.targetId} max={6} />
          {r.targetCount > 1 && (
            <span
              title={`${r.targetCount} signalements sur cette cible`}
              className="inline-flex rounded-full border border-highlight/40 bg-highlight/15 px-1 text-[10px] tabular-nums font-semibold text-highlight"
            >
              +{r.targetCount - 1}
            </span>
          )}
        </div>
      ),
    },
    {
      id: 'preview',
      header: 'Contenu / Détails',
      sort: { kind: 'text', value: (r) => r.targetPreview || r.details || '' },
      cell: (r) => {
        const text = r.targetPreview || r.details || '—';
        return (
          <span className="truncate text-[11px] text-foreground/90" title={text}>
            {text}
          </span>
        );
      },
    },
    {
      id: 'reason',
      header: 'Motif',
      width: 120,
      sort: { kind: 'text', value: (r) => r.reason },
      cell: (r) => (
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <Flag className="size-3 shrink-0 text-destructive-text" />
          <span className="truncate">{REASON_LABELS[r.reason] ?? r.reason}</span>
        </span>
      ),
    },
    {
      id: 'reporter',
      header: 'Signaleur',
      width: 120,
      sort: {
        kind: 'text',
        value: (r) => r.reporter.name || r.reporter.username || r.reporter.id,
      },
      cell: (r) => (
        <span className="truncate text-[11px] text-muted-foreground">
          {r.reporter.name || r.reporter.username || r.reporter.id.slice(0, 8)}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Statut',
      width: 96,
      sort: { kind: 'text', value: (r) => r.status },
      cell: (r) => (
        <span
          className={`inline-flex rounded-full border px-1.5 py-0 text-[10px] font-medium ${
            STATUS_CLASSES[r.status] ?? STATUS_CLASSES.dismissed
          }`}
        >
          {STATUS_LABELS[r.status] ?? r.status}
        </span>
      ),
    },
    {
      id: 'action',
      header: 'Action prise',
      width: 130,
      sort: { kind: 'text', value: (r) => r.actionTaken || '' },
      cell: (r) =>
        r.actionTaken && r.actionTaken !== 'none' ? (
          <span className="truncate text-[10px] text-muted-foreground font-medium">
            {ACTION_LABELS[r.actionTaken] ?? r.actionTaken}
          </span>
        ) : (
          <span className="text-[10px] text-muted-foreground/60">—</span>
        ),
    },
    {
      id: 'createdAt',
      header: 'Date',
      width: 110,
      sort: { kind: 'number', value: (r) => new Date(r.createdAt).getTime() },
      cell: (r) => (
        <span className="tabular-nums text-[11px] text-muted-foreground">
          {new Date(r.createdAt).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      ),
    },
  ];

  const facetDefs: GridFacetDef<ModerationReportItem>[] = [
    {
      id: 'status',
      label: 'Statut',
      values: [
        { id: 'pending', label: 'En attente', test: (r) => r.status === 'pending' },
        { id: 'resolved', label: 'Résolus', test: (r) => r.status === 'resolved' },
        { id: 'dismissed', label: 'Ignorés', test: (r) => r.status === 'dismissed' },
      ],
    },
    {
      id: 'targetType',
      label: 'Type de cible',
      values: [
        { id: 'thought', label: 'Pensées', test: (r) => r.targetType === 'thought' },
        { id: 'article', label: 'Articles', test: (r) => r.targetType === 'article' },
        { id: 'user', label: 'Comptes', test: (r) => r.targetType === 'user' },
      ],
    },
    {
      id: 'reason',
      label: 'Motif',
      values: Object.entries(REASON_LABELS).map(([key, label]) => ({
        id: key,
        label,
        test: (r) => r.reason === key,
      })),
    },
  ];

  const visible = filterRows(items, grid.state.facets, facetDefs);

  const rowMenu = (report: ModerationReportItem): RowActionItem[] => {
    const isPending = report.status === 'pending';
    const isHidden = report.actionTaken === 'hide_post' || report.actionTaken === 'hide_article';

    return [
      {
        id: 'open',
        label: 'Aperçu du dossier',
        shortcut: 'Entrée',
        onSelect: () => setPreview(report),
      },
      ...(isPending
        ? [
            {
              id: 'resolve',
              label: 'Résoudre sans sanction',
              onSelect: () => void runAction(report, 'resolve'),
            },
            {
              id: 'dismiss',
              label: 'Ignorer le signalement',
              onSelect: () => void runAction(report, 'dismiss'),
            },
            ...(report.targetType === 'thought'
              ? [
                  {
                    id: 'hide_thought',
                    label: 'Masquer la pensée',
                    onSelect: () => void runAction(report, 'hide_post'),
                  },
                ]
              : []),
            ...(report.targetType === 'article'
              ? [
                  {
                    id: 'hide_article',
                    label: 'Masquer l’article',
                    onSelect: () => void runAction(report, 'hide_article'),
                  },
                ]
              : []),
            ...(report.targetType !== 'user'
              ? [
                  {
                    id: 'suspend_author',
                    label: 'Suspendre l’auteur…',
                    onSelect: () => setPreview(report),
                  },
                ]
              : []),
          ]
        : []),
      ...(isHidden
        ? [
            {
              id: 'unhide',
              label: 'Restaurer le contenu',
              onSelect: () =>
                void runAction(
                  report,
                  report.actionTaken === 'hide_post' ? 'unhide_post' : 'unhide_article'
                ),
            },
          ]
        : []),
      {
        id: 'copy-target',
        label: 'Copier l’ID cible',
        onSelect: () => void navigator.clipboard.writeText(report.targetId),
      },
      {
        id: 'copy-id',
        label: 'Copier l’ID du signalement',
        onSelect: () => void navigator.clipboard.writeText(report.id),
      },
      {
        id: 'audit',
        label: 'Voir l’audit de la cible',
        onSelect: () => router.push(`/admin/audit?subject=${encodeURIComponent(report.targetId)}`),
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
        ariaLabel="File des signalements de modération"
        rows={visible}
        columns={columns}
        initialSort={{ column: 'createdAt', direction: 'descending' }}
        sort={grid.state.sort}
        onSortChange={(sort) => grid.update({ sort } as Partial<GridViewState>)}
        hiddenColumns={grid.state.hidden}
        density={grid.state.density}
        columnOrder={grid.state.order}
        emptyState="Aucun signalement ne correspond aux filtres appliqués."
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
          <DrawerContent aria-label="Aperçu du signalement">
            <DrawerHeader>
              <DrawerTitle>
                Signalement #{preview.id.slice(0, 8)} · {preview.targetType}
              </DrawerTitle>
            </DrawerHeader>

            <DrawerBody className="space-y-4">
              <dl className="grid grid-cols-[104px_1fr] gap-x-2 gap-y-1.5 text-[12px]">
                <dt className="text-muted-foreground">ID Signalement</dt>
                <dd>
                  <CopyableId id={preview.id} />
                </dd>
                <dt className="text-muted-foreground">ID Cible</dt>
                <dd>
                  <CopyableId id={preview.targetId} />
                </dd>
                <dt className="text-muted-foreground">Type de cible</dt>
                <dd className="capitalize">{preview.targetType}</dd>
                <dt className="text-muted-foreground">Motif</dt>
                <dd className="font-medium text-destructive-text">
                  {REASON_LABELS[preview.reason] ?? preview.reason}
                </dd>
                <dt className="text-muted-foreground">Signalé par</dt>
                <dd>{preview.reporter.name || preview.reporter.username || preview.reporter.id}</dd>
                <dt className="text-muted-foreground">Date</dt>
                <dd className="tabular-nums">
                  {new Date(preview.createdAt).toLocaleString('fr-FR')}
                </dd>
                <dt className="text-muted-foreground">Statut</dt>
                <dd>
                  <span
                    className={`inline-flex rounded-full border px-1.5 py-0 text-[10px] font-medium ${
                      STATUS_CLASSES[preview.status] ?? STATUS_CLASSES.dismissed
                    }`}
                  >
                    {STATUS_LABELS[preview.status] ?? preview.status}
                  </span>
                </dd>
                {preview.actionTaken && preview.actionTaken !== 'none' && (
                  <>
                    <dt className="text-muted-foreground">Action prise</dt>
                    <dd className="font-medium">
                      {ACTION_LABELS[preview.actionTaken] ?? preview.actionTaken}
                    </dd>
                  </>
                )}
              </dl>

              {preview.targetPreview && (
                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    Aperçu du contenu signalé :
                  </span>
                  <div className="rounded border border-border bg-muted/30 p-2.5 text-[12px] leading-relaxed select-text whitespace-pre-wrap">
                    {preview.targetPreview}
                  </div>
                </div>
              )}

              {preview.details && (
                <div className="space-y-1">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    Explications du signaleur :
                  </span>
                  <div className="rounded border border-border bg-muted/20 p-2 text-[11px] text-muted-foreground leading-normal">
                    {preview.details}
                  </div>
                </div>
              )}

              {preview.status === 'pending' && (
                <div className="rounded border border-border/80 bg-background p-3 space-y-3">
                  <span className="text-[11px] font-semibold text-foreground uppercase tracking-wide">
                    Prendre une décision
                  </span>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="xs"
                      variant="soft"
                      tone="brand"
                      disabled={isSubmitting}
                      onClick={() => void runAction(preview, 'resolve')}
                    >
                      <Check className="size-3.5" />
                      Résoudre (conforme)
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      disabled={isSubmitting}
                      onClick={() => void runAction(preview, 'dismiss')}
                    >
                      <X className="size-3.5" />
                      Ignorer
                    </Button>

                    {preview.targetType === 'thought' && (
                      <Button
                        type="button"
                        size="xs"
                        variant="soft"
                        tone="danger"
                        disabled={isSubmitting}
                        onClick={() => void runAction(preview, 'hide_post')}
                      >
                        <EyeOff className="size-3.5" />
                        Masquer la pensée
                      </Button>
                    )}

                    {preview.targetType === 'article' && (
                      <Button
                        type="button"
                        size="xs"
                        variant="soft"
                        tone="danger"
                        disabled={isSubmitting}
                        onClick={() => void runAction(preview, 'hide_article')}
                      >
                        <EyeOff className="size-3.5" />
                        Masquer l’article
                      </Button>
                    )}
                  </div>

                  {preview.targetType !== 'user' && (
                    <div className="space-y-2 border-t border-border/60 pt-2.5">
                      <span className="text-[11px] text-muted-foreground">
                        Sanction lourde : suspendre l’auteur de ce contenu
                      </span>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Motif de suspension obligatoire…"
                          value={suspendNote}
                          onChange={(e) => setSuspendNote(e.target.value)}
                          className="h-7 text-[11px]"
                        />
                        <Button
                          type="button"
                          size="xs"
                          variant="solid"
                          tone="danger"
                          disabled={!suspendNote.trim() || isSubmitting}
                          onClick={() => void runAction(preview, 'suspend_author', suspendNote)}
                        >
                          <Ban className="size-3.5" />
                          Suspendre
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {preview.status !== 'pending' &&
                (preview.actionTaken === 'hide_post' || preview.actionTaken === 'hide_article') && (
                  <div className="rounded border border-border bg-muted/20 p-3 space-y-2">
                    <span className="text-[11px] text-muted-foreground">
                      Contenu actuellement masqué.
                    </span>
                    <div>
                      <Button
                        type="button"
                        size="xs"
                        variant="soft"
                        tone="brand"
                        disabled={isSubmitting}
                        onClick={() =>
                          void runAction(
                            preview,
                            preview.actionTaken === 'hide_post' ? 'unhide_post' : 'unhide_article'
                          )
                        }
                      >
                        <Eye className="size-3.5" />
                        Restaurer le contenu
                      </Button>
                    </div>
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
                    router.push(`/admin/audit?subject=${encodeURIComponent(preview.targetId)}`)
                  }
                >
                  <ShieldCheck className="size-3.5" />
                  Journal d’audit
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
