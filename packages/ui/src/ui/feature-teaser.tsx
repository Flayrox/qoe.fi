'use client';

// =====================================================================
// 🛡️ feature-teaser.tsx — Badges et enveloppes des fonctionnalités à venir
// =====================================================================
// 📖 Trois primitives, une seule source de copie (@see feature-catalog) :
//    • UpcomingBadge     — micro-badge cliquable (« Bientôt », « Pro »)
//    • FeatureInfoTooltip — rappel au survol, complémentaire du badge
//    • FeatureTeaser      — enveloppe un panneau verrouillé et explique
//      pourquoi, sans jamais retirer le contenu du regard.
//
// ♿ Accessibilité : le badge est un vrai <button> (clavier, lecteurs
//    d'écran) qui ouvre l'interstitiel ; le contenu verrouillé est rendu
//    `inert` — donc non focalisable et non cliquable — au lieu d'être
//    neutralisé par `pointer-events-none`, qui laissait le focus clavier
//    traverser des champs inactifs.
// =====================================================================

import React from 'react';
import { Clock, Info, Lock } from 'lucide-react';
import { cn } from '@qoe/utils';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from './tooltip';
import {
  DEFAULT_FEATURE_LOCALE,
  FEATURE_STATUS_COPY,
  getFeature,
  localize,
  type FeatureDefinition,
  type FeatureKey,
  type FeatureLocale,
  type FeatureStatus,
} from './feature-catalog';
import { useFeatureAnnouncement } from './feature-interstitial';

export type { FeatureStatus } from './feature-catalog';

const STATUS_ICONS: Record<FeatureStatus, React.ComponentType<{ className?: string }>> = {
  'in-development': Clock,
  pro: Lock,
  'coming-soon': Info,
};

function resolveStatus(feature?: FeatureDefinition, status?: FeatureStatus): FeatureStatus {
  return status ?? feature?.status ?? 'in-development';
}

export interface UpcomingBadgeProps extends Omit<React.HTMLAttributes<HTMLElement>, 'children'> {
  /** Clé du catalogue : statut + copie + action viennent de là. */
  feature?: FeatureKey;
  status?: FeatureStatus;
  locale?: FeatureLocale;
  /** Remplace le libellé du catalogue (rare : contrats marketing). */
  label?: string;
  showIcon?: boolean;
  /**
   * Ouvre l'interstitiel au clic. Désactivé automatiquement si aucun
   * `feature` n'est fourni (rien à annoncer) ou hors provider.
   */
  interactive?: boolean;
  /** Ouvre l'annonce au lieu de dépendre du provider (tests, compositions). */
  onOpen?: () => void;
}

/**
 * Micro-badge sobre et typographique. Clic = annonce complète, jamais un
 * simple toast : l'utilisateur obtient le pourquoi, le quand et le coût.
 */
