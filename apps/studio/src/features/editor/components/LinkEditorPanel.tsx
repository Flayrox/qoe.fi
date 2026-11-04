'use client';

import { Link2, Trash2, X } from 'lucide-react';
import { t } from '@lingui/core/macro';
import { Button } from '@qoe/ui/button';
import { FieldError } from '@qoe/ui/field-error';
import { Input } from '@qoe/ui/input';
import { PopoverPanel } from '@qoe/ui/popover-panel';

export interface LinkEditorPanelProps {
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

/**
 * Édition d'un lien dans l'éditeur.
 *
 * Le panneau flottant et son comportement (Échap, clic extérieur, focus)
 * viennent de `PopoverPanel` ; le champ et son erreur du contrat. Il ne
 * reste ici que la décision métier : appliquer, ou retirer le lien.
 */
export function LinkEditorPanel({
  open,
  position,
  value,
  onChange,
  onApply,
  onRemove,
  onClose,
  canRemove,
  error,
}: LinkEditorPanelProps) {
  return (
    <PopoverPanel open={open} onClose={onClose} label={t`Lien`} anchor={position}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
            <Link2 className="size-3.5" strokeWidth={2} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-foreground">{t`Lien`}</h4>
            <p className="text-[10px] text-muted-foreground">
              {t`Laissez vide ou retirez le lien existant`}
            </p>
          </div>
        </div>

        <Button size="xs" shape="icon" variant="ghost" onClick={onClose} aria-label={t`Fermer`}>
          <X />
        </Button>
      </div>

      <Input
        autoFocus
        type="text"
        inputMode="url"
        size="sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onApply();
          }
        }}
        placeholder={t`https://exemple.com ou /rubrique/article`}
        invalid={Boolean(error)}
        aria-describedby={error ? 'link-url-error' : undefined}
      />

      {/* L'erreur s'annonce (role=alert) et le champ la référence :
          sans `aria-describedby`, elle n'existe que pour les voyants. */}
      <FieldError id="link-url-error">{error}</FieldError>

      <div className="flex items-center justify-between border-t border-border/30 pt-2">
        {canRemove ? (
          <Button
            size="xs"
            variant="outline"
            tone="danger"
            onClick={onRemove}
            aria-label={t`Retirer le lien`}
          >
            <Trash2 />
            {t`Retirer`}
          </Button>
        ) : (
          <span className="text-[10px] text-muted-foreground/70">{t`⌘K`}</span>
        )}

        <div className="flex items-center gap-2">
          <Button size="xs" variant="ghost" onClick={onClose}>
            {t`Annuler`}
          </Button>
          <Button size="xs" variant="solid" tone="brand" onClick={onApply}>
            {t`Appliquer`}
          </Button>
        </div>
      </div>
    </PopoverPanel>
  );
}
