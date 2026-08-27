'use client';

import React, { useState } from 'react';
import { EyeOff, CornerDownRight } from 'lucide-react';
import { toggleHideReplyAction, toggleBlockUserAction } from '@qoe/sdk/actions/feed';
import { toast } from '@qoe/ui/toast';
import { ThoughtThreadTombstone } from './ThoughtThreadTombstone';
import { useThoughtThreadContext, type OptimisticThought } from './ThoughtThreadContext';
import { ThoughtCard } from '@/components/social/ThoughtCard';
import { t } from '@lingui/core/macro';

export interface ThoughtThreadItemProps {
  reply: OptimisticThought;
  depth?: number;
}

export function ThoughtThreadItem({ reply, depth = 0 }: ThoughtThreadItemProps) {
  const {
    currentUserId,
    toggleLike,
    repostThought,
    deleteThought,
    setLightboxImage,
    onOpenPost,
    onOpenProfile,
    onOpenArticle,
  } = useThoughtThreadContext();

  const [showHidden, setShowHidden] = useState<boolean>(false);
  const [isHidden, setIsHidden] = useState<boolean>(Boolean(reply.isHiddenByAuthor));
  const [showAllChildren, setShowAllChildren] = useState<boolean>(false);

  if (reply.isDeleted) {
    return (
      <div className="space-y-1 font-sans">
        <ThoughtThreadTombstone />
        {reply.replies && reply.replies.length > 0 && (
          <div className="space-y-1 mt-1">
            {reply.replies.map((child) => (
              <ThoughtThreadItem key={child.id} reply={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const handleHideReplyToggle = async () => {
    const res = await toggleHideReplyAction(reply.id);
    if (res.ok && res.data) {
      setIsHidden(res.data.isHiddenByAuthor);
      toast.success(res.data.isHiddenByAuthor ? 'Réponse masquée.' : 'Réponse affichée.');
    } else {
      toast.error('Impossible de modifier le masquage de la réponse.');
    }
  };

  const handleBlockUserToggle = async () => {
    if (!reply.author?.id) return;
    const res = await toggleBlockUserAction(reply.author.id);
    if (res.ok && res.data) {
      toast.success(res.data.blocked ? 'Utilisateur bloqué.' : 'Utilisateur débloqué.');
    } else {
      toast.error('Erreur lors du blocage.');
    }
  };

  if (isHidden && !showHidden) {
    return (
      <div className="py-2.5 px-3.5 rounded-2xl border border-dashed border-border/40 bg-muted/20 text-xs text-muted-foreground flex items-center justify-between font-sans my-1">
        <span className="flex items-center gap-2">
          <EyeOff className="w-3.5 h-3.5 text-muted-foreground/70" />
          <span>{t`Réponse masquée par l'auteur de la pensée`}</span>
        </span>
        <button
          onClick={() => setShowHidden(true)}
          className="text-brand font-medium hover:underline cursor-pointer"
        >
          Afficher
        </button>
      </div>
    );
  }

  const INITIAL_VISIBLE_CHILDREN = 3;
  const hasChildren = Boolean(reply.replies && reply.replies.length > 0);
  const childList = reply.replies || [];
  const visibleChildren = showAllChildren
    ? childList
    : childList.slice(0, INITIAL_VISIBLE_CHILDREN);
  const remainingChildren = childList.length - INITIAL_VISIBLE_CHILDREN;

  return (
    <div className="font-sans">
      <ThoughtCard
        post={{ ...reply, isHiddenByAuthor: isHidden }}
        variant="reply"
        depth={depth}
        isThreadParent={hasChildren}
        isThreadChild={depth > 0}
        currentUserId={currentUserId}
        onOpenPost={onOpenPost}
        onOpenProfile={onOpenProfile}
        onOpenArticle={onOpenArticle}
        onOpenMedia={(url) => setLightboxImage(url)}
        onLikeToggle={() => toggleLike(reply.id)}
        onRepostToggle={() => repostThought(reply.id)}
        onHideReplyToggle={handleHideReplyToggle}
        onBlockUserToggle={handleBlockUserToggle}
        onDeletePost={async () => deleteThought(reply.id)}
        className={hasChildren ? 'border-none pb-1' : ''}
      />

      {hasChildren && (
        <div>
          {visibleChildren.map((child) => (
            <ThoughtThreadItem key={child.id} reply={child} depth={depth + 1} />
          ))}

          {!showAllChildren && remainingChildren > 0 && (
            <div className="pl-6 py-1">
              <button
                type="button"
                onClick={() => setShowAllChildren(true)}
                className="text-[11px] font-medium text-brand hover:underline flex items-center gap-1.5 cursor-pointer py-1"
              >
                <CornerDownRight className="w-3 h-3" />
                <span>
                  Afficher {remainingChildren} autre{remainingChildren > 1 ? 's' : ''} sous-réponse
                  {remainingChildren > 1 ? 's' : ''}
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
