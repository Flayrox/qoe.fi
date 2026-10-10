'use client';

import React, { useState } from 'react';
import Image, { type ImageProps } from 'next/image';
import { ImageIcon } from 'lucide-react';
import { cn } from '@qoe/utils';

export interface SafeImageProps extends Omit<ImageProps, 'onError'> {
  fallbackSrc?: string;
  showIconOnError?: boolean;
  containerClassName?: string;
}

/**
 * 🛡️ SafeImage — Image résiliente universelle
 * - Empêche tout crash 500 au runtime Next.js
 * - Supporte le basculement transparent sur fallback ou placeholder sans CLS
 */
export function SafeImage({
  src,
  alt,
  fallbackSrc,
  showIconOnError = true,
  className,
  containerClassName,
  unoptimized,
  ...rest
}: SafeImageProps) {
  const [hasError, setHasError] = useState(false);

  // Détection automatique de format SVG ou URL dynamique / Data-URI
  const isSvg = typeof src === 'string' && (src.endsWith('.svg') || src.includes('.svg?'));
  const isDataUri = typeof src === 'string' && src.startsWith('data:');
  const shouldUnoptimize =
    unoptimized ?? (isSvg || isDataUri || (typeof src === 'string' && src.startsWith('http')));

  if (hasError || !src) {
    if (fallbackSrc && !hasError) {
      const fallbackIsSvg =
        typeof fallbackSrc === 'string' &&
        (fallbackSrc.endsWith('.svg') || fallbackSrc.includes('.svg?'));
      const fallbackIsDataUri = typeof fallbackSrc === 'string' && fallbackSrc.startsWith('data:');
      const fallbackUnoptimized =
        unoptimized ??
        (fallbackIsSvg ||
          fallbackIsDataUri ||
          (typeof fallbackSrc === 'string' && fallbackSrc.startsWith('http')));

      return (
        <Image
          {...rest}
          src={fallbackSrc}
          alt={alt}
          className={className}
          unoptimized={fallbackUnoptimized}
          onError={() => setHasError(true)}
        />
      );
    }

    return (
      <div
        className={cn(
          'flex items-center justify-center bg-muted/40 text-muted-foreground/50 border border-border/40 select-none',
          containerClassName,
          className
        )}
        style={{
          width: rest.width,
          height: rest.height,
        }}
      >
        {showIconOnError && <ImageIcon className="w-5 h-5 opacity-40" />}
      </div>
    );
  }

  return (
    <Image
      {...rest}
      src={src}
      alt={alt}
      className={className}
      unoptimized={shouldUnoptimize}
      onError={() => setHasError(true)}
    />
  );
}
