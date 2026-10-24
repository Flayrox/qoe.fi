'use client';

import React from 'react';
import { ImageIcon, X } from 'lucide-react';
import { t } from '@lingui/core/macro';

export interface ImageDetails {
  alt: string;
  caption: string;
  credit: string;
}

export interface ImageDetailsPopoverProps {
  open: boolean;
  position: { top: number; left: number } | null;
  value: ImageDetails;
  onChange: (value: ImageDetails) => void;
  onSave: () => void;
  onClose: () => void;
}

export function ImageDetailsPopover({
  open,
  position,
  value,
  onChange,
  onSave,
  onClose,
}: ImageDetailsPopoverProps) {
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
              <ImageIcon className="w-3.5 h-3.5" strokeWidth={2} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-foreground">{t`Détails de l'image`}</h4>
              <p className="text-[10px] text-muted-foreground">
                {t`Description, légende et crédit photo`}
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

        <div className="space-y-2">
          <label className="block space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t`Description (alt)`}
            </span>
            <input
              autoFocus
              type="text"
              value={value.alt}
              onChange={(event) => onChange({ ...value, alt: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onSave();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  onClose();
                }
              }}
              placeholder={t`Décrivez l'image pour les lecteurs d'écran`}
              className="w-full bg-background border border-border/60 rounded-xl px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 font-sans transition-all"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t`Légende`}
            </span>
            <input
              type="text"
              value={value.caption}
              onChange={(event) => onChange({ ...value, caption: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onSave();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  onClose();
                }
              }}
              placeholder={t`Texte affiché sous l'image`}
              className="w-full bg-background border border-border/60 rounded-xl px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 font-sans transition-all"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t`Crédit photo`}
            </span>
            <input
              type="text"
              value={value.credit}
              onChange={(event) => onChange({ ...value, credit: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onSave();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  onClose();
                }
              }}
              placeholder={t`Nom du photographe ou de l'agence`}
              className="w-full bg-background border border-border/60 rounded-xl px-2.5 py-2 text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 font-sans transition-all"
            />
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/30">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 cursor-pointer transition-colors"
          >
            {t`Annuler`}
          </button>
          <button
            type="button"
            onClick={onSave}
            className="px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground font-bold text-xs hover:opacity-90 cursor-pointer transition-all shadow-sm"
          >
            {t`Enregistrer`}
          </button>
        </div>
      </div>
    </>
  );
}
