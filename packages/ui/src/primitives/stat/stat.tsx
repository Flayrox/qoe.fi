import type { ReactNode } from 'react';
import { cn } from '@qoe/utils';

import { Icon, type IconName } from '../../icons';

// =====================================================================
// 📈 Stat — un chiffre, son libellé, et le sens de sa variation
// =====================================================================
// 📖 Le studio et l'admin affichent des compteurs (lectures, abonnés,
//    articles) avec trois formats différents. `Stat` impose une seule
//    lecture : libellé en micro-capitale, valeur en tabulaire, variation
//    signée et orientée.
//
// 🎯 La variation n'est pas colorée au hasard : `direction` décide de la
//    flèche, `intent` décide de la couleur. Une baisse peut être une bonne
//    nouvelle (temps de chargement), une hausse une mauvaise (signalements).
//    Séparer les deux évite de peindre la flèche en vert par réflexe.
// =====================================================================

export type StatDirection = 'up' | 'down' | 'flat';
export type StatIntent = 'positive' | 'negative' | 'neutral';

const INTENT_CLASSES: Record<StatIntent, string> = {
  positive: 'text-success-text',
  negative: 'text-destructive-text',
  neutral: 'text-muted-foreground',
};

const DIRECTION_ICONS: Record<StatDirection, IconName> = {
  up: 'trending-up',
  down: 'trending-down',
  flat: 'minus',
};

export interface StatDelta {
  /** Texte déjà formaté : `+12,4 %`, `−3`, `stable`. */
  value: string;
  direction?: StatDirection;
  /** Sens métier de la variation. Défaut `neutral`. */
  intent?: StatIntent;
  /** Période de comparaison (« vs 30 j »). */
  period?: string;
}

export interface StatProps {
  label: string;
  value: ReactNode;
  delta?: StatDelta;
  /** Contexte sous la valeur (« sur 12 articles »). */
  hint?: string;
  icon?: ReactNode;
  /** Met la valeur en avant sur une grille de KPI. Défaut `false`. */
  emphasis?: boolean;
  className?: string;
}

export function Stat({ label, value, delta, hint, icon, emphasis = false, className }: StatProps) {
  return (
    <div
      className={cn(
        'grid content-start gap-1 rounded-panel border border-border/40 bg-card px-3 py-2.5',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="type-label truncate text-muted-foreground">{label}</p>
        {icon && <span className="shrink-0 text-muted-foreground [&_svg]:size-3.5">{icon}</span>}
      </div>
      <p
        className={cn(
          'font-mono leading-none tabular-nums text-foreground',
          emphasis ? 'text-[22px]' : 'text-[17px]'
        )}
      >
        {value}
      </p>
      {(delta || hint) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {delta && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums',
                INTENT_CLASSES[delta.intent ?? 'neutral']
              )}
            >
              <Icon
                name={DIRECTION_ICONS[delta.direction ?? 'flat']}
                size="xs"
                aria-hidden
                className="size-3"
              />
              {delta.value}
            </span>
          )}
          {delta?.period && (
            <span className="text-[10.5px] text-muted-foreground">{delta.period}</span>
          )}
          {hint && <span className="text-[10.5px] text-muted-foreground">{hint}</span>}
        </div>
      )}
    </div>
  );
}
