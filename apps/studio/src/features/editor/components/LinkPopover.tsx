'use client';

import React from 'react';
import { Link2, Trash2, X } from 'lucide-react';
import { t } from '@lingui/core/macro';

export interface LinkPopoverProps {
  open: boolean;
  position: { top: number; left: number } | null;
  value: string;
  onChange: (value: string) => void;
  onApply: () => void;
  onRemove: () => void;
  onClose: () => void;
  canRemove: boolean;
  error?: string | null;
}

export function LinkPopover({
  open,
  position,
  value,
  onChange,
  onApply,
  onRemove,
  onClose,
  canRemove,
  error,
}: LinkPopoverProps) {
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
              <Link2 className="w-3.5 h-3.5" strokeWidth={2} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-foreground">{t`Lien`}</h4>
              <p className="text-[10px] text-muted-foreground">
                {t`Laissez vide ou retirez le lien existant`}
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

        <input
          autoFocus
          type="text"
          inputMode="url"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onApply();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
            }
          }}
          placeholder={t`https://exemple.com ou /rubrique/article`}
          className="w-full bg-background border border-border/60 rounded-xl px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 font-sans transition-all"
        />

        {error && <p className="text-[11px] text-destructive font-sans">{error}</p>}

        <div className="flex items-center justify-between pt-2 border-t border-border/30">
          {canRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="px-2.5 py-1.5 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1.5"
              title={t`Retirer le lien`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t`Retirer`}</span>
            </button>
          ) : (
            <span className="text-[10px] text-muted-foreground/70">{t`⌘K`}</span>
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
              onClick={onApply}
              className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground font-bold text-xs hover:opacity-90 cursor-pointer transition-all shadow-sm"
            >
              {t`Appliquer`}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
