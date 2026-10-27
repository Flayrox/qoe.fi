'use client';

import React from 'react';
import { EyeOff } from 'lucide-react';
import { cn } from '@qoe/utils';
import { t } from '@lingui/core/macro';
import { ToggleButton, ToggleGroup } from '../primitives/toggle/toggle-button';
import type { AnnotationFilterMode } from './types';

export interface AnnotationFilterPillProps {
  filterMode: AnnotationFilterMode;
  onChangeFilterMode: (mode: AnnotationFilterMode) => void;
  allowPublicAnnotations?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}

/**
 * Filtre d'affichage des annotations.
 *
 * 🎯 Trois boutons qui se ressemblent ne disent pas qu'ils forment une seule
 *    question. L'ancienne version était trois `<button>` avec une classe
 *    conditionnelle : rien n'indiquait à un lecteur d'écran que « Toutes »
 *    était le choix actif, ni qu'il fallait en choisir un seul.
 *
 *    Le groupe porte maintenant `aria-pressed` sur chaque bascule et un nom
 *    accessible sur le groupe : « Toutes, enfoncé » se lit.
 */
export function AnnotationFilterPill({
  filterMode,
  onChangeFilterMode,
  allowPublicAnnotations = true,
  className = '',
  size = 'md',
}: AnnotationFilterPillProps) {
  const isSm = size === 'sm';

  const buttonClass = cn(
    'h-auto rounded-full border-0 bg-transparent px-2.5 py-0.5 type-control-xs font-medium',
    'text-muted-foreground hover:text-foreground',
    'data-[selected]:bg-foreground data-[selected]:font-semibold data-[selected]:text-background',
    isSm ? 'text-[11px]' : 'px-3 py-1'
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
      className={cn(
        'gap-1 rounded-full border border-border/30 bg-muted/40 p-0.5 font-sans select-none',
        className
      )}
    >
      {allowPublicAnnotations && (
        <ToggleButton id="all" className={buttonClass}>
          {t`Toutes`}
        </ToggleButton>
      )}

      <ToggleButton id="official" className={buttonClass}>
        <span>{t`Officielles`}</span>
      </ToggleButton>

      <ToggleButton id="none" className={cn(buttonClass, 'gap-1')}>
        <EyeOff className={isSm ? 'size-2.5' : 'size-3'} strokeWidth={1.75} />
        <span>{t`Aucune`}</span>
      </ToggleButton>
    </ToggleGroup>
  );
}
