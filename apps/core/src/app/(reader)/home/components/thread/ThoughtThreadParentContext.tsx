'use client';

import React from 'react';
import { useThoughtThreadContext, type OptimisticThought } from './ThoughtThreadContext';
import { ThoughtCard } from '@/components/social/ThoughtCard';
import { HiddenParentNotice } from '@qoe/ui/social';

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

  if (!post) return null;
  // Le placeholder prime sur un éventuel parent résiduel : un parent marqué
  // indisponible ne doit jamais être rendu, même si le payload en contient un.
  if (post.parentUnavailable) {
    return (
      <div className="px-3.5 sm:px-4 pt-3">
        <HiddenParentNotice reason={post.parentUnavailableReason} />
      </div>
    );
  }
  if (!post.parent) return null;

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
        <React.Fragment key={parent.id}>
          {parent.parentUnavailable && (
            <div className="px-3.5 sm:px-4 pt-2">
              <HiddenParentNotice reason={parent.parentUnavailableReason} />
            </div>
          )}
          <ThoughtCard
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
        </React.Fragment>
      ))}
    </div>
  );
}
