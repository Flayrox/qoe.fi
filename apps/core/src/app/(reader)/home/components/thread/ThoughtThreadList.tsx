'use client';

import React, { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { ThoughtThreadItem } from './ThoughtThreadItem';
import { ThoughtThreadTombstone } from './ThoughtThreadTombstone';
import { useThoughtThreadContext, type OptimisticThought } from './ThoughtThreadContext';

export interface ThoughtThreadListProps {
  children?: (item: OptimisticThought) => React.ReactNode;
}

export function ThoughtThreadList({ children }: ThoughtThreadListProps) {
  const { post, loading } = useThoughtThreadContext();
  const [showAllReplies, setShowAllReplies] = useState<boolean>(false);

  if (loading) {
    return (
      <div className="py-6 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 animate-pulse">
            <div className="w-8 h-8 rounded-md bg-muted shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-3 bg-muted rounded w-1/4" />
              <div className="h-3 bg-muted rounded w-3/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!post || !post.replies || post.replies.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-muted-foreground font-sans">
        Soyez le premier à exprimer une réponse.
      </div>
    );
  }

  const INITIAL_VISIBLE_COUNT = 5;
  const visibleReplies = showAllReplies
    ? post.replies
    : post.replies.slice(0, INITIAL_VISIBLE_COUNT);
  const remainingCount = post.replies.length - INITIAL_VISIBLE_COUNT;

  return (
    <div className="divide-y divide-border/20 pt-2 font-sans">
      {visibleReplies.map((reply) => {
        if (children) return children(reply);

        if (reply.isDeleted) {
          return <ThoughtThreadTombstone key={reply.id} />;
        }

        return <ThoughtThreadItem key={reply.id} reply={reply} />;
      })}

      {!showAllReplies && remainingCount > 0 && (
        <div className="py-3 px-1">
          <button
            type="button"
            onClick={() => setShowAllReplies(true)}
            className="w-full py-2 px-3 rounded-xl border border-border/40 bg-card/60 hover:bg-muted/40 text-xs font-semibold text-brand transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>
              Afficher {remainingCount} autre{remainingCount > 1 ? 's' : ''} réponse
              {remainingCount > 1 ? 's' : ''}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
