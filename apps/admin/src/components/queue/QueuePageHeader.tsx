import React from 'react';

// En-tête standard des files staff (lot 2 : un seul composant pour les 5
// files — reports, abuse, appeals, incidents, support — même rendu, zéro
// divergence de style).
interface QueuePageHeaderProps {
  icon: React.ReactNode;
  title: string;
  badge?: string | null;
  description: React.ReactNode;
}

export function QueuePageHeader({ icon, title, badge, description }: QueuePageHeaderProps) {
  return (
    <div>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#EE4B2B] mb-2">
        {icon}
        Administration Console
      </div>
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        {badge && (
          <span className="bg-highlight/15 text-highlight border border-highlight/40 px-2.5 py-1 rounded-full text-xs font-bold">
            {badge}
          </span>
        )}
      </div>
      <p className="text-muted-foreground mt-2 text-sm max-w-2xl leading-relaxed">{description}</p>
    </div>
  );
}
