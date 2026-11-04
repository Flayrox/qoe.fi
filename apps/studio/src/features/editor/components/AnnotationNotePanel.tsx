'use client';

import { Highlighter, Trash2, X } from 'lucide-react';
import { t } from '@lingui/core/macro';
import { Button } from '@qoe/ui/button';
import { PopoverPanel } from '@qoe/ui/popover-panel';

export interface AnnotationNotePanelProps {
  open: boolean;
  position: { top: number; left: number } | null;
  quote: string;
  note: string;
  onChangeNote: (value: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onClose: () => void;
  canDelete: boolean;
}

/**
 * Note d'auteur posée sur une sélection de l'éditeur.
 *
 * Ce n'est plus un overlay fait main : `PopoverPanel` apporte le focus
 * déplacé dans le panneau, Échap, le clic extérieur et le retour du focus
 * à l'éditeur. Ici on ne garde que le contenu et le geste ⌘+Entrée.
 */
export function AnnotationNotePanel({
  open,
  position,
  quote,
  note,
  onChangeNote,
  onSave,
  onDelete,
  onClose,
  canDelete,
}: AnnotationNotePanelProps) {
  return (
    <PopoverPanel open={open} onClose={onClose} label={t`Note d'auteur`} anchor={position}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
            <Highlighter className="size-3.5" strokeWidth={2} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-foreground">{t`Note d'auteur`}</h4>
            <p className="text-[10px] text-muted-foreground">
              {t`Visible par les lecteurs en marge`}
            </p>
          </div>
        </div>

        <Button size="xs" shape="icon" variant="ghost" onClick={onClose} aria-label={t`Fermer`}>
          <X />
        </Button>
      </div>

      {quote && (
        <div className="rounded-xl border border-border/30 bg-muted/30 px-2.5 py-1.5">
          <p className="line-clamp-2 font-sans text-[11px] leading-relaxed text-muted-foreground italic">
            « {quote} »
          </p>
        </div>
      )}

      <div>
        <textarea
          autoFocus
          rows={3}
          value={note}
          onChange={(event) => onChangeNote(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault();
              onSave();
            }
          }}
          placeholder={t`Ajoutez une note, précision ou source...`}
          className="w-full resize-none rounded-xl border border-border/60 bg-background p-2.5 font-sans text-xs leading-relaxed text-foreground transition-all placeholder:text-muted-foreground/40 focus:border-primary/60 focus:ring-1 focus:ring-primary/30 focus:outline-none"
        />
        <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground/70">
          <span>{t`⌘ + Entrée pour enregistrer`}</span>
          <span>{note.length} car.</span>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border/30 pt-2">
        {canDelete ? (
          <Button
            size="xs"
            variant="outline"
            tone="danger"
            onClick={onDelete}
            aria-label={t`Supprimer l'annotation`}
          >
            <Trash2 />
            {t`Supprimer`}
          </Button>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-2">
          <Button size="xs" variant="ghost" onClick={onClose}>
            {t`Annuler`}
          </Button>
          <Button size="xs" variant="solid" tone="brand" disabled={!note.trim()} onClick={onSave}>
            {t`Enregistrer`}
          </Button>
        </div>
      </div>
    </PopoverPanel>
  );
}
