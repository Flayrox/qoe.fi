import type { ReactNode } from 'react';
import { cn } from '@qoe/utils';

import type { StatusTone } from '../status-dot/status-dot';

// =====================================================================
// 🧵 Timeline — les jalons d'un article, dans l'ordre
// =====================================================================
// 📖 L'historique du studio (création, soumission, publication,
//    révocation, restauration) est une suite d'événements horodatés. Rendue
//    en liste plate, elle perd la notion de chaîne. `Timeline` garde le
//    rail vertical et les marques carrées de la maison.
//
// 🎯 Une liste ordonnée, chaque entrée annoncée avec son heure dans un
//    `<time>` quand elle est fournie. L'icône remplace le point quand
//    l'événement a une nature forte (publication, restauration).
// =====================================================================

const DOTS: Record<StatusTone, string> = {
  neutral: 'bg-muted-foreground/40',
  brand: 'bg-primary',
  info: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-highlight',
  danger: 'bg-destructive',
};

export interface TimelineEntry {
  id?: string;
  title: ReactNode;
  description?: ReactNode;
  /** Horodatage lisible (`14 nov. 18:42`). */
  time?: string;
  /** Valeur machine de `time` (`2026-11-14T18:42:00Z`). */
  dateTime?: string;
  tone?: StatusTone;
  icon?: ReactNode;
  meta?: ReactNode;
}

export interface TimelineProps {
  entries: TimelineEntry[];
  /** Resserre l'espacement vertical pour les historiques longs. */
  dense?: boolean;
  className?: string;
}

export function Timeline({ entries, dense = false, className }: TimelineProps) {
  return (
    <ol className={cn('grid', className)}>
      {entries.map((entry, index) => {
        const isLast = index === entries.length - 1;

        return (
          <li
            key={entry.id ?? index}
            className={cn(
              'relative grid grid-cols-[auto_1fr] gap-3',
              dense ? 'pb-3' : 'pb-4',
              isLast && 'pb-0'
            )}
          >
            <div className="relative flex flex-col items-center">
              <span
                className={cn(
                  'mt-1 flex size-4 shrink-0 items-center justify-center rounded-control border border-border/60 bg-card',
                  '[&_svg]:size-2.5'
                )}
              >
                {entry.icon ?? (
                  <span
                    aria-hidden
                    className={cn('block size-1.5 rounded-tag', DOTS[entry.tone ?? 'neutral'])}
                  />
                )}
              </span>
              {!isLast && <span aria-hidden className="mt-1 w-px flex-1 bg-border/60" />}
            </div>

            <div className="min-w-0 pt-0.5">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <p className="text-[12px] leading-snug font-medium text-foreground">
                  {entry.title}
                </p>
                {entry.time &&
                  // ⚠️ `<time>` sans `datetime` n'est valide que si son contenu
                  // EST une date machine. « 14 nov. 18:42 » n'en est pas une :
                  // sans valeur machine, on rend un simple `span`.
                  (entry.dateTime ? (
                    <time
                      dateTime={entry.dateTime}
                      className="font-mono text-[10px] tabular-nums text-muted-foreground"
                    >
                      {entry.time}
                    </time>
                  ) : (
                    <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                      {entry.time}
                    </span>
                  ))}
              </div>
              {entry.description && (
                <div className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
                  {entry.description}
                </div>
              )}
              {entry.meta && <div className="mt-1">{entry.meta}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
