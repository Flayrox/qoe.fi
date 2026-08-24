'use client';

import React from 'react';
import { ThoughtCard, type ThoughtCardProps } from '@qoe/ui';
import { usePostLikeMutationQueue, usePostRepostMutationQueue, unfurlUrlAction } from '@qoe/sdk';

export interface ThoughtCardContainerProps extends Omit<
  ThoughtCardProps,
  'onLikeToggle' | 'onRepostToggle'
> {
  onLikeToggleOverride?: (postId: string) => void;
  onRepostToggleOverride?: (postId: string) => void;
}

export function ThoughtCardContainer({
  post,
  onLikeToggleOverride,
  onRepostToggleOverride,
  unfurlFn,
  ...restProps
}: ThoughtCardContainerProps) {
  const [queueLikeToggle] = usePostLikeMutationQueue(post);
  const [queueRepostToggle] = usePostRepostMutationQueue(post);

  const handleLikeToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (onLikeToggleOverride) {
      onLikeToggleOverride(post.id);
      return;
    }

    queueLikeToggle();
  };

  const handleRepostToggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (onRepostToggleOverride) {
      onRepostToggleOverride(post.id);
      return;
    }

    queueRepostToggle();
  };

  const defaultUnfurlFn = React.useCallback(async (url: string) => {
    try {
      const res = await unfurlUrlAction(url);
      return res.ok ? res.data : null;
    } catch {
      return null;
    }
  }, []);

  return (
    <ThoughtCard
      post={post}
      onLikeToggle={handleLikeToggle}
      onRepostToggle={handleRepostToggle}
      unfurlFn={unfurlFn || defaultUnfurlFn}
      {...restProps}
    />
  );
}
