'use client';

import React from 'react';
import { useThoughtThreadContext, type OptimisticThought } from './ThoughtThreadContext';
import { ThoughtCard } from '@/components/social/ThoughtCard';

export function ThoughtThreadParentContext() {
  const {
    post,
    onOpenPost,
    onOpenProfile,
    onOpenArticle,
    setLightboxImage,
    currentUserId,
    toggleLike,
    repostThought,
  } = useThoughtThreadContext();

  if (!post || !post.parent) return null;

  // Collect all ancestors up to top parent (root -> ... -> immediate parent)
  const ancestors: OptimisticThought[] = [];
  let current: OptimisticThought | null | undefined = post.parent;
  while (current) {
    ancestors.unshift(current);
    current = current.parent;
  }

  return (
    <div className="flex flex-col font-sans">
      {ancestors.map((parent, idx) => (
        <ThoughtCard
          key={parent.id}
          post={parent}
          variant="parent"
          isThreadChild={idx > 0}
          isThreadParent={true}
          currentUserId={currentUserId}
          onOpenPost={onOpenPost}
          onOpenProfile={onOpenProfile}
          onOpenArticle={onOpenArticle}
          onOpenMedia={(url) => setLightboxImage(url)}
          onLikeToggle={() => toggleLike(parent.id)}
          onRepostToggle={() => repostThought(parent.id)}
        />
      ))}
    </div>
  );
}
