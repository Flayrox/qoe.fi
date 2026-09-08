'use client';

import React from 'react';
import { UserAvatar, type UserAvatarProps } from './UserAvatar';
import { ProfileHoverCard } from '../social/ProfileHoverCard';

export interface PreviewableUserAvatarProps extends UserAvatarProps {
  onOpenProfile?: (username: string) => void;
  disableHoverCard?: boolean;
}

export function PreviewableUserAvatar({
  user,
  size = 'md',
  shape,
  type,
  className,
  showBadge = false,
  onOpenProfile,
  disableHoverCard = false,
  onClick,
}: PreviewableUserAvatarProps) {
  const username = user?.username || user?.subdomain || user?.id || '';

  if (disableHoverCard || !username) {
    return (
      <UserAvatar
        user={user}
        size={size}
        shape={shape}
        type={type}
        className={className}
        showBadge={showBadge}
        onClick={onClick}
      />
    );
  }

  return (
    <ProfileHoverCard user={user} username={username} onOpenProfile={onOpenProfile}>
      <UserAvatar
        user={user}
        size={size}
        shape={shape}
        type={type}
        className={className}
        showBadge={showBadge}
      />
    </ProfileHoverCard>
  );
}
