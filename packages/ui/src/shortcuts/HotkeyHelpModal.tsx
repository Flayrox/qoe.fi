'use client';

import React from 'react';
import { t } from '@lingui/core/macro';
import { Keyboard } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../primitives/dialog/dialog';

export interface HotkeyHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Aide des raccourcis clavier.
 *
 * 🎯 Ce qui a changé : la feuille était un `<div className="fixed inset-0">`
 *    animé à la main, avec un `onClick` sur le fond. Elle n'avait ni
 *    `role="dialog"`, ni `aria-modal`, ni piège du focus, ni Échap, et le
 *    focus restait derrière — alors qu'elle s'ouvre en pressant « ? », donc
 *    au clavier. Elle repose sur `Dialog` (react-aria), qui apporte les
 *    quatre, et sur `showCloseButton` pour la fermeture visible.
 */
export function HotkeyHelpModal({ isOpen, onClose }: HotkeyHelpModalProps) {
  const hotkeysList = [
    { key: 'n', description: t`Rédiger une nouvelle pensée (Nouveau post)` },
    { key: '/', description: t`Activer la barre de recherche` },
    { key: 'j', description: t`Naviguer vers le bas (Pensée suivante)` },
    { key: 'k', description: t`Naviguer vers le haut (Pensée précédente)` },
    { key: 'l', description: t`Liker / Déliker la pensée active` },
    { key: 'r', description: t`Répondre à la pensée active` },
    { key: 'e', description: t`Ouvrir le thread complet de la pensée` },
    { key: '?', description: t`Ouvrir cette modale d'aide des raccourcis` },
    { key: 'Échap', description: t`Fermer les modales et réinitialiser la sélection` },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md" className="max-h-[85vh]">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-control bg-primary/10 text-primary">
              <Keyboard className="size-4" aria-hidden />
            </span>
            <DialogTitle>{t`Raccourcis clavier`}</DialogTitle>
          </div>
          <DialogDescription>{t`Tout se fait sans quitter le clavier.`}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-1.5 overflow-y-auto pr-1">
          {hotkeysList.map((hk) => (
            <div
              key={hk.key}
              className="flex items-center justify-between gap-3 rounded-control bg-muted/40 px-2.5 py-2"
            >
              <span className="type-control-sm text-muted-foreground">{hk.description}</span>
              <kbd className="min-w-7 rounded-control border border-border bg-background px-2 py-0.5 text-center font-mono text-[11px] font-semibold text-foreground">
                {hk.key}
              </kbd>
            </div>
          ))}
        </div>

        <p className="border-t border-border/60 pt-3 text-center type-control-xs text-muted-foreground">
          {t`Appuyez sur`}{' '}
          <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px]">
            ?
          </kbd>{' '}
          {t`à tout moment pour afficher cette aide.`}
        </p>
      </DialogContent>
    </Dialog>
  );
}
