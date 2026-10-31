'use client';

import type { FormEvent } from 'react';
import { Loader2, Send } from 'lucide-react';

import { SafeAvatar } from '../../SafeAvatar';
import { ProfileHoverCard } from '../../social/ProfileHoverCard';
import { Button } from '../../primitives/button/button';
import { Input } from '../../primitives/input/input';
import type { CommentItem } from '../types';
import { t } from '@lingui/core/macro';

/**
 * Le fil de discussion : un en-tête, une réponse, puis les messages.
 *
 * Pas de cartes empilées ni de composer en pilule : le fil se lit comme
 * une conversation, séparé de la note par un simple filet.
 */
export function AnnotationDrawerDiscussion({
  comments,
  draft,
  submitting,
  onDraftChange,
  onSubmit,
  onOpenProfile,
}: {
  comments: CommentItem[];
  draft: string;
  submitting: boolean;
  onDraftChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  onOpenProfile?: (handle: string) => void;
}) {
  return (
    <section data-annotation-discussion className="border-t border-border/40 pt-4">
      <h3 className="flex items-center gap-1.5 type-control-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t`Discussion`}
        <span className="tabular-nums">({comments.length})</span>
      </h3>

      <form onSubmit={onSubmit} className="mt-3 flex items-center gap-2">
        <Input
          type="text"
          size="sm"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          placeholder={t`Réagir à cette annotation...`}
          aria-label={t`Votre réponse`}
          className="min-w-0 flex-1"
        />
        <Button
          type="submit"
          size="xs"
          shape="icon"
          variant="solid"
          tone="brand"
          disabled={submitting || !draft.trim()}
          aria-busy={submitting}
          aria-label={t`Envoyer la réponse`}
        >
          {submitting ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
        </Button>
      </form>

      {comments.length > 0 && (
        <ol className="mt-4 space-y-4">
          {comments.map((comment) => {
            const author = {
              id: comment.author?.id,
              name: comment.author?.name || comment.author?.username || t`Lecteur`,
              username: comment.author?.username,
              logoUrl: comment.author?.logoUrl,
              type: comment.author?.type,
            };
            return (
              <li key={comment.id} className="flex items-start gap-2.5">
                <ProfileHoverCard
                  user={author}
                  username={author.username ?? undefined}
                  onOpenProfile={onOpenProfile}
                  className="mt-0.5 shrink-0"
                >
                  <SafeAvatar
                    id={author.id}
                    src={author.logoUrl}
                    name={author.name}
                    username={author.username}
                    type={author.type}
                    size={24}
                    className="border border-border/40"
                  />
                </ProfileHoverCard>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
                    <ProfileHoverCard
                      user={author}
                      username={author.username ?? undefined}
                      onOpenProfile={onOpenProfile}
                      className="type-control-md font-semibold text-foreground"
                    >
                      <span>{author.name}</span>
                    </ProfileHoverCard>
                    <span className="type-control-xs text-muted-foreground">
                      {new Date(comment.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm leading-6 text-foreground">{comment.content}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
