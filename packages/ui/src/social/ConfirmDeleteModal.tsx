'use client';

import React, { useState } from 'react';
import { t } from '@lingui/core/macro';
import { Trash2, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';

export interface ConfirmDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<boolean> | boolean | void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export function ConfirmDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  title = t`Supprimer cette pensée ?`,
  description = t`Cette action est irréversible. La pensée et ses interactions seront définitivement retirées de la plateforme.`,
  confirmLabel = t`Supprimer`,
  cancelLabel = t`Annuler`,
}: ConfirmDeleteModalProps) {
  const [pending, setPending] = useState(false);

  const handleConfirm = async () => {
    setPending(true);
    try {
      const ok = await onConfirm();
      if (ok !== false) onClose();
    } catch {
      onClose();
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent className="max-w-md p-6 rounded-2xl bg-card border border-border/40 shadow-2xl font-sans">
        <DialogHeader className="space-y-1.5">
          <div className="w-11 h-11 rounded-full bg-destructive/10 border border-destructive/30 text-destructive flex items-center justify-center">
            <Trash2 className="w-5 h-5" />
          </div>
          <DialogTitle className="text-base font-bold text-foreground pt-1">{title}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="px-4 py-2 rounded-xl text-xs font-medium text-muted-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={pending}
            className="px-4 py-2 rounded-xl bg-destructive text-white font-semibold text-xs hover:bg-destructive/90 transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50 shadow-sm"
          >
            {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{confirmLabel}</span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
