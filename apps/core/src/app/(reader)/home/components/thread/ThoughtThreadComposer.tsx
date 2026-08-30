'use client';

import React from 'react';
import { t } from '@lingui/core/macro';
import { Lock } from 'lucide-react';
import { ThoughtComposer, type ComposedPost } from '../ThoughtComposer';
import { useThoughtThreadContext, type OptimisticThought } from './ThoughtThreadContext';

export interface ThoughtThreadComposerProps {
  placeholder?: string;
  parentId?: string;
}

export function ThoughtThreadComposer({
  placeholder = t`Exprimer votre réponse...`,
  parentId,
}: ThoughtThreadComposerProps) {
  const {
    post,
    currentUserId,
    dbUser: contextDbUser,
    insertReply,
    onLoginRequired,
  } = useThoughtThreadContext();

  const targetParentId = parentId || post?.id;

  if (!targetParentId) return null;

  const dbUser = contextDbUser || (currentUserId ? { id: currentUserId } : null);

  const isAuthor = Boolean(currentUserId && post?.author && post.author.id === currentUserId);
  const restriction = post?.replyRestriction || 'everyone';

  const handlePostCreated = (newPost: ComposedPost) => {
    if (newPost && newPost.id) {
      insertReply(targetParentId, {
        ...(newPost as unknown as OptimisticThought),
        isOptimistic: false,
        replies: [],
      });
    }
  };

  const authorHandle = post?.author?.username || post?.author?.subdomain || "l'auteur";

  // Check threadgate restrictions if not the author
  if (!isAuthor && restriction !== 'everyone') {
    let restrictionText = t`Les réponses à cette pensée sont limitées par l'auteur.`;
    if (restriction === 'subscribers') {
      restrictionText = `Seuls les abonnés à @${authorHandle} peuvent répondre.`;
    } else if (restriction === 'following') {
      restrictionText = `Seules les personnes suivies par @${authorHandle} peuvent répondre.`;
    } else if (restriction === 'mentioned') {
      restrictionText = `Seules les personnes mentionnées peuvent répondre à ce message.`;
    }

    return (
      <div className="p-3.5 my-2 rounded-2xl border border-border/40 bg-muted/20 text-xs text-muted-foreground flex items-center gap-2.5 font-sans select-none">
        <Lock className="w-4 h-4 text-brand shrink-0" />
        <span>{restrictionText}</span>
      </div>
    );
  }

  return (
    <div className="pt-2 font-sans">
      <ThoughtComposer
        dbUser={dbUser}
        tagsList={[]}
        parentId={targetParentId}
        placeholder={placeholder}
        onPostCreated={handlePostCreated}
        onLoginRequired={onLoginRequired}
      />
    </div>
  );
}
