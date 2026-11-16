import { cn } from '@qoe/utils';

import type { Tone } from '../contract';

// =====================================================================
// 📊 Progress — une avancement qui se lit sans couleur
// =====================================================================
// 📖 `role="progressbar"` + `aria-valuenow` : sans ça, une barre n'est
//    qu'un rectangle coloré. Le pourcentage est aussi affiché en texte
//    quand `showValue` est vrai, pour ne pas dépendre de la longueur du
//    trait.
//
// 🎯 `indeterminate` n'invente pas une valeur : `aria-valuenow` disparaît
//    et le bloc annonce « en cours » via son libellé. Un `value` hors
//    bornes est ramené dans `[0, max]` plutôt que de déborder du rail.
// =====================================================================

export type ProgressSize = 'sm' | 'md';

const FILL: Record<Tone, string> = {
  neutral: 'bg-foreground',
  brand: 'bg-primary',
  vivid: 'bg-brand-vivid',
  danger: 'bg-destructive',
  success: 'bg-success',
};

export interface ProgressProps {
  /** Valeur courante. Ignorée si `indeterminate`. */
  value?: number;
  /** Plafond. Défaut `100`. */
  max?: number;
  tone?: Tone;
  size?: ProgressSize;
  /** Nom lisible (« Téléversement de 3 images »). */
  label?: string;
  /** Affiche le pourcentage à droite du libellé. */
  showValue?: boolean;
  indeterminate?: boolean;
  className?: string;
}

export function Progress({
  value = 0,
  max = 100,
  tone = 'brand',
  size = 'sm',
  label,
  showValue = false,
  indeterminate = false,
  className,
}: ProgressProps) {
  const safeMax = max > 0 ? max : 100;
  const clamped = Math.min(Math.max(value, 0), safeMax);
  const percent = Math.round((clamped / safeMax) * 100);

  return (
    <div className={cn('grid gap-1.5', className)}>
      {(label || showValue) && (
        <div className="flex items-baseline justify-between gap-3">
          {label && <span className="type-control-xs text-muted-foreground">{label}</span>}
          {showValue && !indeterminate && (
            <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">
              {percent} %
            </span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label ?? 'Progression'}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={indeterminate ? undefined : clamped}
        aria-valuetext={indeterminate ? 'En cours' : showValue ? `${percent} %` : undefined}
        className={cn(
          'w-full overflow-hidden rounded-tag border border-border/40 bg-muted',
          size === 'sm' ? 'h-1.5' : 'h-2'
        )}
      >
        <div
          className={cn(
            'h-full rounded-tag transition-[width] duration-300 ease-out',
            FILL[tone],
            indeterminate && 'w-1/3 animate-pulse motion-reduce:animate-none'
          )}
          style={indeterminate ? undefined : { width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
