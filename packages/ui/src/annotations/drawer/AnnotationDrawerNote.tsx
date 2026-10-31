'use client';

import type { FormEvent } from 'react';
import { Check, Loader2, PenLine } from 'lucide-react';

import { Button } from '../../primitives/button/button';
import { Textarea } from '../../primitives/input/input';
import { t } from '@lingui/core/macro';

/**
 * La note : le cœur du panneau.
 *
 * Elle se lit comme un paragraphe, sans carte ni filet décoratif. Un
 * surlignage nu n'affiche pas un formulaire vide : il dit ce qu'il est et
 * propose de devenir une annotation.
 */
export function AnnotationDrawerNote({
  note,
  isEditing,
  draft,
  saving,
  error,
  onDraftChange,
  onStart,
  onCancel,
  onSave,
}: {
  note: string | null | undefined;
  isEditing: boolean;
  draft: string;
  saving: boolean;
  /** Refus du serveur : la note affichée reste celle d’avant la tentative. */
  error?: string | null;
  onDraftChange: (value: string) => void;
  onStart: () => void;
  onCancel: () => void;
  onSave: (event: FormEvent) => void;
}) {
  const hasNote = Boolean(note?.trim());

  return (
    <section data-annotation-note className="space-y-2 border-t border-border/40 pt-4">
      <h3 className="type-control-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t`Note`}
      </h3>

      {isEditing ? (
        <form onSubmit={onSave} className="rounded-panel border border-border/60 p-3">
          <Textarea
            autoFocus
            size="sm"
            rows={3}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            placeholder={
              hasNote ? t`Modifier votre réflexion...` : t`Ce que ce passage vous dit...`
            }
            aria-label={hasNote ? t`Votre note` : t`Ajouter une note à ce surlignage`}
            className="border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
          />

          {error && (
            <p role="alert" className="mt-2 text-sm leading-5 text-destructive-text">
              {error}
            </p>
          )}

          <div className="mt-3 flex items-end justify-between gap-3">
            <p className="text-sm leading-5 text-muted-foreground">
              {hasNote
                ? t`Le texte fait l’annotation : sans lui, il ne reste qu’un surlignage.`
                : t`Enregistrer ce texte transforme le surlignage en annotation.`}
            </p>
            <div className="flex shrink-0 gap-1.5">
              <Button size="xs" variant="ghost" onClick={onCancel}>
                {t`Annuler`}
              </Button>
              <Button
                type="submit"
                size="xs"
                variant="solid"
                tone="brand"
                disabled={saving || !draft.trim()}
                aria-busy={saving}
              >
                {saving ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
                {hasNote ? t`Enregistrer` : t`Annoter`}
              </Button>
            </div>
          </div>
        </form>
      ) : hasNote ? (
        <p className="whitespace-pre-line text-sm leading-7 text-foreground">{note}</p>
      ) : (
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">{t`Ce passage est surligné.`}</p>
            <Button size="xs" variant="ghost" tone="brand" onClick={onStart}>
              <PenLine aria-hidden />
              {t`Ajouter une note`}
            </Button>
          </div>
          <p className="text-sm leading-6 text-muted-foreground">
            {t`Un repère de lecture. Ajoutez un texte pour en faire une annotation.`}
          </p>
        </div>
      )}
    </section>
  );
}
