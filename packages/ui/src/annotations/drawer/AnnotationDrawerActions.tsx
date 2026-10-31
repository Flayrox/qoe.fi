'use client';

import { Check, Loader2, Quote } from 'lucide-react';

import { Button } from '../../primitives/button/button';
import { Textarea } from '../../primitives/input/input';
import { AnnotationCitationHeading } from '../../social/QuotedArticleCard';
import type { AnnotationCitation } from '../citation';
import { t } from '@lingui/core/macro';

/** Confirmation de suppression, posée dans le flux du tiroir. */
export function AnnotationDrawerDeleteConfirmation({
  hasNote,
  deleting,
  onCancel,
  onConfirm,
}: {
  hasNote: boolean;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="group"
      aria-label={t`Confirmer la suppression`}
      className="space-y-2.5 rounded-panel border border-destructive/25 bg-destructive/[0.04] p-3"
    >
      <p className="text-sm leading-5 text-foreground">
        {hasNote
          ? t`Supprimer cette annotation ? Sa note et sa discussion partent avec.`
          : t`Supprimer ce surlignage ? Le passage ne sera plus marqué.`}
      </p>
      <div className="flex justify-end gap-2">
        <Button size="xs" variant="ghost" autoFocus onClick={onCancel}>
          {t`Annuler`}
        </Button>
        <Button
          size="xs"
          variant="solid"
          tone="danger"
          aria-busy={deleting}
          disabled={deleting}
          onClick={onConfirm}
        >
          {deleting ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {t`Supprimer`}
        </Button>
      </div>
    </div>
  );
}

/**
 * Pourquoi la citation n'est pas proposée. Un surlignage nu n'a pas de texte
 * à citer ; une annotation privée n'est partagée avec personne. Le tiroir le
 * dit au lieu de laisser croire que le bouton manque par oubli.
 */
export function AnnotationDrawerCitationHint({
  hasNote,
  isPublicState,
}: {
  hasNote: boolean;
  isPublicState: boolean;
}) {
  if (hasNote && isPublicState) return null;

  return (
    <p
      data-annotation-citation-hint
      className="rounded-panel border border-border/40 bg-muted/20 px-3 py-2.5 text-sm leading-6 text-muted-foreground"
    >
      {hasNote
        ? t`Cette annotation est privée : vous seul la voyez. Rendez-la publique pour la citer sur Qoefi.`
        : t`Un surlignage n’a pas de texte à citer. Ajoutez une note pour publier ce passage comme annotation.`}
    </p>
  );
}

/**
 * Publication d'une annotation comme citation.
 *
 * La note et son auteur sont la citation ; le passage et l'article en sont
 * la preuve. L'aperçu emploie la même couche que la carte du feed : ce qu'on
 * voit ici est ce qui atterrit sur Qoefi, sans seconde mise en scène.
 */
export function AnnotationDrawerCitation({
  showForm,
  success,
  citation,
  commentary,
  publishing,
  error,
  postHref,
  onCommentaryChange,
  onCancel,
  onSubmit,
}: {
  showForm: boolean;
  success: boolean;
  citation: AnnotationCitation | null;
  commentary: string;
  publishing: boolean;
  /** Refus du serveur (annotation devenue privée, supprimée…). */
  error?: string | null;
  /** Lien vers la citation publiée (chemin ou URL), si le serveur le rend. */
  postHref: string | null;
  onCommentaryChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <>
      {success && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-panel border border-success/25 bg-success/10 p-3 type-control-md text-success-text"
        >
          <div className="flex items-center gap-2">
            <Check className="size-3.5 shrink-0" aria-hidden />
            <span>{t`Citation publiée sur Qoefi.`}</span>
          </div>
          <a href={postHref || '/home'} className="shrink-0 font-medium underline">
            {t`Voir`}
          </a>
        </div>
      )}

      {showForm && citation && (
        <div
          data-annotation-citation-form
          className="space-y-3 rounded-panel border border-border/50 p-3"
        >
          <div className="flex items-center gap-1.5 type-control-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Quote className="size-3.5" aria-hidden />
            {t`Sera publié sur Qoefi`}
          </div>

          <AnnotationCitationHeading citation={citation} />

          <p className="text-sm leading-6 text-muted-foreground">
            {t`L’article et le passage annoté accompagnent la note, avec le nom de son auteur.`}
          </p>

          {error && (
            <p role="alert" className="text-sm leading-5 text-destructive-text">
              {error}
            </p>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="annotation-citation-commentary"
              className="type-control-xs font-medium text-muted-foreground"
            >
              {t`Ajouter un mot (facultatif)`}
            </label>
            <Textarea
              id="annotation-citation-commentary"
              size="sm"
              rows={2}
              value={commentary}
              onChange={(event) => onCommentaryChange(event.target.value)}
              placeholder={t`Pourquoi ce passage compte pour vous…`}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button size="xs" variant="ghost" onClick={onCancel}>
              {t`Annuler`}
            </Button>
            <Button
              size="xs"
              variant="solid"
              tone="brand"
              disabled={publishing}
              aria-busy={publishing}
              onClick={onSubmit}
            >
              {publishing ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Quote aria-hidden />
              )}
              {t`Publier la citation`}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
