'use client';

import React from 'react';
import { t } from '@lingui/core/macro';
import { Dialog, DialogContent } from '@qoe/ui';
import { ThoughtComposer, type ComposedPost, type DbUser } from './ThoughtComposer';
import type { ThoughtData } from '@/components/social/ThoughtCard';
import { X } from 'lucide-react';

export interface ThoughtReplyModalProps {
  isOpen: boolean;
  onClose: () => void;
  parentThought: ThoughtData | null;
  dbUser: DbUser | null;
  tagsList?: string[];
  onReplyCreated?: (replyPost: ComposedPost) => void;
  onLoginRequired?: () => void;
}

export function ThoughtReplyModal({
  isOpen,
  onClose,
  parentThought,
  dbUser,
  tagsList = [],
  onReplyCreated,
  onLoginRequired,
}: ThoughtReplyModalProps) {
  if (!parentThought) return null;

  const parentAuthor = parentThought.author;
  const parentHandle =
    parentAuthor?.username || parentAuthor?.subdomain || parentAuthor?.id?.slice(0, 8) || 'auteur';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="max-w-xl p-5 bg-card border border-border/60 text-card-foreground rounded-2xl shadow-2xl overflow-y-auto max-h-[90vh] font-sans"
      >
        {/* Modal Top Navigation Header Bar */}
        <div className="flex items-center justify-between pb-3 mb-2 border-b border-border/30">
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer outline-none"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
          <span className="text-xs font-semibold text-muted-foreground">
            En réponse à <span className="text-foreground font-bold">@{parentHandle}</span>
          </span>
          <div className="w-6" /> {/* Balance spacer */}
        </div>

        {/* Core Composition Workhorse (Self-contains ComposerReplyTo header & input) */}
        <div className="pt-1">
          <ThoughtComposer
            dbUser={dbUser}
            tagsList={tagsList}
            replyToThought={parentThought}
            parentId={parentThought.id}
            placeholder={t`Poster votre réponse...`}
            onPostCreated={(post) => {
              if (onReplyCreated) onReplyCreated(post);
              onClose();
            }}
            onLoginRequired={() => {
              onClose();
              if (onLoginRequired) onLoginRequired();
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
