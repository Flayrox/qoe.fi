'use client';

import React from 'react';
import { AuthorAvatar } from '../ui/AuthorAvatar';
import { ProfileHoverCard } from './ProfileHoverCard';
import { t } from '@lingui/core/macro';

export interface KnownLiker {
  id: string;
  name: string | null;
  username: string | null;
  subdomain?: string | null;
  logoUrl?: string | null;
  isCertified?: boolean;
}

export interface KnownLikersProps {
  likers: KnownLiker[];
  totalCount?: number;
  onOpenProfile?: (username: string) => void;
  onOpenLikersList?: () => void;
  className?: string;
  variant?: 'card' | 'inline';
}

export function KnownLikers({
  likers = [],
  totalCount = 0,
  onOpenProfile,
  onOpenLikersList,
  className = '',
  variant = 'card',
}: KnownLikersProps) {
  if (!likers || likers.length === 0) return null;

  const displayedLikers = likers.slice(0, 3);
  const firstLiker = displayedLikers[0];
  const secondLiker = displayedLikers[1];
  const remainingCount =
    totalCount > displayedLikers.length ? totalCount - displayedLikers.length : 0;

  const getHandle = (user: KnownLiker) => user.username || user.subdomain || user.id.slice(0, 8);

  if (variant === 'inline') {
    return (
      <div
        onClick={onOpenLikersList}
        className={`flex items-center gap-1.5 transition-all cursor-pointer select-none text-xs text-muted-foreground font-sans ${className}`}
      >
        {/* Overlapping Avatar Stack */}
        <div className="flex items-center -space-x-1.5 shrink-0">
          {displayedLikers.map((liker, idx) => (
            <div
              key={liker.id}
              className="relative ring-1 ring-background rounded-full"
              style={{ zIndex: 10 - idx }}
            >
              <AuthorAvatar user={liker} size="xs" showBadge={false} />
            </div>
          ))}
        </div>

        {/* Social Proof Text */}
        <div className="text-[11px] leading-tight text-muted-foreground truncate">
          <span>{t`Aimé par `}</span>
          <ProfileHoverCard user={firstLiker} onOpenProfile={onOpenProfile}>
            <strong className="font-semibold text-foreground hover:underline hover:text-brand cursor-pointer">
              @{getHandle(firstLiker)}
            </strong>
          </ProfileHoverCard>

          {secondLiker && (
            <>
              <span> et </span>
              <ProfileHoverCard user={secondLiker} onOpenProfile={onOpenProfile}>
                <strong className="font-semibold text-foreground hover:underline hover:text-brand cursor-pointer">
                  @{getHandle(secondLiker)}
                </strong>
              </ProfileHoverCard>
            </>
          )}

          {remainingCount > 0 && (
            <span>
              {' '}
              et {remainingCount} autre{remainingCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onOpenLikersList}
      className={`flex items-center gap-2.5 py-2 px-3 my-1.5 rounded-xl bg-card/60 hover:bg-muted/40 border border-border/30 transition-all cursor-pointer select-none text-xs text-muted-foreground font-sans ${className}`}
    >
      {/* Overlapping Avatar Stack */}
      <div className="flex items-center -space-x-2 shrink-0">
        {displayedLikers.map((liker, idx) => (
          <div
            key={liker.id}
            className="relative ring-2 ring-background rounded-full z-[3]"
            style={{ zIndex: 10 - idx }}
          >
            <AuthorAvatar user={liker} size="xs" showBadge={false} />
          </div>
        ))}
      </div>

      {/* Social Proof Text */}
      <div className="flex-1 min-w-0 text-[11px] leading-tight text-foreground/90 truncate">
        <span>{t`Aimé par `}</span>
        <ProfileHoverCard user={firstLiker} onOpenProfile={onOpenProfile}>
          <strong className="font-semibold text-foreground hover:underline hover:text-brand cursor-pointer">
            @{getHandle(firstLiker)}
          </strong>
        </ProfileHoverCard>

        {secondLiker && (
          <>
            <span> et </span>
            <ProfileHoverCard user={secondLiker} onOpenProfile={onOpenProfile}>
              <strong className="font-semibold text-foreground hover:underline hover:text-brand cursor-pointer">
                @{getHandle(secondLiker)}
              </strong>
            </ProfileHoverCard>
          </>
        )}

        {remainingCount > 0 && (
          <span>
            {' '}
            et {remainingCount} autre{remainingCount > 1 ? 's' : ''} personne
            {remainingCount > 1 ? 's' : ''} que vous suivez
          </span>
        )}
      </div>
    </div>
  );
}
