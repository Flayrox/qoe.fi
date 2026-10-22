'use client';

import React from 'react';
import { Highlighter, Trash2, X } from 'lucide-react';
import { t } from '@lingui/core/macro';

export interface AnnotationPopoverProps {
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

export function AnnotationPopover({
  open,
  position,
  quote,
  note,
  onChangeNote,
  onSave,
  onDelete,
  onClose,
  canDelete,
}: AnnotationPopoverProps) {
  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-transparent" onClick={onClose} />

      <div
        style={
          position
            ? {
                position: 'fixed',
                top: `${position.top}px`,
                left: `${position.left}px`,
              }
            : {
                position: 'fixed',
                top: '96px',
                left: '50%',
                transform: 'translateX(-50%)',
              }
        }
        className="z-50 w-[380px] max-w-[calc(100vw-32px)] bg-card/95 backdrop-blur-xl border border-border/80 rounded-2xl p-4 shadow-[0_20px_50px_rgba(0,0,0,0.18)] animate-in fade-in-0 zoom-in-95 duration-150 font-sans space-y-3"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <Highlighter className="w-3.5 h-3.5" strokeWidth={2} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-foreground">{t`Note d'auteur`}</h4>
              <p className="text-[10px] text-muted-foreground">
                {t`Visible par les lecteurs en marge`}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
            title={t`Fermer`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {quote && (
          <div className="bg-muted/30 border border-border/30 rounded-xl px-2.5 py-1.5">
            <p className="text-[11px] text-muted-foreground italic font-sans line-clamp-2 leading-relaxed">
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
              } else if (event.key === 'Escape') {
                event.preventDefault();
                onClose();
              }
            }}
            placeholder={t`Ajoutez une note, précision ou source...`}
            className="w-full bg-background border border-border/60 rounded-xl p-2.5 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 resize-none font-sans leading-relaxed transition-all"
          />
          <div className="flex items-center justify-between text-[10px] text-muted-foreground/70 mt-1">
            <span>{t`⌘ + Entrée pour enregistrer`}</span>
            <span>{note.length} car.</span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border/30">
          {canDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="px-2.5 py-1.5 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5"
              title={t`Supprimer l'annotation`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t`Supprimer`}</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 cursor-pointer transition-colors"
            >
              {t`Annuler`}
            </button>
            <button
              type="button"
              disabled={!note.trim()}
              onClick={onSave}
              className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground font-bold text-xs hover:opacity-90 cursor-pointer disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-sm"
            >
              <span>{t`Enregistrer`}</span>
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
