'use client';

import React from 'react';
import { cn } from '@qoe/utils';

export interface ProgressiveBlurProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Direction of the blur gradient (default: 'top') */
  direction?: 'top' | 'bottom' | 'left' | 'right';
  /** Max blur radius in px (default: 16) */
  maxBlur?: number;
  /** Custom background tint variable or color (default: 'var(--background)') */
  tint?: string;
  /** Whether to include the color-mix gradient fade overlay (default: true) */
  showGradient?: boolean;
}

const BLUR_STOPS = [
  { blur: 1, maskStop1: 75, maskStop2: 100 },
  { blur: 2, maskStop1: 60, maskStop2: 85 },
  { blur: 4, maskStop1: 45, maskStop2: 70 },
  { blur: 8, maskStop1: 30, maskStop2: 55 },
  { blur: 16, maskStop1: 15, maskStop2: 40 },
];

export const ProgressiveBlur = React.forwardRef<HTMLDivElement, ProgressiveBlurProps>(
  (
    {
      direction = 'top',
      maxBlur = 16,
      tint = 'var(--background)',
      showGradient = true,
      className,
      style,
      ...props
    },
    ref
  ) => {
    const dirTo =
      direction === 'top'
        ? 'to bottom'
        : direction === 'bottom'
          ? 'to top'
          : direction === 'left'
            ? 'to right'
            : 'to left';

    const blurMultiplier = maxBlur / 16;

    return (
      <div
        ref={ref}
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute z-20 overflow-hidden select-none',
          direction === 'top' && 'top-0 left-0 right-0 h-32',
          direction === 'bottom' && 'bottom-0 left-0 right-0 h-32',
          direction === 'left' && 'top-0 bottom-0 left-0 w-32',
          direction === 'right' && 'top-0 bottom-0 right-0 w-32',
          className
        )}
        style={style}
        {...props}
      >
        {BLUR_STOPS.map((stop, index) => {
          const blurVal = Math.round(stop.blur * blurMultiplier * 10) / 10;
          const mask = `linear-gradient(${dirTo}, rgba(0,0,0,1) 0%, rgba(0,0,0,${0.6 + index * 0.075}) ${stop.maskStop1}%, rgba(0,0,0,0) ${stop.maskStop2}%)`;

          return (
            <div
              key={`blur-layer-${index}`}
              className="absolute inset-0"
              style={{
                backdropFilter: `blur(${blurVal}px)`,
                WebkitBackdropFilter: `blur(${blurVal}px)`,
                WebkitMaskImage: mask,
                maskImage: mask,
              }}
            />
          );
        })}

        {showGradient && (
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(${dirTo}, ${tint} 0%, color-mix(in srgb, ${tint} 92%, transparent) 25%, color-mix(in srgb, ${tint} 65%, transparent) 50%, color-mix(in srgb, ${tint} 25%, transparent) 75%, transparent 100%)`,
            }}
          />
        )}
      </div>
    );
  }
);

ProgressiveBlur.displayName = 'ProgressiveBlur';
