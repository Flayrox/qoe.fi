'use client';

import React from 'react';
import { cn } from '@qoe/utils';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '../ui/hover-card';
import { AuthorAvatar } from '../ui/AuthorAvatar';
import { CertifiedBadge } from '../ui/CertifiedBadge';
import { routes } from '@qoe/config/routes';

export interface ProfileHoverCardProps {
  user?: {
    id?: string;
    name?: string | null;
    username?: string | null;
    subdomain?: string | null;
    logoUrl?: string | null;
    isCertified?: boolean;
  } | null;
  username?: string;
  children: React.ReactNode;
  onOpenProfile?: (username: string) => void;
  className?: string;
}

export function ProfileHoverCard({
  user,
  username: propUsername,
  children,
  onOpenProfile,
  className,
}: ProfileHoverCardProps) {
  const handle =
    propUsername || user?.username || user?.subdomain || user?.id?.slice(0, 8) || 'user';
  const cleanHandle = handle.replace(/^@/, '');
  const name = user?.name || cleanHandle;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onOpenProfile) {
      onOpenProfile(cleanHandle);
    } else {
      window.location.href = routes.feed.profile(cleanHandle);
    }
  };

  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <span onClick={handleClick} className={cn('inline-block cursor-pointer', className)}>
            {children}
          </span>
        }
      />
      <HoverCardContent className="w-72 p-4 bg-popover border border-border/40 rounded-2xl shadow-2xl z-50 font-sans">
        <div className="flex items-start gap-3">
          <AuthorAvatar
            user={user || { name, username: cleanHandle }}
            size="md"
            showBadge={false}
          />
          <div className="space-y-1 flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="text-xs font-bold text-foreground leading-snug truncate">{name}</h4>
              {user?.isCertified && <CertifiedBadge />}
            </div>
            <p className="text-[11px] text-muted-foreground leading-none truncate">
              @{cleanHandle}
            </p>

            <div className="pt-2">
              <button
                type="button"
                onClick={handleClick}
                className="w-full py-1.5 px-3 text-xs font-semibold bg-brand text-brand-foreground hover:opacity-90 transition-opacity rounded-xl cursor-pointer text-center"
              >
                Voir le profil
              </button>
            </div>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
