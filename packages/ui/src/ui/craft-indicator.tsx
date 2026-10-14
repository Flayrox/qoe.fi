'use client';

// =====================================================================
// 🎯 @qoe/ui — craft-indicator.tsx
// =====================================================================
// Indicateur de repère interactif inspiré de Devouring Details.
// Entièrement personnalisable : couleur HEX/CSS, point plein, icône
// géométrique, logo ou SVG sur-mesure. Zéro emoji IA.
// =====================================================================

import React from 'react';
import Image from 'next/image';
import { cn } from '@qoe/utils';

export type CraftIndicatorType = 'dot' | 'diamond' | 'asterisk' | 'square' | 'logo' | 'custom-svg';

export interface CraftIndicatorProps extends React.HTMLAttributes<HTMLSpanElement> {
  type?: CraftIndicatorType;
  color?: string;
  size?: number;
  logoUrl?: string;
  svgContent?: string;
  isActive?: boolean;
  className?: string;
}

export function CraftIndicator({
  type = 'dot',
  color = 'var(--tenant-accent, #F97316)',
  size = 14,
  logoUrl,
  svgContent,
  isActive = false,
  className,
  style,
  ...props
}: CraftIndicatorProps) {
  const containerStyle: React.CSSProperties = {
    width: `${size}px`,
    height: `${size}px`,
    ...style,
  };

  // 1. Logo personnalisé
  if (type === 'logo' && logoUrl) {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center shrink-0 overflow-hidden rounded-full',
          className
        )}
        style={containerStyle}
        {...props}
      >
        <Image
          src={logoUrl}
          alt=""
          width={size}
          height={size}
          unoptimized={logoUrl.startsWith('data:')}
          className="object-cover w-full h-full"
        />
      </span>
    );
  }

  // 2. SVG personnalisé inline
  if (type === 'custom-svg' && svgContent) {
    return (
      <span
        className={cn('inline-flex items-center justify-center shrink-0', className)}
        style={{ ...containerStyle, color }}
        dangerouslySetInnerHTML={{ __html: svgContent }}
        {...props}
      />
    );
  }

  // 3. Losange géométrique épuré
  if (type === 'diamond') {
    return (
      <span
        className={cn('inline-flex items-center justify-center shrink-0', className)}
        style={containerStyle}
        {...props}
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="transition-transform duration-200"
          style={{ transform: isActive ? 'scale(1.15) rotate(45deg)' : 'rotate(45deg)' }}
        >
          <rect x="3" y="3" width="10" height="10" rx="1.5" fill={color} />
        </svg>
      </span>
    );
  }

  // 4. Astérisque sobre (Swiss Typographic Asterisk)
  if (type === 'asterisk') {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center shrink-0 font-mono font-bold leading-none',
          className
        )}
        style={{ ...containerStyle, color, fontSize: `${Math.round(size * 1.3)}px` }}
        {...props}
      >
        ﹡
      </span>
    );
  }

  // 5. Carré minimal
  if (type === 'square') {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center shrink-0 rounded-xs transition-transform',
          className
        )}
        style={{ ...containerStyle, backgroundColor: color }}
        {...props}
      />
    );
  }

  // 6. Point classique (Défaut Devouring Details / Rauno)
  return (
    <span
      role="img"
      aria-label="Repère éditorial"
      className={cn(
        'inline-flex items-center justify-center shrink-0 rounded-full transition-all duration-200',
        isActive && 'ring-2 ring-offset-1 ring-current',
        className
      )}
      style={{
        ...containerStyle,
        backgroundColor: color,
        color,
      }}
      {...props}
    />
  );
}
