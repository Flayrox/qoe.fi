'use client';

import React, { useEffect, useState } from 'react';
import Image, { type ImageProps } from 'next/image';
import { ImageIcon } from 'lucide-react';
import { cn } from '@qoe/utils';
import { canOptimizeImageSrc } from './image-utils';

export interface SafeImageProps extends Omit<ImageProps, 'onError'> {
  fallbackSrc?: string;
  showIconOnError?: boolean;
  containerClassName?: string;
}

/**
 * 🛡️ SafeImage — Image résiliente universelle
 *
 * - Empêche tout crash 500 au runtime Next.js
 * - Bascule sur `fallbackSrc` quand l'image principale échoue, puis sur une
 *   icône quand le repli échoue aussi (deux échecs distincts, pas une boucle)
 * - L'erreur est liée à UNE source : un changement de `src`/`fallbackSrc`
 *   remet la chaîne à zéro (le feed réutilise les mêmes instances de carte)
 *
 * ⚠️ Historique : le repli était conditionné à `!hasError`, donc il ne
 *    s'affichait **jamais** après une erreur — seul le cas « pas de source »
 *    l'utilisait. Une vignette d'article morte laissait donc l'icône alors
 *    qu'un `fallbackSrc` était fourni.
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
  const [failed, setFailed] = useState({ primary: false, fallback: false });

  // L'erreur appartient à une source précise : nouvelle source, nouvelle chance.
  useEffect(() => {
    setFailed({ primary: false, fallback: false });
  }, [src, fallbackSrc]);

  const shouldUnoptimize = unoptimized ?? !canOptimizeImageSrc(src);
  const isPlaceholder = (hasSource: boolean, failedFor: boolean) => !hasSource || failedFor;

  if (isPlaceholder(Boolean(src), failed.primary)) {
    if (fallbackSrc && !failed.fallback) {
      const fallbackUnoptimized = unoptimized ?? !canOptimizeImageSrc(fallbackSrc);

      return (
        <Image
          {...rest}
          src={fallbackSrc}
          alt={alt}
          className={className}
          unoptimized={fallbackUnoptimized}
          onError={() => setFailed((previous) => ({ ...previous, fallback: true }))}
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
        {showIconOnError && <ImageIcon className="w-5 h-5 opacity-40" aria-hidden />}
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
      onError={() => setFailed((previous) => ({ ...previous, primary: true }))}
    />
  );
}
