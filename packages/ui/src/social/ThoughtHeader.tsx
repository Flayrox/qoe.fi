'use client';

import React from 'react';
import { t } from '@lingui/core/macro';
import { cn } from '@qoe/utils';
import { ProfileHoverCard } from './ProfileHoverCard';
import { CertifiedBadge } from '../ui/CertifiedBadge';
import { EntityActionMenu } from './EntityActionMenu';
import { getThoughtUrl } from '@qoe/config';

export interface ThoughtAuthor {
  id: string;
  name: string | null;
  username: string | null;
  subdomain?: string | null;
  logoUrl?: string | null;
  isCertified?: boolean;
  isMuted?: boolean;
  isBlocked?: boolean;
  type?: 'PERSONAL' | 'MEDIA' | string | null;
}

export interface ThoughtHeaderProps {
  author: ThoughtAuthor;
  createdAt?: string | Date;
  isPinned?: boolean;
  isFocus?: boolean;
  currentUserId?: string | null;
  canHideReply?: boolean;
  isHiddenByAuthor?: boolean;
  isBlocked?: boolean;
  postId?: string;
  thoughtText?: string;
  isFollowingAuthor?: boolean;
  onFollowToggle?: (e: React.MouseEvent) => void;
  onOpenProfile?: (username: string) => void;
  onPinToggle?: (e: React.MouseEvent) => void;
  onReportClick?: (e: React.MouseEvent) => void;
  onHideReplyToggle?: (e: React.MouseEvent) => void;
  onBlockUserToggle?: (e: React.MouseEvent) => void;
  onDeleteClick?: (e: React.MouseEvent) => void;
  onShowLessClick?: (e: React.MouseEvent) => void; // 🚫 « Voir moins de contenu comme ça »
  className?: string;
}

export function ThoughtHeader({
  author,
  createdAt,
  isPinned,
  isFocus = false,
  currentUserId,
  canHideReply,
  isHiddenByAuthor,
  isBlocked,
  postId,
  thoughtText,
  isFollowingAuthor = false,
  onFollowToggle,
  onOpenProfile,
  onPinToggle,
  onReportClick,
  onHideReplyToggle,
  onBlockUserToggle,
  onDeleteClick,
  onShowLessClick,
  className,
}: ThoughtHeaderProps) {
  const authorHandle = author.username || author.subdomain || author.id?.slice(0, 8) || 'auteur';

  return (
    <div className={cn('flex items-center justify-between font-sans select-none', className)}>
      <div className="flex items-center gap-1.5 flex-wrap min-w-0">
        <ProfileHoverCard user={author} onOpenProfile={onOpenProfile}>
          <span
            className={cn(
              'font-semibold text-foreground hover:text-brand transition-colors cursor-pointer truncate',
              isFocus ? 'text-sm sm:text-base' : 'text-xs sm:text-sm'
            )}
          >
            {author.name || t`Auteur`}
          </span>
        </ProfileHoverCard>

        {author.isCertified && <CertifiedBadge />}
        <ProfileHoverCard user={author} onOpenProfile={onOpenProfile}>
          <span className="text-xs text-muted-foreground hover:text-brand transition-colors cursor-pointer truncate">
            @{authorHandle}
          </span>
        </ProfileHoverCard>

        {!isFocus && createdAt && (
          <>
            <span className="text-xs text-muted-foreground opacity-60">·</span>
            <span className="text-xs text-muted-foreground font-normal">
              {new Date(createdAt).toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' })}
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* Contextual Follow Button */}
        {isFocus && currentUserId && currentUserId !== author.id && onFollowToggle && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onFollowToggle(e);
            }}
            className={cn(
              'px-3 py-1 text-xs font-semibold rounded-full transition-all cursor-pointer shadow-sm hover:scale-[1.02]',
              isFollowingAuthor
                ? 'bg-muted text-muted-foreground hover:bg-muted/80'
                : 'bg-brand text-brand-foreground hover:bg-brand/90'
            )}
          >
            {isFollowingAuthor ? t`Abonné` : t`Suivre`}
          </button>
        )}

        <EntityActionMenu
          surface="thought-card-menu"
          context={{
            entityType: 'thought',
            entityId: postId ?? '',
            url: postId ? getThoughtUrl(authorHandle, postId) : undefined,
            text: thoughtText,
            isPinned,
            isHiddenByAuthor,
            author: {
              id: author.id,
              username: author.username,
              subdomain: author.subdomain,
              name: author.name,
              isMuted: author.isMuted,
              isBlocked: author.isBlocked ?? isBlocked,
            },
            viewerId: currentUserId,
            capabilities: { canHideReply: Boolean(canHideReply) },
          }}
          onPinToggle={onPinToggle}
          onReportClick={onReportClick}
          onHideReplyToggle={onHideReplyToggle}
          onBlockUserToggle={onBlockUserToggle}
          onDeleteClick={onDeleteClick}
          onShowLessClick={onShowLessClick}
        />
      </div>
    </div>
  );
}
