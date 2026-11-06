'use client';

import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@qoe/utils';
import { DENSITY } from './tokens';

// =====================================================================
// 🆔 CopyableId — un identifiant se copie, il ne se retape pas
// =====================================================================
// Les opérateurs recopient des IDs dans Slack, dans psql, dans un ticket.
// Mono + bouton copier, avec le libellé complet en infobulle.
// =====================================================================

export function CopyableId({
  id,
  max = 8,
  label = 'Copier l’identifiant',
  className,
}: {
  id: string;
  /** Nombre de caractères affichés avant l'ellipse. */
  max?: number;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const short = id.length > max + 4 ? `${id.slice(0, max)}…` : id;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Presse-papiers refusé : l'ID reste lisible en infobulle, rien à casser.
    }
  };

  return (
    <span className={cn('inline-flex items-center gap-1', DENSITY.id, className)}>
      <span title={id}>{short}</span>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Identifiant copié' : label}
        title={copied ? 'Copié' : label}
        className="rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {copied ? (
          <Check className="size-3" aria-hidden />
        ) : (
          <Copy className="size-3" aria-hidden />
        )}
      </button>
    </span>
  );
}
