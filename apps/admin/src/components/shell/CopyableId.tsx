'use client';

import * as React from 'react';
import { Icon } from '@qoe/ui/icons';
import { IconButton } from '@qoe/ui/icon-button';
import { cn } from '@qoe/utils';
import { copyToClipboard } from '@/lib/clipboard';
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
    // Presse-papiers refusé : l'ID reste lisible en infobulle, rien à casser.
    if (!(await copyToClipboard(id))) return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <span className={cn('inline-flex items-center gap-1', DENSITY.id, className)}>
      <span title={id}>{short}</span>
      <IconButton
        label={copied ? 'Identifiant copié' : label}
        title={copied ? 'Copié' : label}
        size="xs"
        variant="ghost"
        tooltip={false}
        onClick={copy}
        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Icon name={copied ? 'check' : 'copy'} size="xs" />
      </IconButton>
    </span>
  );
}
