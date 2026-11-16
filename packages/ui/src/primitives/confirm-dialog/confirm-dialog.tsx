'use client';

import { useState } from 'react';
import { t } from '@lingui/core/macro';

import { cn } from '@qoe/utils';

import { Icon } from '../../icons';
import { toast } from '../../ui/toast';
import { Button } from '../button/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../dialog/dialog';

// =====================================================================
// ✅ ConfirmDialog — une confirmation qui dit quoi, pourquoi, et attend
// =====================================================================
// 📖 Le motif « êtes-vous sûr ? » revenait réimplémenté écran par écran :
//    un `Dialog`, une icône d'alerte, deux boutons, un état `pending` et un
//    toast d'échec. Le contrat le porte une fois.
//
// 🎯 Trois garanties :
//    - `action === null` ferme le dialogue (pas d'état dupliqué) ;
//    - `role="alertdialog"` + titre/description liés par react-aria ;
//    - l'action reste ouverte pendant l'attente, et un échec est annoncé.
// =====================================================================

export interface ConfirmAction {
  /** Titre court, à l'impératif — ce que la personne s'apprête à faire. */
  title: string;
  /** Conséquence concrète, en une phrase. */
  description: string;
  /** Libellé du bouton de confirmation (verbe, pas « OK »). */
  confirmLabel: string;
  /** Teinte danger + icône d'alerte pour une action irréversible. */
  destructive?: boolean;
  /** Rejoue l'action ; un rejet est affiché en toast et laisse le dialogue ouvert. */
  onConfirm: () => Promise<void> | void;
}

export interface ConfirmDialogProps {
  /** L'action en attente de confirmation, ou `null` quand rien n'est ouvert. */
  action: ConfirmAction | null;
  onClose: () => void;
}

export function ConfirmDialog({ action, onClose }: ConfirmDialogProps) {
  const [pending, setPending] = useState(false);

  const handleConfirm = async () => {
    if (!action) return;
    setPending(true);
    try {
      await action.onConfirm();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t`Une erreur est survenue.`);
    } finally {
      setPending(false);
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
              'flex size-11 items-center justify-center rounded-control border',
              action?.destructive
                ? 'border-destructive/30 bg-destructive/10 text-destructive-text'
                : 'border-primary/20 bg-primary/10 text-primary'
            )}
          >
            <Icon name="triangle-alert" />
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
            loading={pending}
            onClick={() => void handleConfirm()}
          >
            {action?.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
