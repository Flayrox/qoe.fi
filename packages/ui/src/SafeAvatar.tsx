'use client';

import { useState } from 'react';
import Image from 'next/image';
import { cn } from '@qoe/utils';

export interface SafeAvatarProps {
  src?: string | null;
  alt?: string | null;
  name?: string | null;
  username?: string | null;
  size?: number;
  className?: string;
  fallbackClass?: string;
  unoptimized?: boolean;
}

/* eslint-disable custom/no-raw-tailwind-colors */
// 🎨 Palettes chromatiques élégantes et déterministes basées sur le nom/username
const AVATAR_GRADIENTS = [
  'from-indigo-500 to-cyan-500',
  'from-emerald-500 to-teal-500',
  'from-orange-500 to-amber-500',
  'from-purple-500 to-pink-500',
  'from-blue-600 to-sky-400',
  'from-rose-500 to-rose-400',
  'from-violet-600 to-fuchsia-500',
  'from-slate-700 to-slate-500',
];
/* eslint-enable custom/no-raw-tailwind-colors */

function getDeterministicGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[index]!;
}

function getInitials(name?: string | null, username?: string | null): string {
  const target = name?.trim() || username?.trim() || 'Q';
  const parts = target.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0]! + parts[1][0]!).toUpperCase();
  }
  return target.slice(0, 2).toUpperCase();
}

/**
 * 🛡️ SafeAvatar — Avatar résilient universel
 * - Bascule automatiquement sur un monogramme vectoriel déterministe en cas de 404, format non supporté ou domaine distant non configuré
 * - Garanti sans crash Next.js 500 et sans saut de mise en page (CLS)
 */
export function SafeAvatar({
  src,
  alt,
  name,
  username,
  size = 36,
  className,
  fallbackClass,
  unoptimized = true,
}: SafeAvatarProps) {
  const [hasError, setHasError] = useState(false);
  const displayName = name || alt || username || 'Utilisateur';
  const initials = getInitials(name || alt, username);
  const gradient = getDeterministicGradient(displayName);

  // Nettoyage de l'URL si chaîne vide ou null
  const cleanSrc = src && typeof src === 'string' && src.trim().length > 0 ? src.trim() : null;

  if (!cleanSrc || hasError) {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-full font-bold text-white uppercase select-none shrink-0 shadow-xs bg-gradient-to-tr',
          gradient,
          fallbackClass,
          className
        )}
        style={{
          width: size,
          height: size,
          fontSize: Math.max(10, Math.floor(size * 0.38)),
        }}
        aria-label={displayName}
      >
        {initials}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'relative inline-block rounded-full overflow-hidden shrink-0 bg-muted/40 shadow-xs',
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
        className="w-full h-full object-cover rounded-full"
        onError={() => setHasError(true)}
      />
    </span>
  );
}
