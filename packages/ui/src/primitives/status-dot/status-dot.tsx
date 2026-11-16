import { cn } from '@qoe/utils';

// =====================================================================
// 🔴 StatusDot — l'état d'un objet, en un point
// =====================================================================
// 📖 Un point coloré seul ne dit rien à un lecteur d'écran et bien peu à
//    un daltonien. `StatusDot` accepte donc toujours un libellé : visible
//    à côté du point (`label`) ou réservé aux technologies d'assistance
//    (`labelHidden`). Sans libellé, le point est franchement décoratif et
//    disparaît de l'arbre d'accessibilité.
//
// 🎯 `pulse` est réservé à ce qui est vivant (direct, synchronisation en
//    cours). Un brouillon n'a pas besoin de clignoter.
// =====================================================================

export type StatusTone = 'neutral' | 'brand' | 'info' | 'success' | 'warning' | 'danger';

const DOTS: Record<StatusTone, string> = {
  neutral: 'bg-muted-foreground/50',
  brand: 'bg-primary',
  info: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-highlight',
  danger: 'bg-destructive',
};

const PINGS: Record<StatusTone, string> = {
  neutral: 'bg-muted-foreground/40',
  brand: 'bg-primary/50',
  info: 'bg-primary/50',
  success: 'bg-success/50',
  warning: 'bg-highlight/50',
  danger: 'bg-destructive/50',
};

export interface StatusDotProps {
  tone?: StatusTone;
  label?: string;
  /** Cache le libellé visuellement, sans le retirer de l'arbre. */
  labelHidden?: boolean;
  size?: 'sm' | 'md';
  pulse?: boolean;
  className?: string;
}

export function StatusDot({
  tone = 'neutral',
  label,
  labelHidden = false,
  size = 'sm',
  pulse = false,
  className,
}: StatusDotProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span
        aria-hidden
        className={cn('relative inline-flex shrink-0', size === 'sm' ? 'size-2' : 'size-2.5')}
      >
        {pulse && (
          <span
            className={cn(
              'absolute inline-flex size-full animate-ping rounded-full opacity-60 motion-reduce:animate-none',
              PINGS[tone]
            )}
          />
        )}
        <span className={cn('relative inline-flex size-full rounded-full', DOTS[tone])} />
      </span>
      {label && (
        <span className={cn('text-[11.5px] text-muted-foreground', labelHidden && 'sr-only')}>
          {label}
        </span>
      )}
    </span>
  );
}
