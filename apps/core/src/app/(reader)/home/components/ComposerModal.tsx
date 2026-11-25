'use client';

import React from 'react';
import { X } from 'lucide-react';
import { Dialog, DialogContent } from '@qoe/ui';
import { ThoughtComposer, type ComposedPost } from './ThoughtComposer';
import { ThoughtReplyModal } from './ThoughtReplyModal';
import type { ThoughtData } from '@/components/social/ThoughtCard';
import type { QuotedArticleData } from '@qoe/ui/social';
import type { DbUser } from './ThoughtComposer';
import { Button } from '@qoe/ui/button';

interface ComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  dbUser: DbUser | null;
  tagsList?: string[];
  quotedThought?: ThoughtData | null;
  replyToThought?: ThoughtData | null;
  quotedArticle?: QuotedArticleData | null;
  quotedExcerpt?: string | null;
  initialText?: string;
  initialMode?: 'thought' | 'article';
  onPostCreated?: (post: ComposedPost) => void;
  onLoginRequired?: () => void;
}

export function ComposerModal({
  isOpen,
  onClose,
  dbUser,
  tagsList = [],
  quotedThought = null,
  replyToThought = null,
  quotedArticle = null,
  quotedExcerpt = null,
  initialText = '',
  onPostCreated,
  onLoginRequired,
}: ComposerModalProps) {
  // If replying to a specific thought, render dedicated Twitter/Bluesky-style ThoughtReplyModal
  if (replyToThought) {
    return (
      <ThoughtReplyModal
        isOpen={isOpen}
        onClose={onClose}
        parentThought={replyToThought}
        dbUser={dbUser}
        tagsList={tagsList}
        onReplyCreated={onPostCreated}
        onLoginRequired={onLoginRequired}
      />
    );
  }

  // Regular New Post Modal (Centered Dialog on Desktop, Bottom Sheet on Mobile)
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-xl p-5 bg-card border border-border/60 text-card-foreground rounded-2xl shadow-2xl font-sans"
      >
        {/* Modal Header Bar */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-border/40">
          <span className="text-sm font-semibold tracking-tight text-foreground">
            Nouvelle pensée
          </span>

          <Button
            variant="ghost"
            shape="icon"
            onClick={onClose}
            className="rounded-xl p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground h-auto! [font-size:inherit]! leading-[inherit]! [font-weight:inherit]! whitespace-normal! justify-normal inline-block "
            aria-label="Fermer"
          >
            <X className="w-4! h-4!" />
          </Button>
        </div>

        {/* Unified Core Composer */}
        <ThoughtComposer
          dbUser={dbUser}
          tagsList={tagsList}
          quotedThought={quotedThought}
          quotedArticle={quotedArticle}
          quotedExcerpt={quotedExcerpt}
          initialText={initialText}
          onPostCreated={(post) => {
            if (onPostCreated) onPostCreated(post);
            onClose();
          }}
          onLoginRequired={() => {
            onClose();
            if (onLoginRequired) onLoginRequired();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