export function UpcomingBadge({
  feature,
  status,
  locale = DEFAULT_FEATURE_LOCALE,
  label,
  showIcon = true,
  interactive = true,
  onOpen,
  className,
  ...props
}: UpcomingBadgeProps) {
  const announcement = useFeatureAnnouncement();
  const definition = feature ? getFeature(feature) : undefined;
  const resolvedStatus = resolveStatus(definition, status);
  const Icon = STATUS_ICONS[resolvedStatus];
  const displayLabel =
    label ??
    (definition ? localize(definition.copy.label, locale) : undefined) ??
    localize(FEATURE_STATUS_COPY[resolvedStatus].label, locale);

  // Un badge cliquable doit TOUJOURS aboutir à l'annonce : hors provider et
  // sans `onOpen`, on reste un libellé plutôt qu'un bouton mort.
  const canOpen = interactive && !!feature && (!!onOpen || announcement.available);

  const content = (
    <>
      {showIcon && <Icon className="w-2.5 h-2.5 opacity-70 shrink-0" aria-hidden="true" />}
      <span>{displayLabel}</span>
    </>
  );

  const classes = cn(
    'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider',
    'border border-border/80 bg-muted/40 text-muted-foreground select-none',
    canOpen &&
      'cursor-pointer transition-colors hover:text-foreground hover:border-border focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/30',
    className
  );

  if (!canOpen) {
    return (
      <span className={classes} {...props}>
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-haspopup="dialog"
      onClick={() => {
        if (onOpen) onOpen();
        else if (feature) announcement.open(feature);
      }}
      className={classes}
      {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {content}
    </button>
  );
}

export interface FeatureInfoTooltipProps {
  feature?: FeatureKey;
  status?: FeatureStatus;
  locale?: FeatureLocale;
  title?: string;
  description?: string;
  className?: string;
}

/**
 * Rappel discret « (i) » : un survol ne doit jamais être le SEUL chemin
 * vers l'information — le badge cliquable reste l'accès principal.
 */
export function FeatureInfoTooltip({
  feature,
  status,
  locale = DEFAULT_FEATURE_LOCALE,
  title,
  description,
  className,
}: FeatureInfoTooltipProps) {
  const definition = feature ? getFeature(feature) : undefined;
  const statusCopy = FEATURE_STATUS_COPY[resolveStatus(definition, status)];
  const displayTitle =
    title ||
    (definition ? localize(definition.copy.title, locale) : localize(statusCopy.title, locale));
  const displayDesc =
    description ||
    (definition
      ? `${localize(definition.copy.summary, locale)} ${localize(definition.copy.availability, locale)}`
      : localize(statusCopy.description, locale));

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
          <Info className="w-3.5 h-3.5" aria-hidden="true" />
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

export interface FeatureTeaserProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Clé du catalogue : seul moyen d'obtenir un libellé juste. */
  feature: FeatureKey;
  locale?: FeatureLocale;
  /** Désactive (inert) le contenu. Par défaut : oui, c'est un teaser. */
  disabled?: boolean;
  /** Affiche le bandeau statut + « En savoir plus ». */
  showHeader?: boolean;
  /** Enveloppe (fieldset-like) : panneau verrouillé à annoncer. */
  children?: React.ReactNode;
  /** Ouvre l'annonce au lieu de dépendre du provider. */
  onOpen?: () => void;
}

/**
 * Enveloppe un panneau indisponible : bandeau de statut, contenu visible
 * mais réellement inerte, et un seul chemin d'action (« En savoir plus »).
 */
export function FeatureTeaser({
  feature,
  locale = DEFAULT_FEATURE_LOCALE,
  disabled = true,
  showHeader = true,
  children,
  onOpen,
  className,
  ...props
}: FeatureTeaserProps) {
  const announcement = useFeatureAnnouncement();
  const definition = getFeature(feature);
  if (!definition) return null;

  const canOpen = !!onOpen || announcement.available;
  const openAnnouncement = () => {
    if (onOpen) onOpen();
    else announcement.open(feature);
  };

  return (
    <div
      className={cn(
        'relative rounded-2xl border border-border/60 overflow-hidden',
        disabled && 'border-dashed bg-muted/10',
        className
      )}
      {...props}
    >
      {showHeader && (
        <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-b border-border/40 bg-muted/20">
          <UpcomingBadge
            feature={feature}
            locale={locale}
            interactive={canOpen}
            onOpen={canOpen ? openAnnouncement : undefined}
          />
          {canOpen && (
            <button
              type="button"
              onClick={openAnnouncement}
              className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer rounded px-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/30"
            >
              {localize({ fr: 'En savoir plus', en: 'Learn more' }, locale)}
            </button>
          )}
        </div>
      )}

      {children ? (
        <div
          // `inert` retire le sous-arbre du focus et des interactions : c'est
          // la sémantique correcte d'un panneau verrouillé (contrairement à
          // opacity + pointer-events, qui laisse le clavier entrer).
          inert={disabled ? true : undefined}
          aria-disabled={disabled || undefined}
          className={cn('transition-opacity', disabled && 'opacity-60')}
        >
          {children}
        </div>
      ) : (
        <div className="p-3.5 space-y-1">
          <h5 className="font-semibold text-foreground text-xs">
            {localize(definition.copy.title, locale)}
          </h5>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {localize(definition.copy.summary, locale)}
          </p>
        </div>
      )}
    </div>
  );
}
