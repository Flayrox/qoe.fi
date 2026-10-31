'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { cn } from '@qoe/utils';
import { getAvatarTheme } from '@qoe/theme';
import { UserSilhouette, MediaEmblem } from '@qoe/brand';

export type AvatarShape = 'circle' | 'square';
export type AvatarAccountType = 'PERSONAL' | 'MEDIA';

export interface SafeAvatarProps {
  id?: string | null;
  src?: string | null;
  alt?: string | null;
  name?: string | null;
  username?: string | null;
  size?: number;
  /** Forme explicite. Sans elle, elle se déduit de `type` : personne = rond,
   *  média = carré à petits coins arrondis. `squircle` reste accepté comme
   *  alias historique de `square` (même rendu). */
  shape?: AvatarShape | 'squircle';
  type?: AvatarAccountType | string | null;
  className?: string;
  fallbackClass?: string;
  unoptimized?: boolean;
}

/**
 * Une seule courbure par nature d'identité : le cercle pour une personne,
 * le carré à petits coins pour un média. Le rayon ne dépend pas de la taille
 * (un média de 24 px et un média de 96 px restent le même carré).
 */
function getShapeClass(shape: AvatarShape): string {
  return shape === 'circle' ? 'rounded-full' : 'rounded-[var(--radius-sm)]';
}

/**
 * 🛡️ SafeAvatar — Avatar résilient universel (Web 2026)
 * - Thèmes déterministes persistants au rechargement (Sakura, Matcha, Astral, etc.)
 * - Distinction stricte : cercle pour une personne, carré à petits coins
 *   arrondis pour un média
 * - Fallback vectoriel ultra-premium style Discord / Twitter
 */
export function SafeAvatar({
  id,
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

  // Résolution de la forme : un média est toujours un carré à coins
  // arrondis par défaut ; une personne, un cercle. `squircle` est l'alias
  // historique de `square`.
  const isMedia = type === 'MEDIA';
  const resolvedShape: AvatarShape =
    shape === 'square' || shape === 'squircle'
      ? 'square'
      : shape === 'circle'
        ? 'circle'
        : isMedia
          ? 'square'
          : 'circle';
  const shapeClass = getShapeClass(resolvedShape);

  // Thème déterministe basé en priorité sur le handle public unique (username / slug),
  // puis sur l'identifiant immuable (id / UUID), puis le nom
  const rawSeed = username || id || name || alt || 'qoe-user';
  const seed = rawSeed.replace(/^@/, '').toLowerCase().trim();
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
          fallbackClass,
          className,
          // La forme passe EN DERNIER : un appelant peut encore styler
          // l'avatar (taille, anneau, ombre) mais pas contredire la règle
          // personne = cercle / média = carré avec un `rounded-full` oublié.
          shapeClass
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
        role="img"
        aria-label={displayName}
        title={displayName}
        data-avatar
        data-avatar-shape={resolvedShape}
        data-avatar-entity={isMedia ? 'media' : 'person'}
        data-account-type={isMedia ? 'MEDIA' : 'PERSONAL'}
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
        className,
        shapeClass
      )}
      style={{ width: size, height: size }}
      data-avatar
      data-avatar-shape={resolvedShape}
      data-avatar-entity={isMedia ? 'media' : 'person'}
      data-account-type={isMedia ? 'MEDIA' : 'PERSONAL'}
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
