'use client';

import React from 'react';
import { X } from 'lucide-react';
import { t } from '@lingui/core/macro';
import { ProfileHoverCard } from '@qoe/ui';
import { AuthorAvatar } from '@qoe/ui/ui/AuthorAvatar';
import { CertifiedBadge } from '@qoe/ui/ui/CertifiedBadge';
import type { ThoughtData } from '@/components/social/ThoughtCard';

interface ReplyContextHeaderProps {
  replyToThought: ThoughtData;
  onCancel: () => void;
}

export function ReplyContextHeader({ replyToThought, onCancel }: ReplyContextHeaderProps) {
  return (
    <div className="flex flex-col gap-0 mb-2 font-sans">
      <div className="flex items-start gap-3 relative">
        <div className="flex flex-col items-center shrink-0">
          <AuthorAvatar user={replyToThought.author} size="sm" showBadge={false} />
          <div className="w-[2px] bg-border/50 flex-1 my-1 rounded-full min-h-[28px]" />
        </div>

        <div className="flex-1 min-w-0 pb-2 space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs flex-wrap">
              <ProfileHoverCard user={replyToThought.author}>
                <span className="font-bold text-foreground hover:text-brand transition-colors cursor-pointer">
                  {replyToThought.author?.name || 'Auteur'}
                </span>
              </ProfileHoverCard>
              {replyToThought.author?.isCertified && <CertifiedBadge />}
              <ProfileHoverCard user={replyToThought.author}>
                <span className="text-muted-foreground text-[11px] hover:text-brand transition-colors cursor-pointer">
                  @
                  {replyToThought.author?.username ||
                    replyToThought.author?.subdomain ||
                    'utilisateur'}
                </span>
              </ProfileHoverCard>
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="p-1 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title={t`Annuler la réponse`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-xs text-foreground/90 leading-relaxed font-sans line-clamp-3">
            {replyToThought.content}
          </p>

          <div className="text-[11px] text-muted-foreground pt-1">
            En réponse à{' '}
            <span className="text-brand font-medium">
              {[
                replyToThought.author?.username || replyToThought.author?.subdomain || 'auteur',
                replyToThought.parent?.author?.username || replyToThought.parent?.author?.subdomain,
              ]
                .filter(Boolean)
                .filter((val, idx, arr) => arr.indexOf(val) === idx)
                .map((handle) => `@${handle}`)
                .join(', ')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
