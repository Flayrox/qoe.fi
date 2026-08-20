'use client';

import React from 'react';
import { cn } from '@qoe/utils';
import { CertifiedBadge } from './CertifiedBadge';
import { SafeAvatar } from '../SafeAvatar';

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

export interface UserAvatarProps {
  user?: {
    id?: string;
    name?: string | null;
    username?: string | null;
    subdomain?: string | null;
    logoUrl?: string | null;
    isCertified?: boolean;
  } | null;
  size?: AvatarSize;
  className?: string;
  showBadge?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

const sizePixels: Record<AvatarSize, number> = {
  xs: 20,
  sm: 28,
  md: 40,
  lg: 48,
  xl: 80,
  '2xl': 112,
};

const badgePixels: Record<AvatarSize, number> = {
  xs: 10,
  sm: 12,
  md: 14,
  lg: 16,
  xl: 20,
  '2xl': 24,
};

export function UserAvatar({
  user,
  size = 'md',
  className,
  showBadge = false,
  onClick,
}: UserAvatarProps) {
  const name = user?.name || user?.username || 'Utilisateur';
  const logoUrl = user?.logoUrl;
  const isCertified = user?.isCertified || false;
  const pixelSize = sizePixels[size] || 40;
  const badgeSize = badgePixels[size] || 14;

  return (
    <div
      onClick={onClick}
      className={cn(
        'relative inline-block shrink-0 group/avatar font-sans',
        onClick && 'cursor-pointer',
        className
      )}
    >
      <SafeAvatar
        src={logoUrl}
        name={name}
        username={user?.username}
        size={pixelSize}
        className="transition-transform duration-200 group-hover/avatar:scale-[1.02] border border-border/40"
      />

      {showBadge && isCertified && (
        <div className="absolute -bottom-0.5 -right-0.5 z-10">
          <CertifiedBadge size={badgeSize} />
        </div>
      )}
    </div>
  );
}
