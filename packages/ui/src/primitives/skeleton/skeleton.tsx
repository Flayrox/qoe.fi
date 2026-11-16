import type { HTMLAttributes } from 'react';
import { cn } from '@qoe/utils';

// =====================================================================
// 🦴 Skeleton — la place du contenu, pas un écran qui saute
// =====================================================================
// 📖 Un squelette doit reproduire la forme de ce qui arrive : une ligne de
//    titre, deux lignes de texte, une vignette carrée. S'il est plus
//    court que le contenu, le chargement provoque un saut de mise en page
//    — exactement ce qu'il devait éviter.
//
// 🎯 `shape` décide du rayon : `line` en 2 px (étiquette), `block` et
//    `square` en 4 px (contrôle), `circle` réservé aux avatars. L'animation
//    s'arrête avec `motion-reduce`.
// =====================================================================

export type SkeletonShape = 'line' | 'block' | 'square' | 'circle';

const SHAPES: Record<SkeletonShape, string> = {
  line: 'rounded-tag',
  block: 'rounded-control',
  square: 'rounded-control aspect-square',
  circle: 'rounded-full',
};

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  shape?: SkeletonShape;
}

export function Skeleton({ shape = 'line', className, ...props }: SkeletonProps) {
  return (
    <div
      {...props}
      aria-hidden
      className={cn(
        'animate-pulse bg-muted motion-reduce:animate-none',
        SHAPES[shape],
        shape === 'line' ? 'h-3 w-full' : 'size-full',
        className
      )}
    />
  );
}

export interface SkeletonTextProps {
  /** Nombre de lignes. Défaut `3`. */
  lines?: number;
  /** Largeur de la dernière ligne, pour imiter une fin de paragraphe. */
  lastLineWidth?: string;
  className?: string;
}

/**
 * Un paragraphe en chargement. Les lignes intermédiaires sont pleines, la
 * dernière est courte : c'est ce détail qui fait lire un squelette comme
 * du texte et non comme une barre de progression.
 */
export function SkeletonText({ lines = 3, lastLineWidth = '62%', className }: SkeletonTextProps) {
  return (
    <div className={cn('grid gap-2', className)} aria-hidden>
      {Array.from({ length: Math.max(1, lines) }, (_, index) => (
        <Skeleton
          key={index}
          className={cn('h-2.5', index === lines - 1 && 'w-auto')}
          style={index === lines - 1 ? { width: lastLineWidth } : undefined}
        />
      ))}
    </div>
  );
}
