'use client';

import React from 'react';
import { EyeOff, BadgeCheck, Sparkles, Lock, User } from 'lucide-react';
import { cn } from '@qoe/utils';
import { t } from '@lingui/core/macro';
import { ToggleButton, ToggleGroup } from '../primitives/toggle/toggle-button';
import { Tooltip } from '../primitives/tooltip/tooltip';
import type { AnnotationFilterMode } from './types';

export interface AnnotationFilterPillProps {
  filterMode: AnnotationFilterMode;
  onChangeFilterMode: (mode: AnnotationFilterMode) => void;
  allowPublicAnnotations?: boolean;
  className?: string;
  size?: 'sm' | 'md';
  /**
   * Intitulé textuel incrusté dans le rail pour clarifier le domaine
   * (« Annotations ») sans bloc externe encombrant. Défaut : true.
   */
  showLabel?: boolean;
}

/**
 * Filtre d'affichage des annotations.
 *
 * 🎯 Format segmenté en creux à icônes seules et infobulles (@qoe/ui/tabs).
 *    Intègre un label classe (« Annotations ») à même le rail et supporte les modes :
 *    - Toutes les annotations (ou Mes notes si privées) : `all`
 *    - Annotations de l'auteur (officielles) : `official`
 *    - Mes annotations uniquement : `mine`
 *    - Masquer les annotations : `none`
 *
 *    Chaque option présente une infobulle descriptive au-dessus et un
 *    `aria-label` complet pour l'accessibilité.
 *
 * ⚠️ En sélection exclusive, react-aria rend le groupe en `radiogroup` et ses
 *    bascules en `radio` — pas en `toggle` avec `aria-pressed`, et il ne pose
 *    aucun `data-selected`. Les classes d'état actif se greffent sur
 *    `aria-checked` : l'état choisi reprend la surface de la page
 *    (`bg-background shadow-xs font-medium text-foreground`), exactement
 *    comme le sélecteur segmenté de base (`Tabs variant="segmented"`).
 */
export function AnnotationFilterPill({
  filterMode,
  onChangeFilterMode,
  allowPublicAnnotations = true,
  className = '',
  size = 'md',
  showLabel = true,
}: AnnotationFilterPillProps) {
  const isSm = size === 'sm';
  const buttonSize = isSm ? 'xs' : 'sm';
  const iconSizeClass = isSm ? 'size-3.5' : 'size-4';

  const buttonClass = cn(
    'relative inline-flex aspect-square items-center justify-center p-0',
    isSm ? 'size-6' : 'size-7',
    'rounded-[max(calc(var(--radius-button)-2px),4px)] font-normal text-muted-foreground transition-colors duration-150',
    'hover:text-foreground hover:bg-muted/30',
    'aria-checked:bg-background aria-checked:text-foreground aria-checked:shadow-xs aria-checked:font-medium'
  );

  return (
    <ToggleGroup
      aria-label={t`Afficher les annotations`}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[filterMode]}
      onSelectionChange={(keys) => {
        const [next] = keys;
        if (next) onChangeFilterMode(next as AnnotationFilterMode);
      }}
      variant="inset"
      className={cn(
        'inline-flex w-fit items-center gap-1 rounded-control bg-muted/40 p-0.5 select-none',
        className
      )}
    >
      {showLabel && (
        <span
          className={cn(
            'pl-2.5 pr-1 font-medium tracking-tight text-muted-foreground/80 select-none',
            isSm ? 'text-[11px]' : 'text-xs'
          )}
        >
          {t`Annotations`}
        </span>
      )}

      {allowPublicAnnotations && (
        <Tooltip content={t`Toutes les annotations`} placement="top">
          <ToggleButton
            id="all"
            size={buttonSize}
            aria-label={t`Toutes les annotations`}
            className={buttonClass}
          >
            <Sparkles className={iconSizeClass} strokeWidth={1.75} />
          </ToggleButton>
        </Tooltip>
      )}

      <Tooltip content={t`Annotations de l'auteur (officielles)`} placement="top">
        <ToggleButton
          id="official"
          size={buttonSize}
          aria-label={t`Annotations officielles`}
          className={buttonClass}
        >
          <BadgeCheck className={iconSizeClass} strokeWidth={1.75} />
        </ToggleButton>
      </Tooltip>

      <Tooltip
        content={allowPublicAnnotations ? t`Mes annotations uniquement` : t`Mes notes`}
        placement="top"
      >
        <ToggleButton
          id="mine"
          size={buttonSize}
          aria-label={allowPublicAnnotations ? t`Mes annotations` : t`Mes notes`}
          className={buttonClass}
        >
          {allowPublicAnnotations ? (
            <User className={iconSizeClass} strokeWidth={1.75} />
          ) : (
            <Lock className={iconSizeClass} strokeWidth={1.75} />
          )}
        </ToggleButton>
      </Tooltip>

      <Tooltip content={t`Masquer les annotations`} placement="top">
        <ToggleButton
          id="none"
          size={buttonSize}
          aria-label={t`Aucune annotation`}
          className={buttonClass}
        >
          <EyeOff className={iconSizeClass} strokeWidth={1.75} />
        </ToggleButton>
      </Tooltip>
    </ToggleGroup>
  );
}
