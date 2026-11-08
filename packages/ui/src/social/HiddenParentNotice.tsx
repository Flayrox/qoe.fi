'use client';

import React, { useState } from 'react';
import { EyeOff } from 'lucide-react';
import { t } from '@lingui/core/macro';
import { cn } from '@qoe/utils';

export interface HiddenParentNoticeProps {
  reason?: 'blocked' | 'deleted' | 'unavailable' | string | null;
  className?: string;
}

/**
 * Placeholder affiché au-dessus d'une réponse dont le parent n'est pas visible.
 *
 * Le blocage est symétrique : le contenu du parent ne doit jamais être révélé,
 * même après un clic. Le bouton explique donc pourquoi il est masqué, sans
 * charger ni afficher le post d'origine.
 */
export function HiddenParentNotice({ reason, className }: HiddenParentNoticeProps) {
  const [expanded, setExpanded] = useState(false);
  const blocked = reason === 'blocked';
  const label = blocked ? t`Réponse à un compte bloqué` : t`Réponse à un contenu indisponible`;

  return (
    <div
      className={cn(
        'rounded-xl border border-dashed border-border/60 bg-muted/20 px-3 py-2',
        className
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 text-left type-control-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <EyeOff className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{label}</span>
        <span className="ml-auto shrink-0 font-medium text-brand">
          {expanded ? t`Masquer` : t`En savoir plus`}
        </span>
      </button>
      {expanded && (
        <p className="pt-1.5 text-[11px] leading-relaxed text-muted-foreground">
          {blocked
            ? t`Le contenu de ce compte reste masqué, dans les deux sens, pour préserver le blocage.`
            : t`Le contenu d'origine a été supprimé ou n'est plus visible.`}
        </p>
      )}
    </div>
  );
}
