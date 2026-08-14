'use client';

import React from 'react';
import { usePostShadow } from '@qoe/api-client';
import { ThoughtCardContainer, type ThoughtCardContainerProps } from './ThoughtCardContainer';
import { ConfirmDeleteModal } from '@qoe/ui';
import { ModerationReportModal } from './ModerationReportModal';
import { routes } from '@qoe/config/routes';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import {
  pinPostAction as pinPost,
  unpinPostAction as unpinPost,
} from '@qoe/api-client/actions/feed';
import { PollCard } from './PollCard';
import { ThreadgateBadge, type ReplyRestrictionType } from './ThreadgateBadge';
import { HiddenReplyCard } from './HiddenReplyCard';

export type { ThoughtData, ThoughtVariant } from '@qoe/ui';

export interface FeedThoughtCardProps extends Omit<
  ThoughtCardContainerProps,
  'likeMutationFn' | 'repostMutationFn'
> {
  onOpenProfile?: (username: string) => void;
  onOpenPost?: (postId: string, authorUsername?: string) => void;
  onLikeToggle?: (postId: string) => void;
  onRepostToggle?: (postId: string) => void;
  onDeletePost?: (postId: string) => Promise<boolean> | void;
}

export function ThoughtCard({
  post,
  variant = 'timeline',
  depth = 0,
  currentUserId: propUserId,
  onOpenProfile,
  onOpenPost,
  onLikeToggle,
  onRepostToggle,
  onDeletePost,
  className,
  ...restProps
}: FeedThoughtCardProps) {
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(propUserId || null);
  const [showReportModal, setShowReportModal] = React.useState<boolean>(false);
  const [confirmDeletePostId, setConfirmDeletePostId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (propUserId) return;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setCurrentUserId(data.user.id);
      }
    });
  }, [propUserId]);

  const shadowedPost = usePostShadow(post);

  // 🪦 Tombe façon Bluesky : dès que le shadow marque la pensée comme supprimée,
  // la carte disparaît (null) sans aucune chirurgie de liste manuelle.
  if (shadowedPost.isDeleted) {
    return null;
  }

  const authorHandle =
    post.author?.username || post.author?.subdomain || post.author?.id?.slice(0, 8) || 'auteur';

  const handleOpenProfile = (username: string) => {
    if (onOpenProfile) {
      onOpenProfile(username);
    } else {
      window.location.href = routes.feed.profile(username);
    }
  };

  const handleOpenPost = (postId: string, author?: string) => {
    if (variant === 'focus') return;
    if (onOpenPost) {
      onOpenPost(postId, author || authorHandle);
    }
  };

  const handlePinToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (post.isPinned) {
        const res = await unpinPost(post.id);
        if (res.ok) toast.success('Pensée désépinglée du profil.');
      } else {
        const res = await pinPost(post.id);
        if (res.ok) toast.success('Pensée épinglée sur le profil.');
      }
    } catch {
      toast.error("Erreur lors de la modification de l'état épinglé.");
    }
  };

  const handleLikeToggleOverride = onLikeToggle ? (id: string) => onLikeToggle(id) : undefined;
  const handleRepostToggleOverride = onRepostToggle
    ? (id: string) => onRepostToggle(id)
    : undefined;

  const handleReplyClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (restProps.onReplyClick) {
      restProps.onReplyClick(e);
    } else if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('open-composer', { detail: { replyToThought: post } }));
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setConfirmDeletePostId(shadowedPost.id);
  };

  const pollSlot = shadowedPost.poll ? <PollCard poll={shadowedPost.poll} /> : null;
  const threadgateBadge =
    shadowedPost.replyRestriction && shadowedPost.replyRestriction !== 'everyone' ? (
      <ThreadgateBadge restriction={shadowedPost.replyRestriction as ReplyRestrictionType} />
    ) : null;

  const isHidden = shadowedPost.isHiddenByAuthor === true;
  const isParentAuthor = currentUserId === shadowedPost.parent?.author.id;

  const cardElement = (
    <ThoughtCardContainer
      post={shadowedPost}
      variant={variant}
      depth={depth}
      currentUserId={currentUserId}
      pollSlot={pollSlot}
      threadgateBadge={threadgateBadge}
      onOpenProfile={handleOpenProfile}
      onOpenPost={handleOpenPost}
      onReplyClick={handleReplyClick}
      onPinToggle={handlePinToggle}
      onReportClick={() => setShowReportModal(true)}
      onDeleteClick={onDeletePost ? handleDeleteClick : undefined}
      onLikeToggleOverride={handleLikeToggleOverride}
      onRepostToggleOverride={handleRepostToggleOverride}
      className={className}
      {...restProps}
    />
  );

  return (
    <>
      {isHidden ? (
        <HiddenReplyCard
          replyId={shadowedPost.id}
          isHiddenByAuthor={true}
          isParentAuthor={isParentAuthor}
        >
          {cardElement}
        </HiddenReplyCard>
      ) : (
        cardElement
      )}

      <ModerationReportModal
        isOpen={showReportModal}
        onClose={() => setShowReportModal(false)}
        targetId={shadowedPost.id}
        targetType="thought"
      />

      <ConfirmDeleteModal
        isOpen={confirmDeletePostId === shadowedPost.id}
        onClose={() => setConfirmDeletePostId(null)}
        onConfirm={() => {
          if (confirmDeletePostId) return onDeletePost?.(confirmDeletePostId);
        }}
      />
    </>
  );
}
