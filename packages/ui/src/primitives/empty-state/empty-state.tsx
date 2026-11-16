import type { ReactNode } from 'react';
import { cn } from '@qoe/utils';

// =====================================================================
// 🫙 EmptyState — l'écran vide dit quoi faire ensuite
// =====================================================================
// 📖 Un état vide est le premier écran d'un nouvel utilisateur : « Aucun
//    article », « Aucune annotation », « Aucun abonné ». Le laisser en
//    gris avec une ligne de texte est le moment où le produit paraît cassé.
//
// 🎯 Trois variantes seulement :
//    - `framed` : un cadre pointillé dans une page (liste, panneau) ;
//    - `inline` : dans une carte déjà cadrée, sans doubler la bordure ;
//    - `bare`   : dans une colonne dense où le cadre gênerait.
//    L'icône vit dans un carré bordé — la géométrie de la maison — et
//    jamais dans un cercle décoratif.
// =====================================================================

export type EmptyStateVariant = 'framed' | 'inline' | 'bare';

export interface EmptyStateProps {
  /** Icône du registre, rendue à 20 px. */
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Action principale (bouton du contrat). */
  action?: ReactNode;
  /** Action secondaire discrète (« En savoir plus »). */
  secondaryAction?: ReactNode;
  variant?: EmptyStateVariant;
  className?: string;
}

const FRAMES: Record<EmptyStateVariant, string> = {
  framed: 'rounded-panel border border-dashed border-border/60 bg-muted/20 px-6 py-10',
  inline: 'px-4 py-8',
  bare: 'px-0 py-6',
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  variant = 'framed',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        FRAMES[variant],
        className
      )}
    >
      {icon && (
        <div className="mb-4 flex size-10 items-center justify-center rounded-control border border-border/60 bg-card text-muted-foreground [&_svg]:size-5">
          {icon}
        </div>
      )}
      <p className="text-[13.5px] font-medium text-foreground">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-[12px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
