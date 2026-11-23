'use client';

// =====================================================================
// 📝 PromptDialog — une saisie courte sans quitter la page
// =====================================================================
// 📖 `window.prompt` / `window.confirm` ne peuvent pas être mis en forme,
//    n'offrent pas de champ multiligne, ne disent pas pourquoi on demande, et
//    bloquent l'onglet entier. La console en avait encore deux (nom de vue
//    enregistrée, raison d'un bannissement) alors que le design system fournit
//    déjà `Dialog`, `Input`, `Textarea` et `Checkbox`.
//
// 🎯 Un seul contrat pour les deux : un titre, une raison, un champ (facultatif
//    multiligne), une case à cocher optionnelle et un bouton qui dit ce qu'il
//    fait. Le bouton reste inerte tant que la saisie obligatoire est vide.
// =====================================================================

import * as React from 'react';
import { Checkbox } from '@qoe/ui/checkbox';
import { Button } from '@qoe/ui/button';
import { Input, Textarea } from '@qoe/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@qoe/ui/dialog';

export interface PromptRequest {
  /** Titre court, à l'impératif — ce qu'on demande. */
  title: string;
  /** Pourquoi on le demande et ce que la valeur devient. */
  description: string;
  /** Libellé du champ, associé au contrôle (`<label for>`). */
  label: string;
  /** Libellé du bouton de validation (un verbe, jamais « OK »). */
  confirmLabel: string;
  placeholder?: string;
  /** Champ de plusieurs lignes (motif, note). */
  multiline?: boolean;
  /** Interdit la validation tant que le champ est vide. */
  required?: boolean;
  defaultValue?: string;
  /** Case à cocher optionnelle, avec sa valeur par défaut. */
  checkbox?: { label: string; defaultChecked?: boolean };
  /** Reçoit la valeur (espaces de bord retirés) et l'état de la case. */
  onSubmit: (value: string, checked: boolean) => void;
}

export interface PromptDialogProps {
  /** La saisie en attente, ou `null` quand rien n'est ouvert. */
  request: PromptRequest | null;
  onClose: () => void;
}

export function PromptDialog({ request, onClose }: PromptDialogProps) {
  const [value, setValue] = React.useState('');
  const [checked, setChecked] = React.useState(false);
  const [seen, setSeen] = React.useState<PromptRequest | null>(null);

  // Réinitialisation à l'ouverture, ajustée pendant le rendu (motif documenté
  // par React pour « l'état dépend d'une prop ») : pas d'effet, donc pas de
  // frame avec la valeur précédente.
  if (request !== seen) {
    setSeen(request);
    setValue(request?.defaultValue ?? '');
    setChecked(request?.checkbox?.defaultChecked ?? false);
  }

  const trimmed = value.trim();
  const canSubmit = !request ? false : !request.required || trimmed.length > 0;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!request || !canSubmit) return;
    request.onSubmit(trimmed, checked);
    onClose();
  };

  return (
    <Dialog open={Boolean(request)} size="md" onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {request && (
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader className="space-y-1.5">
              <DialogTitle>{request.title}</DialogTitle>
              <DialogDescription>{request.description}</DialogDescription>
            </DialogHeader>

            <div className="space-y-1.5">
              <label
                htmlFor="prompt-dialog-field"
                className="text-xs font-medium text-muted-foreground"
              >
                {request.label}
              </label>
              {request.multiline ? (
                <Textarea
                  id="prompt-dialog-field"
                  autoFocus
                  rows={3}
                  value={value}
                  placeholder={request.placeholder}
                  onChange={(event) => setValue(event.target.value)}
                />
              ) : (
                <Input
                  id="prompt-dialog-field"
                  autoFocus
                  value={value}
                  placeholder={request.placeholder}
                  onChange={(event) => setValue(event.target.value)}
                />
              )}
            </div>

            {request.checkbox && (
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox isSelected={checked} onChange={setChecked} />
                <span>{request.checkbox.label}</span>
              </label>
            )}

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                Annuler
              </Button>
              <Button type="submit" variant="solid" disabled={!canSubmit}>
                {request.confirmLabel}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
