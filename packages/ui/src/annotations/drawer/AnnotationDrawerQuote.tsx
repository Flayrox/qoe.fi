'use client';

import { t } from '@lingui/core/macro';

/**
 * Le passage cité, dans la même colonne que le reste du panneau.
 *
 * Une étiquette et un filet d'accent : c'est la seule décoration dont la
 * citation a besoin pour se distinguer de la note. Pas de surface, pas de
 * guillemet géant, pas de dégradé.
 */
export function AnnotationDrawerQuote({ text, hasNote }: { text: string; hasNote: boolean }) {
  return (
    <figure data-annotation-quote className="px-4 py-3.5">
      <figcaption className="type-control-xs font-medium uppercase tracking-wide text-muted-foreground">
        {hasNote ? t`Passage annoté` : t`Passage surligné`}
      </figcaption>
      <blockquote className="qoe-annotation-quote mt-2 border-l-2 pl-3 text-pretty text-sm leading-6 text-foreground">
        {t`« ${text} »`}
      </blockquote>
    </figure>
  );
}
