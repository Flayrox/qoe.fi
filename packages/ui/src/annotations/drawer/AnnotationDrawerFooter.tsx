'use client';

import { Quote, ThumbsUp } from 'lucide-react';
import { cn } from '@qoe/utils';

import { Button } from '../../primitives/button/button';
import { ToggleButton } from '../../primitives/toggle/toggle-button';
import { t } from '@lingui/core/macro';

/**
 * Barre ancrée en bas : le vote et la citation.
 *
 * La hauteur ne change pas et la citation reste collée à droite. Le vote
 * n'apparaît que sur une annotation ; la citation, seulement quand elle a
 * un sens (une note, partagée). Un surlignage nu ou une annotation privée
 * n'affiche donc pas de bouton — le corps du tiroir dit pourquoi.
 */
export function AnnotationDrawerFooter({
  hasNote,
  canCite,
  hasUpvoted,
  upvotes,
  showCitationForm,
  onUpvote,
  onToggleCitation,
}: {
  hasNote: boolean;
  canCite: boolean;
  hasUpvoted: boolean;
  upvotes: number;
  showCitationForm: boolean;
  onUpvote: () => void;
  onToggleCitation: () => void;
}) {
  return (
    <footer className="flex h-14 shrink-0 items-center justify-between gap-3 border-t border-border/40 px-4">
      <div className="flex min-w-0 items-center">
        {hasNote && (
          <ToggleButton
            size="xs"
            isSelected={hasUpvoted}
            onChange={onUpvote}
            className="text-muted-foreground"
          >
            <ThumbsUp className={cn(hasUpvoted && 'fill-current')} aria-hidden />
            <span className="min-w-13 text-left tabular-nums">
              {upvotes > 0 ? t`${upvotes} Utile` : t`Utile`}
            </span>
          </ToggleButton>
        )}
      </div>

      {canCite && (
        <Button
          size="xs"
          variant="outline"
          onClick={onToggleCitation}
          aria-expanded={showCitationForm}
        >
          <Quote aria-hidden />
          {t`Citer cette annotation`}
        </Button>
      )}
    </footer>
  );
}
