'use client';

import React from 'react';
import { t } from '@lingui/core/macro';
import { ThoughtThreadRoot, type ThoughtThreadRootProps } from './ThoughtThreadRoot';
import { ThoughtThreadParentContext } from './ThoughtThreadParentContext';
import { ThoughtThreadFocus } from './ThoughtThreadFocus';
import { ThoughtThreadComposer, type ThoughtThreadComposerProps } from './ThoughtThreadComposer';
import { ThoughtThreadList, type ThoughtThreadListProps } from './ThoughtThreadList';
import { ThoughtThreadItem, type ThoughtThreadItemProps } from './ThoughtThreadItem';
import { ThoughtThreadTombstone, type ThoughtThreadTombstoneProps } from './ThoughtThreadTombstone';
import { ThoughtThreadLightbox } from './ThoughtThreadLightbox';
import { useThoughtThreadContext, type OptimisticThought } from './ThoughtThreadContext';
import type { DbUser } from '../ThoughtComposer';

export const ThoughtThread = {
  Root: ThoughtThreadRoot,
  ParentContext: ThoughtThreadParentContext,
  Focus: ThoughtThreadFocus,
  Composer: ThoughtThreadComposer,
  List: ThoughtThreadList,
  Item: ThoughtThreadItem,
  Tombstone: ThoughtThreadTombstone,
  Lightbox: ThoughtThreadLightbox,
};

export type {
  ThoughtThreadRootProps,
  ThoughtThreadComposerProps,
  ThoughtThreadListProps,
  ThoughtThreadItemProps,
  ThoughtThreadTombstoneProps,
  OptimisticThought,
};

export { useThoughtThreadContext };

/**
 * 🏛️ Backward-Compatible Wrapper for ThoughtThreadView
 */
export function ThoughtThreadView({
  postId,
  currentUserId,
  dbUser,
  initialPost = null,
  standalone = false,
  onClose,
  onOpenProfile,
  onOpenArticle,
  onInteractionUpdate,
  onLoginRequired,
}: {
  postId: string;
  currentUserId: string | null;
  dbUser?: DbUser | null;
  initialPost?: OptimisticThought | null;
  standalone?: boolean;
  onClose?: () => void;
  onOpenProfile?: (username: string) => void;
  onOpenArticle?: (article: { id: string; slug: string; title: string }) => void;
  onInteractionUpdate?: (
    postId: string,
    update: { liked?: boolean; likesCount?: number; repliesCount?: number }
  ) => void;
  onLoginRequired?: () => void;
}) {
  return (
    <ThoughtThread.Root
      postId={postId}
      currentUserId={currentUserId}
      dbUser={dbUser}
      initialPost={initialPost}
      standalone={standalone}
      onClose={onClose}
      onOpenProfile={onOpenProfile}
      onOpenArticle={onOpenArticle}
      onInteractionUpdate={onInteractionUpdate}
      onLoginRequired={onLoginRequired}
    >
      <div className="relative font-sans">
        <ThoughtThread.ParentContext />
        <ThoughtThread.Focus />
        <div className="mt-4 space-y-4">
          <ThoughtThread.Composer placeholder={t`Exprimer une réponse...`} />
          <ThoughtThread.List />
        </div>
        <ThoughtThread.Lightbox />
      </div>
    </ThoughtThread.Root>
  );
}
