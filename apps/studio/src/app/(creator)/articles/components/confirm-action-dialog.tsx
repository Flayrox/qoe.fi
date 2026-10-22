'use client';

import React, { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@qoe/utils';
import { toast } from '@qoe/ui/toast';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@qoe/ui';
import { t } from '@lingui/core/macro';

export interface ConfirmAction {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => Promise<void> | void;
}

export function ConfirmActionDialog({
  action,
  onClose,
}: {
  action: ConfirmAction | null;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);

  const handleConfirm = async () => {
    if (!action) return;
    setPending(true);
    try {
      await action.onConfirm();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t`Une erreur est survenue.`);
    } finally {
      setPending(false);
      onClose();
    }
  };

  return (
    <Dialog
      open={Boolean(action)}
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent className="max-w-md p-6">
        <DialogHeader className="space-y-1.5">
          <div
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-full border',
              action?.destructive
                ? 'border-destructive/30 bg-destructive/10 text-destructive'
                : 'border-primary/20 bg-primary/10 text-primary'
            )}
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <DialogTitle className="pt-1 text-base font-bold">{action?.title}</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed text-muted-foreground">
            {action?.description}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-xl px-4 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            {t`Annuler`}
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={pending}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-50',
              action?.destructive
                ? 'bg-destructive hover:bg-destructive/90'
                : 'bg-primary hover:bg-primary/90'
            )}
          >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {action?.confirmLabel}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
