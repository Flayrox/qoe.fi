'use client';

import React from 'react';
import { EyeOff } from 'lucide-react';
import { cn } from '@qoe/utils';
import { t } from '@lingui/core/macro';
import type { AnnotationFilterMode } from './types';

export interface AnnotationFilterPillProps {
  filterMode: AnnotationFilterMode;
  onChangeFilterMode: (mode: AnnotationFilterMode) => void;
  allowPublicAnnotations?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}

export function AnnotationFilterPill({
  filterMode,
  onChangeFilterMode,
  allowPublicAnnotations = true,
  className = '',
  size = 'md',
}: AnnotationFilterPillProps) {
  const isSm = size === 'sm';

  return (
    <div
      className={cn(
        'flex items-center gap-1 p-0.5 rounded-full bg-muted/40 border border-border/30 font-sans select-none',
        isSm ? 'text-[11px]' : 'text-xs',
        className
      )}
    >
      {allowPublicAnnotations && (
        <button
          type="button"
          onClick={() => onChangeFilterMode('all')}
          className={cn(
            'rounded-full font-medium transition-all cursor-pointer',
            isSm ? 'px-2.5 py-0.5' : 'px-3 py-1',
            filterMode === 'all'
              ? 'bg-foreground text-background dark:bg-white dark:text-black shadow-xs font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          )}
          title={t`Afficher toutes les annotations (publiques, officielles et privées)`}
        >
          {t`Toutes`}
        </button>
      )}

      <button
        type="button"
        onClick={() => onChangeFilterMode('official')}
        className={cn(
          'rounded-full font-medium transition-all cursor-pointer flex items-center gap-1',
          isSm ? 'px-2.5 py-0.5' : 'px-3 py-1',
          filterMode === 'official'
            ? 'bg-foreground text-background dark:bg-white dark:text-black shadow-xs font-semibold'
            : 'text-muted-foreground hover:text-foreground'
        )}
        title={t`Afficher uniquement les annotations officielles de l'auteur`}
      >
        <span>{t`Officielles`}</span>
      </button>

      <button
        type="button"
        onClick={() => onChangeFilterMode('none')}
        className={cn(
          'rounded-full font-medium transition-all cursor-pointer flex items-center gap-1',
          isSm ? 'px-2.5 py-0.5' : 'px-3 py-1',
          filterMode === 'none'
            ? 'bg-foreground text-background dark:bg-white dark:text-black shadow-xs font-semibold'
            : 'text-muted-foreground hover:text-foreground'
        )}
        title={t`Masquer toutes les annotations pour une lecture épurée sans interruption`}
      >
        <EyeOff className={isSm ? 'w-2.5 h-2.5' : 'w-3 h-3'} />
        <span>{t`Aucune`}</span>
      </button>
    </div>
  );
}
