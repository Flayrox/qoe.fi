'use client';

import React from 'react';
import Image from 'next/image';
import { cn } from '@qoe/utils';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

interface AuthorAvatarProps {
  user?: {
    name?: string | null;
    username?: string | null;
    logoUrl?: string | null;
    isCertified?: boolean;
  } | null;
  size?: AvatarSize;
  className?: string;
  showBadge?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

const sizeClasses: Record<AvatarSize, { container: string; text: string; badge: string }> = {
  xs: {
    container: 'w-5 h-5 rounded-full',
    text: 'text-[9px]',
    badge: 'text-[8px] -bottom-0.5 -right-0.5',
  },
  sm: {
    container: 'w-7 h-7 rounded-full',
    text: 'text-[10px]',
    badge: 'text-[9px] -bottom-0.5 -right-0.5',
  },
  md: {
    container: 'w-9 h-9 rounded-full',
    text: 'text-xs',
    badge: 'text-[10px] -bottom-0.5 -right-0.5',
  },
  lg: { container: 'w-12 h-12 rounded-full', text: 'text-sm', badge: 'text-xs -bottom-1 -right-1' },
  xl: {
    container: 'w-20 h-20 rounded-full',
    text: 'text-2xl',
    badge: 'text-sm -bottom-1 -right-1',
  },
  '2xl': {
    container: 'w-28 h-28 rounded-full',
    text: 'text-4xl',
    badge: 'text-base -bottom-1 -right-1',
  },
};

export function AuthorAvatar({
  user,
  size = 'md',
  className,
  showBadge = true,
  onClick,
}: AuthorAvatarProps) {
  const name = user?.name || 'Utilisateur';
  const logoUrl = user?.logoUrl;
  const isCertified = user?.isCertified || false;
  const initial = name.trim().charAt(0).toUpperCase() || 'U';

  const sizeStyle = sizeClasses[size] || sizeClasses.md;

  return (
    <div
      onClick={onClick}
      className={cn(
        'relative inline-block shrink-0 group/avatar',
        onClick && 'cursor-pointer',
        className
      )}
    >
      <div
        className={cn(
          'relative overflow-hidden border border-border/40 bg-muted flex items-center justify-center font-semibold text-foreground select-none transition-transform duration-300 group-hover/avatar:scale-[1.02]',
          sizeStyle.container
        )}
      >
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt={name}
            fill
            sizes="(max-width: 640px) 96px, 192px"
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full bg-brand/10 text-brand font-bold flex items-center justify-center">
            <span className={sizeStyle.text}>{initial}</span>
          </div>
        )}
      </div>

      {showBadge && isCertified && (
        <span
          className={cn(
            'absolute text-brand font-black drop-shadow-xs bg-card rounded-full p-0.2 leading-none flex items-center justify-center',
            sizeStyle.badge
          )}
          title="Auteur certifié"
        >
          ✓
        </span>
      )}
    </div>
  );
}
