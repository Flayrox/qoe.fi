'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Building2, Loader2, UserRound } from 'lucide-react';
import { t } from '@lingui/core/macro';
import { toast } from '@qoe/ui/toast';
import { Button } from '@qoe/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@qoe/ui/dialog';
import {
  getWorkspacesAction,
  transferArticleAction,
  type ArticleWorkspaceItem,
} from '@qoe/sdk/actions/articles';

/** Rôles média autorisés à créer un article (donc à en recevoir un). */
const TRANSFER_ROLES = new Set(['owner', 'editor', 'writer']);

function canReceiveTransfer(workspace: ArticleWorkspaceItem): boolean {
  if (workspace.type === 'PERSONAL') return true;
  return Boolean(workspace.role && TRANSFER_ROLES.has(workspace.role));
}

export function ArticleBulkTransferDialog({
  open,
  onOpenChange,
  selectedIds,
  selectedCount,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  selectedCount: number;
  onApplied: () => Promise<void> | void;
}) {
  const [workspaces, setWorkspaces] = useState<ArticleWorkspaceItem[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [targetId, setTargetId] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadState('loading');
    setTargetId(null);
    setProgress(0);
    getWorkspacesAction()
      .then((res) => {
        if (cancelled) return;
        if (!res.ok || !res.data) {
          setLoadState('error');
          return;
        }
        setWorkspaces([res.data.personal, ...(res.data.medias ?? [])].filter(canReceiveTransfer));
        setLoadState('ready');
      })
      .catch(() => {
        if (!cancelled) setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const target = useMemo(
    () => workspaces.find((workspace) => workspace.id === targetId) ?? null,
    [workspaces, targetId]
  );

  const apply = async () => {
    if (!targetId || selectedIds.length === 0 || transferring) return;
    setTransferring(true);
    setProgress(0);

    let updated = 0;
    const failed: string[] = [];
    for (const [index, id] of selectedIds.entries()) {
      try {
        const res = await transferArticleAction({
          articleId: id,
          targetPublisherId: targetId,
        });
        if (res.ok && res.data) updated += 1;
        else failed.push(id);
      } catch {
        failed.push(id);
      }
      setProgress(index + 1);
    }

    setTransferring(false);
    if (updated > 0) {
      toast.success(`${updated} ${updated > 1 ? t`articles transférés` : t`article transféré`}.`);
    }
    if (failed.length > 0) {
      toast.error(
        `${failed.length} ${
          failed.length > 1
            ? t`articles n'ont pas pu être transférés`
            : t`article n'a pas pu être transféré`
        }.`
      );
    }
    onOpenChange(false);
    await onApplied();
  };

  return (
    <Dialog
      open={open}
      size="lg"
      isDismissable={!transferring}
      onOpenChange={(next) => {
        if (!transferring) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>{t`Transférer ${selectedCount} article(s)`}</DialogTitle>
          <DialogDescription>
            {t`Choisissez la publication de destination. Les articles déjà publiés dans un média sans droit de publication repasseront en revue.`}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-2 pt-1">
          {loadState === 'loading' && (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              {t`Chargement des publications…`}
            </div>
          )}

          {loadState === 'error' && (
            <p className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-xs text-destructive-text">
              {t`Impossible de charger vos publications. Réessayez dans un instant.`}
            </p>
          )}

          {loadState === 'ready' && workspaces.length === 0 && (
            <p className="rounded-lg border border-border/40 bg-muted/20 p-3 text-xs text-muted-foreground">
              {t`Aucune publication ne peut recevoir ces articles.`}
            </p>
          )}

          {loadState === 'ready' && workspaces.length > 0 && (
            <div className="grid grid-cols-1 gap-1.5">
              {workspaces.map((workspace) => {
                const selected = workspace.id === targetId;
                return (
                  <Button
                    key={`${workspace.type}-${workspace.id}`}
                    variant={selected ? 'soft' : 'outline'}
                    tone={selected ? 'brand' : 'neutral'}
                    size="sm"
                    disabled={transferring}
                    onClick={() => setTargetId(workspace.id)}
                    className="w-full justify-between"
                  >
                    <span className="inline-flex min-w-0 items-center gap-2">
                      {workspace.type === 'MEDIA' ? (
                        <Building2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                      ) : (
                        <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate">{workspace.name}</span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {workspace.type === 'MEDIA' ? t`Média` : t`Personnel`}
                      </span>
                    </span>
                    {selected && <ArrowRightLeft className="h-3.5 w-3.5 text-primary" />}
                  </Button>
                );
              })}
            </div>
          )}

          {transferring && (
            <p className="text-[11px] text-muted-foreground">
              {t`Transfert en cours…`} {progress}/{selectedIds.length}
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={transferring}
          >
            {t`Annuler`}
          </Button>
          <Button
            variant="solid"
            tone="brand"
            size="sm"
            onClick={() => void apply()}
            disabled={!target || transferring || selectedIds.length === 0}
          >
            {transferring && <Loader2 className="animate-spin" />}
            {target ? t`Transférer vers ${target.name}` : t`Transférer`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
