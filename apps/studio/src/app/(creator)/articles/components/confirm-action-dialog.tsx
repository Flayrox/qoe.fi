'use client';

import React, { useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@qoe/utils';
import { toast } from '@qoe/ui/toast';
import { Button } from '@qoe/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@qoe/ui/dialog';
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
      size="md"
      isDismissable={!pending}
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent role="alertdialog">
        <DialogHeader className="space-y-1.5">
          <div
            className={cn(
              'flex h-11 w-11 items-center justify-center rounded-full border',
              action?.destructive
                ? 'border-destructive/30 bg-destructive/10 text-destructive-text'
                : 'border-primary/20 bg-primary/10 text-primary'
            )}
          >
            <AlertTriangle className="h-5 w-5" />
          </div>
          <DialogTitle className="pt-1">{action?.title}</DialogTitle>
          <DialogDescription>{action?.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
            {t`Annuler`}
          </Button>
          <Button
            variant="solid"
            tone={action?.destructive ? 'danger' : 'brand'}
            size="sm"
            onClick={() => void handleConfirm()}
            disabled={pending}
          >
            {pending && <Loader2 className="animate-spin" />}
            {action?.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
