'use client';

import React from 'react';
import { MessageSquare } from 'lucide-react';
import { ThoughtCard } from '@/components/social/ThoughtCard';
import type { FeedSlice } from '@qoe/db/repositories/posts';

export interface ThoughtFeedSliceProps {
  slice: FeedSlice;
  currentUserId?: string | null;
  onOpenPost?: (postId: string) => void;
  onOpenProfile?: (userId: string) => void;
  onOpenArticle?: (article: { id: string; slug: string; title: string }) => void;
  onOpenMedia?: (url: string) => void;
  onLikeToggle?: (postId: string) => void;
  onRepostToggle?: (postId: string) => void;
  onPinToggle?: (e: React.MouseEvent) => void;
  onDeletePost?: (postId: string) => Promise<boolean> | void;
}

export function ThoughtFeedSlice({
  slice,
  currentUserId,
  onOpenPost,
  onOpenProfile,
  onOpenArticle,
  onOpenMedia,
  onLikeToggle,
  onRepostToggle,
  onPinToggle,
  onDeletePost,
}: ThoughtFeedSliceProps) {
  const { rootPost, parentPost, targetPost, isIncompleteThread, hiddenIntermediateCount } = slice;

  const handleOpenRootThread = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const targetId = rootPost?.id || parentPost?.id || targetPost.id;
    if (onOpenPost) {
      onOpenPost(targetId);
    }
  };

  // Case 1: Standalone post (no parent or root)
  if (!parentPost && !rootPost) {
    return (
      <ThoughtCard
        post={targetPost}
        variant="timeline"
        currentUserId={currentUserId}
        onOpenPost={onOpenPost}
        onOpenProfile={onOpenProfile}
        onOpenArticle={onOpenArticle}
        onOpenMedia={onOpenMedia}
        onLikeToggle={onLikeToggle}
        onRepostToggle={onRepostToggle}
        onPinToggle={onPinToggle}
        onDeletePost={onDeletePost}
      />
    );
  }

  // Case 2: Multi-post Feed Slice (Root -> [Dotted Divider] -> Parent -> Target)
  return (
    <div className="border-b border-border/40 font-sans">
      {/* 1. Root Post (if distinct from parent) */}
      {rootPost && (
        <ThoughtCard
          post={rootPost}
          variant="timeline"
          isThreadParent={true}
          currentUserId={currentUserId}
          onOpenPost={onOpenPost}
          onOpenProfile={onOpenProfile}
          onOpenArticle={onOpenArticle}
          onOpenMedia={onOpenMedia}
          onLikeToggle={onLikeToggle}
          onRepostToggle={onRepostToggle}
          onPinToggle={onPinToggle}
          onDeletePost={onDeletePost}
          className="border-none"
        />
      )}

      {/* 2. Dotted Thread Divider for Incomplete Threads */}
      {isIncompleteThread && (
        <div
          onClick={handleOpenRootThread}
          className="flex items-center gap-3 px-3.5 sm:px-4 py-1 hover:bg-muted/30 cursor-pointer transition-colors"
        >
          <div className="flex flex-col items-center shrink-0 w-10">
            <div className="w-[2px] border-l-2 border-dashed border-border/80 h-7" />
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline py-1">
            <MessageSquare className="w-3.5 h-3.5" />
            <span>
              Afficher la suite du fil ({hiddenIntermediateCount || 1} message
              {hiddenIntermediateCount && hiddenIntermediateCount > 1 ? 's' : ''} de plus)
            </span>
          </div>
        </div>
      )}

      {/* 3. Immediate Parent Post */}
      {parentPost && (
        <ThoughtCard
          post={parentPost}
          variant="timeline"
          isThreadChild={Boolean(rootPost)}
          isThreadParent={true}
          currentUserId={currentUserId}
          onOpenPost={onOpenPost}
          onOpenProfile={onOpenProfile}
          onOpenArticle={onOpenArticle}
          onOpenMedia={onOpenMedia}
          onLikeToggle={onLikeToggle}
          onRepostToggle={onRepostToggle}
          onPinToggle={onPinToggle}
          onDeletePost={onDeletePost}
          className="border-none"
        />
      )}

      {/* 4. Target Post (Reply) */}
      <ThoughtCard
        post={targetPost}
        variant="timeline"
        isThreadChild={Boolean(parentPost || rootPost)}
        isThreadLastChild={true}
        currentUserId={currentUserId}
        onOpenPost={onOpenPost}
        onOpenProfile={onOpenProfile}
        onOpenArticle={onOpenArticle}
        onOpenMedia={onOpenMedia}
        onLikeToggle={onLikeToggle}
        onRepostToggle={onRepostToggle}
        onPinToggle={onPinToggle}
        onDeletePost={onDeletePost}
        className="border-none"
      />
    </div>
  );
}
