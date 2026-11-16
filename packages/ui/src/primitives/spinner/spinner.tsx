import { cn } from '@qoe/utils';

import { Icon } from '../../icons';
import type { IconSize } from '../contract';

// =====================================================================
// ⏳ Spinner — le seul chargement qui annonce qu'il tourne
// =====================================================================
// 📖 Un spinner sans texte est muet pour un lecteur d'écran. Ici le
//    libellé est toujours présent, visible ou en `sr-only`, et le bloc
//    porte `role="status"` : le lecteur annonce « Chargement » une fois,
//    sans marteler à chaque rendu.
//
// 🎯 `motion-reduce` arrête la rotation : le libellé suffit. Un
//    chargement ne doit jamais être une animation imposée.
// =====================================================================

export type SpinnerTone = 'neutral' | 'brand' | 'inverse';

const TONES: Record<SpinnerTone, string> = {
  neutral: 'text-muted-foreground',
  brand: 'text-primary',
  inverse: 'text-background',
};

export interface SpinnerProps {
  size?: IconSize;
  /** Texte annoncé. Défaut « Chargement ». */
  label?: string;
  /** Affiche le libellé à côté de l'icône au lieu de le cacher. */
  showLabel?: boolean;
  tone?: SpinnerTone;
  className?: string;
}

export function Spinner({
  size = 'sm',
  label = 'Chargement',
  showLabel = false,
  tone = 'neutral',
  className,
}: SpinnerProps) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-1.5', className)}>
      <Icon
        name="spinner"
        size={size}
        aria-hidden
        className={cn('animate-spin motion-reduce:animate-none', TONES[tone])}
      />
      <span className={cn('type-control-xs text-muted-foreground', !showLabel && 'sr-only')}>
        {label}
      </span>
    </span>
  );
}
