'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { cn } from '@qoe/utils';
import { getAvatarTheme } from '@qoe/theme';
import { UserSilhouette, MediaEmblem } from '@qoe/brand';

export type AvatarShape = 'circle' | 'squircle';
export type AvatarAccountType = 'PERSONAL' | 'MEDIA';

export interface SafeAvatarProps {
  src?: string | null;
  alt?: string | null;
  name?: string | null;
  username?: string | null;
  size?: number;
  shape?: AvatarShape;
  type?: AvatarAccountType | string | null;
  className?: string;
  fallbackClass?: string;
  unoptimized?: boolean;
}

/**
 * Calcule la classe de courbure adéquate selon la forme et la taille.
 */
function getShapeClass(shape: AvatarShape, size: number): string {
  if (shape === 'circle') return 'rounded-full';
  if (size >= 80) return 'rounded-2xl';
  if (size >= 40) return 'rounded-xl';
  return 'rounded-lg';
}

/**
 * 🛡️ SafeAvatar — Avatar résilient universel (Web 2026)
 * - Thèmes déterministes persistants au rechargement (Sakura, Matcha, Astral, etc.)
 * - Distinction stricte : Cercle pour Utilisateur vs Squircle pour Média
 * - Fallback vectoriel ultra-premium style Discord / Twitter
 */
export function SafeAvatar({
  src,
  alt,
  name,
  username,
  size = 36,
  shape,
  type,
  className,
  fallbackClass,
  unoptimized = true,
}: SafeAvatarProps) {
  const [hasError, setHasError] = useState(false);
  const displayName = name || alt || username || 'Utilisateur';

  // Résolution de la forme : un média est toujours squircle par défaut
  const isMedia = type === 'MEDIA';
  const resolvedShape: AvatarShape = shape || (isMedia ? 'squircle' : 'circle');
  const shapeClass = getShapeClass(resolvedShape, size);

  // Thème déterministe basé sur l'identifiant / username
  const seed = username || name || alt || 'qoe-user';
  const theme = getAvatarTheme(seed, isMedia ? 'MEDIA' : 'PERSONAL');

  // Nettoyage de l'URL source
  const cleanSrc = src && typeof src === 'string' && src.trim().length > 0 ? src.trim() : null;

  if (!cleanSrc || hasError) {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center shrink-0 select-none shadow-xs overflow-hidden',
          'bg-[var(--avatar-bg-light)] dark:bg-[var(--avatar-bg-dark)]',
          'text-[var(--avatar-icon-light)] dark:text-[var(--avatar-icon-dark)]',
          'border border-[var(--avatar-border-light)] dark:border-[var(--avatar-border-dark)]',
          shapeClass,
          fallbackClass,
          className
        )}
        style={
          {
            width: size,
            height: size,
            '--avatar-bg-light': theme.lightBg,
            '--avatar-bg-dark': theme.darkBg,
            '--avatar-icon-light': theme.lightIcon,
            '--avatar-icon-dark': theme.darkIcon,
            '--avatar-border-light': theme.borderLight,
            '--avatar-border-dark': theme.borderDark,
          } as React.CSSProperties
        }
        aria-label={displayName}
        title={displayName}
      >
        {isMedia ? (
          <MediaEmblem size={Math.round(size * 0.5)} />
        ) : (
          <UserSilhouette size={Math.round(size * 0.52)} />
        )}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'relative inline-block overflow-hidden shrink-0 bg-muted/40 shadow-xs',
        shapeClass,
        className
      )}
      style={{ width: size, height: size }}
    >
      <Image
        src={cleanSrc}
        alt={displayName}
        width={size}
        height={size}
        unoptimized={unoptimized}
        className={cn('w-full h-full object-cover', shapeClass)}
        onError={() => setHasError(true)}
      />
    </span>
  );
}
