import React from 'react';

// =====================================================================
// En-tête standard des files staff
// =====================================================================
// Un seul composant pour les files : titre, compteur, phrase d'explication.
// Plus de surtitre de console répété ni de ton d'accent sur le titre —
// l'accent est réservé aux actions.
// =====================================================================

interface QueuePageHeaderProps {
  icon: React.ReactNode;
  title: string;
  badge?: string | null;
  description: React.ReactNode;
  /** Actions propres à l'écran (bouton primaire à droite). */
  actions?: React.ReactNode;
}

export function QueuePageHeader({
  icon,
  title,
  badge,
  description,
  actions,
}: QueuePageHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-[17px] font-semibold tracking-tight text-foreground">
          <span className="text-muted-foreground" aria-hidden>
            {icon}
          </span>
          {title}
          {badge && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
              {badge}
            </span>
          )}
        </h1>
        <p className="mt-1 max-w-3xl text-[12px] leading-5 text-muted-foreground">{description}</p>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
