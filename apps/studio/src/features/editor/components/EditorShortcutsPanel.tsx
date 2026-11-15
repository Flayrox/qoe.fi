'use client';

import { Keyboard } from 'lucide-react';
import { t } from '@lingui/core/macro';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@qoe/ui/dialog';
import { useAltKey, useModKey } from '../hooks/useModKey';

export interface EditorShortcutsPanelProps {
  open: boolean;
  onClose: () => void;
}

interface ShortcutGroup {
  title: string;
  items: Array<{ keys: string; label: string }>;
}

/**
 * Aide des raccourcis de l'éditeur. Elle liste ce qui existe réellement :
 * enregistrement, lien, annotation, mise en forme et sélection d'image.
 */
export function EditorShortcutsPanel({ open, onClose }: EditorShortcutsPanelProps) {
  const MOD = useModKey();
  const ALT = useAltKey();

  const groups: ShortcutGroup[] = [
    {
      title: t`Écriture`,
      items: [
        { keys: `${MOD}S`, label: t`Enregistrer` },
        { keys: `${MOD}K`, label: t`Ajouter ou modifier un lien` },
        { keys: `${MOD}⇧A`, label: t`Annoter le passage sélectionné` },
        { keys: `${ALT} + clic`, label: t`Ouvrir une annotation` },
      ],
    },
    {
      title: t`Mise en forme`,
      items: [
        { keys: `${MOD}B`, label: t`Gras` },
        { keys: `${MOD}I`, label: t`Italique` },
        { keys: `${MOD}U`, label: t`Souligné` },
        { keys: `${MOD}⇧B`, label: t`Citation` },
        { keys: `${MOD}${ALT}A`, label: t`Alinéa de première ligne` },
        { keys: `${MOD}${ALT}C`, label: t`Bloc de code` },
      ],
    },
    {
      title: t`Images et navigation`,
      items: [
        { keys: '↑ / ↓', label: t`Sélectionner une image voisine` },
        { keys: 'Entrée', label: t`Ouvrir les détails de l'image sélectionnée` },
        { keys: 'Échap', label: t`Fermer un panneau` },
      ],
    },
  ];

  return (
    <Dialog
      open={open}
      size="md"
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent aria-label={t`Raccourcis de l'éditeur`}>
        <DialogHeader>
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
              <Keyboard className="size-3.5" strokeWidth={2} />
            </span>
            <div>
              <DialogTitle className="text-sm font-semibold">
                {t`Raccourcis de l'éditeur`}
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-[11px]">
                {t`Les gestes qui font gagner du temps, sans quitter le clavier.`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-4 py-1">
          {groups.map((group) => (
            <section key={group.title} className="space-y-1.5">
              <h3 className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                {group.title}
              </h3>
              <dl className="divide-y divide-border/40 overflow-hidden rounded-lg border border-border/50">
                {group.items.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between gap-3 px-2.5 py-1.5"
                  >
                    <dt className="text-[11px] text-foreground">{item.label}</dt>
                    <dd>
                      <kbd className="rounded-md border border-border/60 bg-muted/50 px-1.5 py-0.5 font-sans text-[10px] text-muted-foreground">
                        {item.keys}
                      </kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </DialogBody>

        <DialogFooter>
          <DialogClose>{t`Fermer`}</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
