import React from 'react';
import { cn } from '@qoe/utils';

/**
 * Les trois primitives de mise en page du Studio.
 *
 * Elles existent pour une raison mesurable : chaque écran avait sa propre
 * largeur (`max-w-4xl`, `5xl`, `6xl`, `7xl`), son propre padding et son propre
 * en-tête. Résultat : la colonne changeait de place d'une page à l'autre.
 *
 * - `StudioPage`   : la colonne unique, largeur et marges communes.
 * - `StudioHeader` : le titre, sa description et les actions, alignés pareil.
 * - `StudioSection`: la carte de contenu, au format des panneaux de /settings.
 *
 * Aucune décision visuelle ici : les tokens viennent de `@qoe/theme`, comme
 * dans le UI Lab.
 */

/**
 * La colonne du Studio. Le padding vit dans le layout (une seule fois) :
 * une page ne doit jamais en rajouter, sinon les marges changent d'un écran
 * à l'autre pour la même hiérarchie.
 */
export const STUDIO_PAGE_CLASS = 'mx-auto w-full max-w-6xl space-y-6';

export function StudioPage({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn(STUDIO_PAGE_CLASS, 'text-foreground', className)}>{children}</div>;
}

export function StudioHeader({
  title,
  description,
  badge,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex flex-col gap-4 border-b border-border/40 pb-5 sm:flex-row sm:items-end sm:justify-between',
        className
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {badge}
        </div>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

type IconComponent = React.ComponentType<{ className?: string; strokeWidth?: number }>;

export function StudioSection({
  title,
  icon: Icon,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  icon?: IconComponent;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn('rounded-xl border border-border/50 bg-card p-5 shadow-2xs', className)}>
      {title || actions ? (
        <header className="mb-4 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={1.5} /> : null}
            {title ? (
              <h2 className="truncate text-xs font-bold tracking-wider text-muted-foreground uppercase">
                {title}
              </h2>
            ) : null}
          </div>
          {actions}
        </header>
      ) : null}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/**
 * Une liste de réglages : des lignes séparées par un filet, pas des cartes
 * dans la carte. C'est la règle qui manquait aux réglages, où chaque switch
 * vivait dans sa propre boîte bordée, elle-même dans une carte.
 */
export function StudioRowList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('divide-y divide-border/40', className)}>{children}</div>;
}

/**
 * Une ligne de réglage : libellé et explication à gauche, contrôle à droite.
 * Le contrôle reste sur sa propre ligne en dessous de `sm`.
 */
export function StudioRow({
  title,
  description,
  htmlFor,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between',
        className
      )}
    >
      <div className="min-w-0">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
            {title}
          </label>
        ) : (
          <span className="block text-sm font-medium text-foreground">{title}</span>
        )}
        {description ? (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="shrink-0 sm:pl-6">{children}</div>
    </div>
  );
}

/**
 * Un champ de formulaire : libellé, compteur optionnel, contrôle, aide.
 * Évite de réécrire quatre fois le même empilement dans chaque onglet.
 */
export function StudioField({
  label,
  hint,
  counter,
  htmlFor,
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  counter?: React.ReactNode;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={htmlFor} className="text-xs font-semibold text-foreground">
          {label}
        </label>
        {counter ? (
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {counter}
          </span>
        ) : null}
      </div>
      {children}
      {hint ? <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
