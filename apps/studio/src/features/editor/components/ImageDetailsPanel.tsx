'use client';

import { ImageIcon, X } from 'lucide-react';
import { t } from '@lingui/core/macro';
import { Button } from '@qoe/ui/button';
import { Input } from '@qoe/ui/input';
import { PopoverPanel } from '@qoe/ui/popover-panel';

export interface ImageDetails {
  alt: string;
  caption: string;
  credit: string;
}

export interface ImageDetailsPanelProps {
  open: boolean;
  position: { top: number; left: number } | null;
  value: ImageDetails;
  onChange: (value: ImageDetails) => void;
  onSave: () => void;
  onClose: () => void;
}

const FIELDS = [
  {
    key: 'alt',
    label: t`Description (alt)`,
    placeholder: t`Décrivez l'image pour les lecteurs d'écran`,
  },
  {
    key: 'caption',
    label: t`Légende`,
    placeholder: t`Texte affiché sous l'image`,
  },
  {
    key: 'credit',
    label: t`Crédit photo`,
    placeholder: t`Nom du photographe ou de l'agence`,
  },
] as const;

/**
 * Détails d'une image insérée dans l'éditeur (alt, légende, crédit).
 *
 * Trois champs, un seul geste : Entrée enregistre. Le panneau, son focus
 * et sa fermeture viennent de `PopoverPanel` ; les champs du contrat
 * portent densité, bordure et anneau de focus.
 */
export function ImageDetailsPanel({
  open,
  position,
  value,
  onChange,
  onSave,
  onClose,
}: ImageDetailsPanelProps) {
  return (
    <PopoverPanel open={open} onClose={onClose} label={t`Détails de l'image`} anchor={position}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
            <ImageIcon className="size-3.5" strokeWidth={2} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-foreground">{t`Détails de l'image`}</h4>
            <p className="text-[10px] text-muted-foreground">
              {t`Description, légende et crédit photo`}
            </p>
          </div>
        </div>

        <Button size="xs" shape="icon" variant="ghost" onClick={onClose} aria-label={t`Fermer`}>
          <X />
        </Button>
      </div>

      <div className="space-y-2">
        {FIELDS.map((field, index) => (
          <label key={field.key} className="block space-y-1">
            <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              {field.label}
            </span>
            <Input
              autoFocus={index === 0}
              type="text"
              size="sm"
              value={value[field.key]}
              onChange={(event) => onChange({ ...value, [field.key]: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onSave();
                }
              }}
              placeholder={field.placeholder}
            />
          </label>
        ))}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border/30 pt-2">
        <Button size="xs" variant="ghost" onClick={onClose}>
          {t`Annuler`}
        </Button>
        <Button size="xs" variant="solid" tone="brand" onClick={onSave}>
          {t`Enregistrer`}
        </Button>
      </div>
    </PopoverPanel>
  );
}
