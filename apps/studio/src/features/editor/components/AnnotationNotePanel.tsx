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
 * Le panneau reste ancré à la sélection, mais gagne une vraie hiérarchie :
 * bandeau ambre, passage cité, zone d'écriture et actions séparées. Le
 * comportement (focus, Échap, clic extérieur) reste fourni par PopoverPanel.
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
    <PopoverPanel
      open={open}
      onClose={onClose}
      label={t`Note d'auteur`}
      anchor={position}
      className="w-[440px] overflow-hidden p-0"
    >
      <div>
        <div className="h-1 w-full bg-highlight" aria-hidden="true" />

        <div className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-xl border border-highlight/25 bg-highlight/10 text-highlight">
                <Highlighter className="size-4" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-foreground">{t`Note d'auteur`}</h4>
                <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                  {t`Visible par les lecteurs en marge`}
                </p>
              </div>
            </div>

            <Button
              size="xs"
              shape="icon"
              variant="ghost"
              onClick={onClose}
              aria-label={t`Fermer`}
              className="shrink-0"
            >
              <X />
            </Button>
          </div>

          {quote && (
            <div className="rounded-xl border border-highlight/20 bg-highlight/5 px-3 py-2">
              <p className="line-clamp-3 whitespace-pre-line font-sans text-[11px] leading-relaxed text-muted-foreground italic">
                « {quote} »
              </p>
            </div>
          )}

          <div>
            <textarea
              autoFocus
              rows={4}
              value={note}
              onChange={(event) => onChangeNote(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault();
                  onSave();
                }
              }}
              placeholder={t`Ajoutez une note, précision ou source...`}
              aria-label={t`Note d'auteur`}
              className="min-h-24 w-full resize-none rounded-xl border border-border/60 bg-background p-3 font-sans text-xs leading-relaxed text-foreground transition-all placeholder:text-muted-foreground/40 focus:border-highlight/60 focus:ring-1 focus:ring-highlight/30 focus:outline-none"
            />
            <div className="mt-1.5 flex items-center justify-between gap-3 text-[10px] text-muted-foreground/70">
              <span>{t`⌘ + Entrée pour enregistrer`}</span>
              <span className="tabular-nums">{note.length} car.</span>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border/30 pt-3">
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
              <span className="text-[10px] text-muted-foreground/60">
                {t`Ajoutez une note pour ce passage`}
              </span>
            )}

            <div className="flex items-center gap-2">
              <Button size="xs" variant="ghost" onClick={onClose}>
                {t`Annuler`}
              </Button>
              <Button
                size="xs"
                variant="solid"
                tone="brand"
                disabled={!note.trim()}
                onClick={onSave}
              >
                {t`Enregistrer`}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </PopoverPanel>
  );
}
