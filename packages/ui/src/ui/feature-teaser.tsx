'use client';

// =====================================================================
// 🛡️ @qoe/ui — feature-teaser.tsx
// =====================================================================
// Système souverain & épuré de mise en valeur des fonctionnalités en cours
// de développement ou réservées à l'offre Pro (style Vercel & Linear).
// 100% tokens sémantiques, zéro emoji IA, précision typographique.
// =====================================================================

import React from 'react';
import { Info, Lock, Clock } from 'lucide-react';
import { cn } from '@qoe/utils';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './tooltip';

export type FeatureStatus = 'in-development' | 'pro' | 'coming-soon';

const STATUS_CONFIG: Record<
  FeatureStatus,
  {
    label: string;
    title: string;
    description: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  'in-development': {
    label: 'En développement',
    title: 'Développement actif',
    description:
      'Cette fonctionnalité est actuellement en cours de développement. Elle sera déployée prochainement dans une mise à jour gratuite.',
    Icon: Clock,
  },
  pro: {
    label: 'Pro',
    title: 'Offre Qoefi Pro',
    description:
      'Fonctionnalité avancée réservée aux publications disposant d’un abonnement Qoefi Pro. Déploiement en cours.',
    Icon: Lock,
  },
  'coming-soon': {
    label: 'Bientôt',
    title: 'Prochainement disponible',
    description:
      'Les équipes finalisent l’intégration de cette option souveraine. Elle sera disponible sans surcoût.',
    Icon: Info,
  },
};

export interface UpcomingBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status?: FeatureStatus;
  label?: string;
  showIcon?: boolean;
}

/**
 * Micro-badge clinique & typographique pour signaler le statut d'une fonctionnalité.
 */
export function UpcomingBadge({
  status = 'in-development',
  label,
  showIcon = true,
  className,
  ...props
}: UpcomingBadgeProps) {
  const config = STATUS_CONFIG[status];
  const Icon = config.Icon;
  const displayLabel = label || config.label;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider',
        'border border-border/80 bg-muted/40 text-muted-foreground select-none',
        className
      )}
      {...props}
    >
      {showIcon && <Icon className="w-2.5 h-2.5 opacity-70 shrink-0" />}
      <span>{displayLabel}</span>
    </span>
  );
}

export interface FeatureInfoTooltipProps {
  status?: FeatureStatus;
  title?: string;
  description?: string;
  className?: string;
}

/**
 * Bouton discret « (i) » avec popover/tooltip d'explication sobre.
 */
export function FeatureInfoTooltip({
  status = 'in-development',
  title,
  description,
  className,
}: FeatureInfoTooltipProps) {
  const config = STATUS_CONFIG[status];
  const displayTitle = title || config.title;
  const displayDesc = description || config.description;

  return (
    <TooltipProvider delay={100}>
      <Tooltip>
        <TooltipTrigger
          type="button"
          aria-label={displayTitle}
          className={cn(
            'inline-flex items-center justify-center w-5 h-5 rounded-full',
            'text-muted-foreground/80 hover:text-foreground hover:bg-muted/60',
            'transition-colors cursor-pointer outline-hidden focus-visible:ring-1 focus-visible:ring-foreground/20',
            className
          )}
        >
          <Info className="w-3.5 h-3.5" />
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="center"
          className="max-w-xs p-3 space-y-1 bg-popover text-popover-foreground border border-border shadow-lg rounded-xl"
        >
          <p className="text-xs font-semibold text-foreground tracking-tight">{displayTitle}</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">{displayDesc}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export interface FeatureTeaserProps extends React.HTMLAttributes<HTMLDivElement> {
  status?: FeatureStatus;
  title?: string;
  description?: string;
  badgeLabel?: string;
  /** Si true, applique un filtre d'opacité et bloque les interactions enfants */
  disabled?: boolean;
  /** Si true, affiche le badge et l'info dans un en-tête en coin */
  showHeader?: boolean;
  children?: React.ReactNode;
}

/**
 * Enveloppe un groupe de réglages ou un composant pour le présenter avec
 * une retenue élégante (mode grisé sans friction, indicateur discret).
 */
export function FeatureTeaser({
  status = 'in-development',
  title,
  description,
  badgeLabel,
  disabled = true,
  showHeader = true,
  children,
  className,
  ...props
}: FeatureTeaserProps) {
  return (
    <div
      className={cn(
        'relative rounded-2xl border border-border/60 transition-all group overflow-hidden',
        disabled && 'border-dashed bg-muted/10',
        className
      )}
      {...props}
    >
      {showHeader && (
        <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-b border-border/40 bg-muted/20">
          <UpcomingBadge status={status} label={badgeLabel} />
          <FeatureInfoTooltip status={status} title={title} description={description} />
        </div>
      )}

      {children ? (
        <div
          className={cn(
            'transition-all',
            disabled && 'opacity-55 pointer-events-none select-none filter blur-[0.2px]'
          )}
        >
          {children}
        </div>
      ) : (
        <div className="p-3 text-xs space-y-1">
          {title && <h5 className="font-semibold text-foreground text-xs">{title}</h5>}
          {description && (
            <p className="text-[11px] text-muted-foreground leading-relaxed">{description}</p>
          )}
        </div>
      )}
    </div>
  );
}
