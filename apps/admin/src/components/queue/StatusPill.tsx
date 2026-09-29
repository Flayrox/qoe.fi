import React from 'react';
import { cn } from '@qoe/utils';

// Pastille de statut (lot 2) : `hot` (file d'attente — highlight) ou
// `muted` (contexte — gris). Les libellés restent aux appelants (métier),
// la forme est partagée.
interface StatusPillProps {
  tone?: 'hot' | 'muted';
  children: React.ReactNode;
}

export function StatusPill({ tone = 'muted', children }: StatusPillProps) {
  return (
    <span
      className={cn(
        'text-xs font-bold px-2 py-0.5 rounded-full border',
        tone === 'hot'
          ? 'bg-highlight/15 text-highlight border-highlight/40'
          : 'bg-muted text-muted-foreground border-transparent'
      )}
    >
      {children}
    </span>
  );
}
