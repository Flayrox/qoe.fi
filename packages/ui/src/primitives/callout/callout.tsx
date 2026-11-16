import type { ReactNode } from 'react';
import { cn } from '@qoe/utils';

import { Icon, type IconName } from '../../icons';

// =====================================================================
// 📣 Callout — une information qui mérite mieux qu'un paragraphe gris
// =====================================================================
// 📖 Quatre intentions, pas cinq : neutre (contexte), info (explication),
//    succès (confirmation), avertissement (attention), danger (perte
//    possible). La couleur ne porte jamais l'information seule : chaque
//    ton a son icône, et le titre est du texte.
//
// 🎯 `live` transforme le bloc en `role="alert"` (danger/avertissement) ou
//    `role="status"` (le reste). Sans `live`, un callout posé au rendu
//    initial n'est pas annoncé deux fois — c'est le comportement voulu.
// =====================================================================

export type CalloutTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONE_STYLES: Record<CalloutTone, string> = {
  neutral: 'border-border/60 bg-muted/30 text-foreground',
  info: 'border-primary/25 bg-primary/5 text-foreground',
  success: 'border-success/30 bg-success/10 text-foreground',
  warning: 'border-highlight/35 bg-highlight/10 text-foreground',
  danger: 'border-destructive/30 bg-destructive/10 text-foreground',
};

const TONE_ICONS: Record<CalloutTone, IconName> = {
  neutral: 'info',
  info: 'info',
  success: 'circle-check',
  warning: 'triangle-alert',
  danger: 'circle-alert',
};

const TONE_ICON_COLORS: Record<CalloutTone, string> = {
  neutral: 'text-muted-foreground',
  info: 'text-primary',
  success: 'text-success-text',
  warning: 'text-highlight',
  danger: 'text-destructive-text',
};

export interface CalloutProps {
  tone?: CalloutTone;
  title?: ReactNode;
  children?: ReactNode;
  /** Remplace l'icône du ton ; `null` la retire complètement. */
  icon?: ReactNode | null;
  /** Action alignée à droite (bouton texte, lien). */
  action?: ReactNode;
  /** Annonce le contenu dans une région live. Défaut `false`. */
  live?: boolean;
  className?: string;
}

export function Callout({
  tone = 'neutral',
  title,
  children,
  icon,
  action,
  live = false,
  className,
}: CalloutProps) {
  const liveRole = live
    ? tone === 'danger' || tone === 'warning'
      ? 'alert'
      : 'status'
    : undefined;

  return (
    <div
      role={liveRole}
      className={cn(
        'flex items-start gap-2.5 rounded-panel border px-3 py-2.5',
        TONE_STYLES[tone],
        className
      )}
    >
      {icon !== null && (
        <span className={cn('mt-px shrink-0 [&_svg]:size-4', TONE_ICON_COLORS[tone])}>
          {icon ?? <Icon name={TONE_ICONS[tone]} />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        {title && <p className="text-[12.5px] leading-snug font-medium text-foreground">{title}</p>}
        {children && (
          <div
            className={cn('text-[12px] leading-relaxed text-muted-foreground', title && 'mt-0.5')}
          >
            {children}
          </div>
        )}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}
