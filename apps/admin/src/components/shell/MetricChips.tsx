import Link from 'next/link';
import { cn } from '@qoe/utils';

// =====================================================================
// 📊 MetricChips — les chiffres d'un écran, sans lui voler de hauteur
// =====================================================================
// Une seule bande de 24 px : libellé en gris, valeur en tabular-nums. Les
// pastilles cliquables renvoient vers la vue filtrée correspondante.
// =====================================================================

export type MetricTone = 'default' | 'danger' | 'warn' | 'success';

export interface MetricChip {
  label: string;
  value: string | number;
  tone?: MetricTone;
  href?: string;
  hint?: string;
}

const TONE: Record<MetricTone, string> = {
  default: 'border-border/70 text-muted-foreground',
  danger: 'border-destructive/30 text-destructive-text',
  warn: 'border-highlight/40 text-highlight',
  success: 'border-success/30 text-success-text',
};

export function MetricChips({
  items,
  className,
}: {
  items: readonly MetricChip[];
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {items.map((item) => {
        const body = (
          <>
            <span className="truncate">{item.label}</span>
            <span className="tabular-nums font-medium text-foreground">{item.value}</span>
          </>
        );
        const classes = cn(
          'inline-flex h-6 max-w-[240px] items-center gap-1.5 rounded border bg-background px-1.5 text-[11px]',
          TONE[item.tone ?? 'default'],
          item.href && 'hover:border-foreground/30 hover:text-foreground'
        );

        return item.href ? (
          <Link
            key={item.label}
            href={item.href}
            className={classes}
            title={item.hint ?? item.label}
          >
            {body}
          </Link>
        ) : (
          <span key={item.label} className={classes} title={item.hint ?? item.label}>
            {body}
          </span>
        );
      })}
    </div>
  );
}
