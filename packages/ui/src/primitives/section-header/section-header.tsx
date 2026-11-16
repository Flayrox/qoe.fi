import type { ReactNode } from 'react';
import { cn } from '@qoe/utils';

// =====================================================================
// 📐 SectionHeader — le titre d'une section, avec ce qu'il faut autour
// =====================================================================
// 📖 Chaque écran du studio réinventait son en-tête : un surtitre en
//    majuscules ici, un compteur là, des actions collées à droite sans
//    marge. `SectionHeader` fige la hiérarchie :
//
//      surtitre · titre · description · méta · actions
//
// 🎯 `level` ne change pas seulement la taille : il décide de la balise
//    (`h1`, `h2`, `h3`). Une page a un seul `h1`, une section un `h2` —
//    c'est la structure du document, pas une préférence visuelle.
// =====================================================================

export type SectionHeaderLevel = 'h1' | 'h2' | 'h3';

const TITLE_CLASSES: Record<SectionHeaderLevel, string> = {
  h1: 'text-[22px] leading-tight font-semibold tracking-tight',
  h2: 'text-[17px] leading-tight font-semibold tracking-tight',
  h3: 'text-[14px] leading-snug font-semibold',
};

export interface SectionHeaderProps {
  title: ReactNode;
  /** Micro-libellé au-dessus du titre (`Tableau de bord`, `Réglages`). */
  eyebrow?: string;
  description?: ReactNode;
  /** Compteur ou état à côté du titre (« 12 brouillons »). */
  meta?: ReactNode;
  actions?: ReactNode;
  /** Icône décorative, alignée sur la première ligne du titre. */
  icon?: ReactNode;
  level?: SectionHeaderLevel;
  /** Trait de séparation sous l'en-tête, pour les sections longues. */
  divider?: boolean;
  className?: string;
}

export function SectionHeader({
  title,
  eyebrow,
  description,
  meta,
  actions,
  icon,
  level = 'h2',
  divider = false,
  className,
}: SectionHeaderProps) {
  const Heading = level;

  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-x-6 gap-y-3',
        divider && 'border-b border-border/40 pb-3',
        className
      )}
    >
      <div className="min-w-0">
        {eyebrow && <p className="type-label mb-1.5 text-muted-foreground">{eyebrow}</p>}
        <div className="flex items-center gap-2">
          {icon && <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>}
          <Heading className={cn('text-foreground', TITLE_CLASSES[level])}>{title}</Heading>
          {meta && (
            <span className="ml-0.5 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
              {meta}
            </span>
          )}
        </div>
        {description && (
          <p className="mt-1.5 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-1.5">{actions}</div>}
    </div>
  );
}
