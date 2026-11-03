'use client';

import * as React from 'react';
import { Switch as AriaSwitch, type SwitchProps as AriaSwitchProps } from 'react-aria-components';
import { cn } from '@qoe/utils';

export interface SwitchProps extends Omit<AriaSwitchProps, 'children' | 'className'> {
  label?: React.ReactNode;
  children?: React.ReactNode;
  description?: React.ReactNode;
  size?: 'sm' | 'md';
  className?: string;
  trackClassName?: string;
  thumbClassName?: string;
}

const TRACK_SIZES: Record<'sm' | 'md', string> = {
  sm: 'h-4 w-7 p-0.5',
  md: 'h-5 w-9 p-0.5',
};

const THUMB_SIZES: Record<'sm' | 'md', { size: string; translate: string }> = {
  sm: { size: 'size-3', translate: 'translate-x-3' },
  md: { size: 'size-4', translate: 'translate-x-4' },
};

/**
 * Interrupteur accessible (Switch) qoe.fi.
 *
 * Basé sur `react-aria-components` : apporte la sémantique `role="switch"`,
 * `aria-checked`, le support du clavier (Espace/Entrée), l'anneau de focus
 * accessible, et l'association automatique libellé/description.
 */
export function Switch({
  label,
  children,
  description,
  size = 'md',
  className,
  trackClassName,
  thumbClassName,
  isDisabled,
  ...props
}: SwitchProps) {
  const { size: thumbSize, translate } = THUMB_SIZES[size];
  const title = label ?? children;

  return (
    <AriaSwitch
      isDisabled={isDisabled}
      className={({ isDisabled: disabled }) =>
        cn(
          'group flex items-start justify-between gap-4 select-none outline-hidden cursor-pointer',
          disabled && 'cursor-not-allowed opacity-50',
          className
        )
      }
      {...props}
    >
      {({ isSelected, isFocusVisible }) => (
        <>
          {(title || description) && (
            <div className="flex flex-col text-left mr-auto">
              {title && (
                <span className="text-xs font-semibold text-foreground leading-tight">{title}</span>
              )}
              {description && (
                <span className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                  {description}
                </span>
              )}
            </div>
          )}

          <div
            data-slot="switch-track"
            className={cn(
              'relative inline-flex shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out',
              TRACK_SIZES[size],
              isSelected ? 'bg-primary' : 'bg-muted/80 dark:bg-muted',
              isFocusVisible && 'ring-2 ring-ring/60 ring-offset-2 ring-offset-background',
              trackClassName
            )}
          >
            <span
              data-slot="switch-thumb"
              className={cn(
                'pointer-events-none block rounded-full bg-background shadow-xs transition-transform duration-200 ease-in-out',
                thumbSize,
                isSelected ? translate : 'translate-x-0',
                thumbClassName
              )}
            />
          </div>
        </>
      )}
    </AriaSwitch>
  );
}
