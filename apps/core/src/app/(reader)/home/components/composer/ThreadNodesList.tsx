'use client';

import React from 'react';
import NextImage from 'next/image';
import { Trash2, X } from 'lucide-react';
import { cn } from '@qoe/utils';
import { t } from '@lingui/core/macro';
import { Button } from '@qoe/ui/button';
import { AuthorAvatar } from '@qoe/ui/ui/AuthorAvatar';
import { QuotedArticleCard, type QuotedArticleData } from '@qoe/ui/social';
import { QuotedThoughtCard } from '@/components/social/QuotedThoughtCard';
import type { ThoughtData } from '@/components/social/ThoughtCard';
import { MentionTypeahead } from './MentionTypeahead';
import type { ComposerImage, DbUser, MentionSuggestion, ThreadNode } from './types';

interface ThreadNodesListProps {
  dbUser: DbUser | null;
  threadNodes: ThreadNode[];
  activeNodeIndex: number;
  postText: string;
  images: ComposerImage[];
  defaultPlaceholder: string;
  isSubmitting: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  mentionSuggestions: MentionSuggestion[];
  mentionSelectedIndex: number;
  quotedThought: ThoughtData | null;
  quotedArticle: QuotedArticleData | null;
  quotedExcerpt: string | null;
  onTextChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onTextareaFocus: () => void;
  onTextareaKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  onSelectMention: (item: MentionSuggestion) => void;
  onSwitchNode: (index: number) => void;
  onRemoveNode: (nodeId: string) => void;
  onClearQuotedThought: () => void;
  onClearQuotedArticle: () => void;
}

export function ThreadNodesList({
  dbUser,
  threadNodes,
  activeNodeIndex,
  postText,
  images,
  defaultPlaceholder,
  isSubmitting,
  textareaRef,
  mentionSuggestions,
  mentionSelectedIndex,
  quotedThought,
  quotedArticle,
  quotedExcerpt,
  onTextChange,
  onTextareaFocus,
  onTextareaKeyDown,
  onPaste,
  onSelectMention,
  onSwitchNode,
  onRemoveNode,
  onClearQuotedThought,
  onClearQuotedArticle,
}: ThreadNodesListProps) {
  return (
    <div className="flex flex-col gap-4">
      {threadNodes.map((node, idx) => {
        const isActive = idx === activeNodeIndex;
        const isLast = idx === threadNodes.length - 1;
        const displayText = isActive ? postText : node.text;
        const displayImages = isActive ? images : node.images;

        return (
          <div key={node.id} className="flex gap-3 items-start relative group">
            <div className="flex flex-col items-center shrink-0 w-10 relative">
              <AuthorAvatar user={dbUser} size="md" showBadge={false} />
              {!isLast && (
                <div className="absolute top-10 bottom-[-24px] left-[19px] w-[2px] bg-border/40" />
              )}
            </div>

            <div className="flex-1 min-w-0 pb-1">
              {isActive ? (
                <div className="space-y-2">
                  <textarea
                    ref={textareaRef}
                    placeholder={
                      idx === 0 ? defaultPlaceholder : t`Ajouter une autre pensée à ce fil...`
                    }
                    value={displayText}
                    onChange={onTextChange}
                    onFocus={onTextareaFocus}
                    onKeyDown={onTextareaKeyDown}
                    onPaste={onPaste}
                    disabled={isSubmitting}
                    className={cn(
                      'w-full font-sans text-sm focus:outline-none resize-none transition-all duration-200',
                      'placeholder:text-muted-foreground/60 text-foreground font-normal p-0',
                      'bg-transparent border-0 focus:ring-0 leading-relaxed min-h-[44px]'
                    )}
                    style={{ height: 'auto' }}
                  />

                  <MentionTypeahead
                    suggestions={mentionSuggestions}
                    selectedIndex={mentionSelectedIndex}
                    onSelect={onSelectMention}
                  />
                </div>
              ) : (
                <div
                  onClick={() => onSwitchNode(idx)}
                  className="cursor-pointer py-1.5 min-h-[44px] text-foreground/85 hover:text-foreground transition-all text-sm font-sans"
                >
                  <p className="whitespace-pre-wrap leading-relaxed">
                    {displayText || (
                      <span className="text-muted-foreground/35 italic">
                        Ajouter un post au fil...
                      </span>
                    )}
                  </p>

                  {displayImages.length > 0 && (
                    <div
                      className={cn(
                        'grid gap-1.5 mt-2 max-w-md pointer-events-none opacity-80',
                        displayImages.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
                      )}
                    >
                      {displayImages.map((img) => (
                        <div
                          key={img.id}
                          className="relative aspect-video bg-muted/20 border border-border/20 overflow-hidden rounded-xl"
                        >
                          <NextImage
                            src={img.url}
                            fill
                            className="object-cover"
                            alt=""
                            sizes="(max-width: 768px) 100vw, 640px"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {idx === 0 && quotedThought && (
                <div className="relative my-2">
                  <Button
                    variant="ghost"
                    onClick={onClearQuotedThought}
                    className="absolute top-2 right-2 z-20 p-1.5 rounded-full bg-foreground/80 text-background hover:bg-foreground transition-colors cursor-pointer h-[auto]"
                    title="Retirer la citation"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                  <QuotedThoughtCard post={quotedThought} />
                </div>
              )}

              {idx === 0 && quotedArticle && (
                <div className="relative my-2">
                  <Button
                    variant="ghost"
                    onClick={onClearQuotedArticle}
                    className="absolute top-2 right-2 z-20 p-1.5 rounded-full bg-foreground/80 text-background hover:bg-foreground transition-colors cursor-pointer shadow-md h-[auto]"
                    title="Retirer la citation"
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                  <QuotedArticleCard
                    article={quotedArticle}
                    quotedExcerpt={quotedExcerpt || undefined}
                  />
                </div>
              )}
            </div>

            {threadNodes.length > 1 && (
              <Button
                variant="ghost"
                onClick={() => onRemoveNode(node.id)}
                className="p-1.5 rounded-full text-muted-foreground/50 hover:text-destructive-text hover:bg-destructive/10 cursor-pointer shrink-0 self-start mt-0.5 transition-all outline-none h-[auto] [&_svg]:size-4"
                title={t`Supprimer cette pensée du fil`}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
