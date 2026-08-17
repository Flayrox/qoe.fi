'use client';

import React from 'react';
import { ProfileHoverCard } from './ProfileHoverCard';
import { cn } from '@qoe/utils';
import { Pin, CornerDownRight, Repeat } from 'lucide-react';
import { AuthorAvatar } from '../ui/AuthorAvatar';
import { ThoughtHeader } from './ThoughtHeader';
import { ThoughtBody } from './ThoughtBody';
import { QuotedThoughtCard } from './QuotedThoughtCard';
import { QuotedArticleCard, type QuotedArticleData } from './QuotedArticleCard';
import { LinkPreview, type UnfurlPreview } from './LinkPreview';
import { ThoughtActions } from './ThoughtActions';

import { KnownLikers } from './KnownLikers';
import { t } from '@lingui/core/macro';

export type ThoughtVariant = 'timeline' | 'focus' | 'parent' | 'reply';

export interface ThoughtData {
  id: string;
  content: string;
  imageUrl?: string | null;
  createdAt: string | Date;
  triggerWarning?: string | null;
  isPinned?: boolean;
  isDeleted?: boolean;
  isHiddenByAuthor?: boolean;
  likesCount?: number;
  repliesCount?: number;
  repostsCount?: number;
  likeCount?: number;
  replyCount?: number;
  repostCount?: number;
  liked?: boolean;
  reposted?: boolean;
  _count?: {
    likes?: number;
    replies?: number;
    reposts?: number;
  };
  authorId?: string;
  parent?: {
    id: string;
    author: {
      id: string;
      name: string | null;
      username: string | null;
      subdomain?: string | null;
    };
  } | null;
  repost?: {
    id: string;
    content: string;
    imageUrl?: string | null;
    createdAt?: string | Date;
    author: {
      id: string;
      name: string | null;
      username: string | null;
      subdomain?: string | null;
      logoUrl?: string | null;
      isCertified?: boolean;
    };
  } | null;
  author: {
    id: string;
    name: string | null;
    username: string | null;
    subdomain?: string | null;
    logoUrl?: string | null;
    isCertified?: boolean;
  };
  tags?: string[];
  attachments?: Array<{ id?: string; url: string; type?: string; altText?: string | null }> | null;
  articleQuote?: QuotedArticleData | null;
  quotedExcerpt?: string | null;
  poll?: {
    id: string;
    thoughtId: string;
    expiresAt: string | Date;
    isExpired: boolean;
    totalVotes: number;
    userVotedOptionId: string | null;
    options: Array<{
      id: string;
      text: string;
      order: number;
      voteCount: number;
      percentage: number;
    }>;
  } | null;
  replyRestriction?: string;
}

export interface ThoughtCardProps {
  post: ThoughtData;
  variant?: ThoughtVariant;
  depth?: number;
  currentUserId?: string | null;
  isPreview?: boolean;
  unfurlFn?: (url: string) => Promise<UnfurlPreview | null>;
  pollSlot?: React.ReactNode;
  threadgateBadge?: React.ReactNode;
  isThreadParent?: boolean;
  isThreadChild?: boolean;
  isThreadLastChild?: boolean;
  knownLikers?: Array<{
    id: string;
    name: string | null;
    username: string | null;
    subdomain?: string | null;
    logoUrl?: string | null;
  }>;
  knownLikersTotal?: number;
  isFollowingAuthor?: boolean;
  onFollowToggle?: (e: React.MouseEvent) => void;
  onOpenProfile?: (username: string) => void;
  onOpenPost?: (postId: string, authorUsername?: string) => void;
  onOpenArticle?: (article: QuotedArticleData) => void;
  onOpenMedia?: (url: string) => void;
  onLikeToggle?: (e: React.MouseEvent) => void;
  onReplyClick?: (e: React.MouseEvent) => void;
  onRepostToggle?: (e: React.MouseEvent) => void;
  onQuoteClick?: (e: React.MouseEvent) => void;
  onShareClick?: (e: React.MouseEvent) => void;
  onPinToggle?: (e: React.MouseEvent) => void;
  onReportClick?: (e: React.MouseEvent) => void;
  onHideReplyToggle?: (e: React.MouseEvent) => void;
  onBlockUserToggle?: (e: React.MouseEvent) => void;
  onDeleteClick?: (e: React.MouseEvent) => void;
  className?: string;
}

const getUrls = (text: string): string[] => {
  if (!text) return [];
  const urlRegex = /https?:\/\/[^\s]+/gi;
  return text.match(urlRegex) || [];
};

export function ThoughtCard({
  post,
  variant = 'timeline',
  depth = 0,
  currentUserId,
  unfurlFn,
  pollSlot,
  threadgateBadge,
  isThreadParent,
  isThreadChild,
  isThreadLastChild,
  knownLikers,
  knownLikersTotal,
  isFollowingAuthor,
  onFollowToggle,
  onOpenProfile,
  onOpenPost,
  onOpenArticle,
  onOpenMedia,
  onLikeToggle,
  onReplyClick,
  onRepostToggle,
  onQuoteClick,
  onShareClick,
  onPinToggle,
  onReportClick,
  onHideReplyToggle,
  onBlockUserToggle,
  onDeleteClick,
  className,
}: ThoughtCardProps) {
  const isPureRepost = !!post.repost && !post.content?.trim();
  const isQuotePost = !!post.repost && !!post.content?.trim();

  const displayAuthor = isPureRepost ? post.repost!.author : post.author;
  const displayContent = isPureRepost ? post.repost!.content : post.content;
  const rawDisplayContent = displayContent;
  const displayImageUrl = isPureRepost ? post.repost!.imageUrl : post.imageUrl;
  const displayPostId = isPureRepost ? post.repost!.id : post.id;
  const displayCreatedAt = isPureRepost ? post.repost!.createdAt || post.createdAt : post.createdAt;

  const authorHandle =
    displayAuthor.username || displayAuthor.subdomain || displayAuthor.id?.slice(0, 8) || 'auteur';
  const urls = getUrls(rawDisplayContent || '');
  const quotedExcerpt = post.quotedExcerpt;

  const handleQuoteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onQuoteClick) {
      onQuoteClick(e);
    } else if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('open-composer', {
          detail: { quotedThought: post },
        })
      );
    }
  };

  const handleOpenPost = () => {
    if (variant === 'focus') return;
    if (onOpenPost) {
      onOpenPost(displayPostId, authorHandle);
    }
  };

  const isFocus = variant === 'focus';
  const isParent = variant === 'parent';
  const isReply = variant === 'reply';

  const handleReplyClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onReplyClick) {
      onReplyClick(e);
    } else if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('open-composer', { detail: { replyToThought: post } }));
    } else {
      handleOpenPost();
    }
  };

  const handleReportAction = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onReportClick) {
      onReportClick(e);
    }
  };

  const canHideReply = Boolean(
    post.parent && currentUserId && post.parent.author && post.parent.author.id === currentUserId
  );

  const hasTopBanner = Boolean(
    isPureRepost ||
    post.isPinned ||
    (post.parent && !isParent && !isFocus && variant === 'timeline') ||
    (post.parent && (variant === 'reply' || isFocus) && depth > 0)
  );

  return (
    <>
      <article
        onClick={handleOpenPost}
        className={cn(
          'group relative flex gap-3 p-3.5 sm:p-4 transition-colors duration-200 cursor-pointer select-none',
          'bg-card/40 hover:bg-muted/30 border-b border-border/40',
          isFocus && 'bg-card border-none hover:bg-card cursor-default py-5',
          (isParent || isThreadParent) && 'pb-1 border-none',
          variant === 'reply' && depth === 0 && 'py-3 border-b border-border/20',
          className
        )}
      >
        {/* COLUMN 1: Avatar & Thread Line Connectors */}
        <div
          className={cn(
            'relative flex flex-col items-center shrink-0 w-10 self-stretch',
            hasTopBanner && 'pt-5'
          )}
        >
          {/* Top Line Connector (starts at top edge of card and connects down to avatar) */}
          {isThreadChild && (
            <div
              className={cn(
                'absolute w-[2px] bg-border left-1/2 -translate-x-1/2',
                isFocus ? '-top-5' : '-top-3.5 sm:-top-4'
              )}
              style={{
                bottom: hasTopBanner ? 'calc(100% - 20px)' : 'calc(100% - 2px)',
              }}
            />
          )}

          <div className="relative z-10 shrink-0">
            <ProfileHoverCard user={displayAuthor} onOpenProfile={onOpenProfile}>
              <AuthorAvatar user={displayAuthor} size={isFocus ? 'lg' : 'md'} showBadge={false} />
            </ProfileHoverCard>
          </div>

          {/* Bottom Line Connector (starts at avatar bottom and runs to bottom edge of card) */}
          {(isParent || isThreadParent) && !isThreadLastChild && (
            <div
              className={cn(
                'absolute w-[2px] bg-border left-1/2 -translate-x-1/2',
                isParent || isThreadParent ? '-bottom-1' : '-bottom-3.5 sm:-bottom-4'
              )}
              style={{
                top: isFocus ? (hasTopBanner ? 72 : 52) : hasTopBanner ? 64 : 44,
              }}
            />
          )}
        </div>

        {/* COLUMN 2: Main Content Area */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Pure Repost Banner */}
          {isPureRepost && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground pb-0.5 font-sans">
              <Repeat className="w-3.5 h-3.5 text-success" />
              <span>
                <strong className="font-semibold text-foreground">
                  @{post.author.username || post.author.subdomain || post.author.id.slice(0, 8)}
                </strong>{' '}
                a repartagé
              </span>
            </div>
          )}

          {/* Pinned Badge */}
          {post.isPinned && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-brand pb-0.5">
              <Pin className="w-3 h-3 fill-current rotate-45" />
              <span>{t`Épinglé`}</span>
            </div>
          )}

          {/* Reply Context Banner (Only in main feed timeline view) */}
          {post.parent && !isThreadChild && !isParent && !isFocus && variant === 'timeline' && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground pb-0.5 font-sans">
              <CornerDownRight className="w-3.5 h-3.5 text-brand" />
              <span>
                En réponse à{' '}
                <strong className="font-semibold text-foreground">
                  @
                  {post.parent.author.username ||
                    post.parent.author.subdomain ||
                    post.parent.author.id.slice(0, 8)}
                </strong>
              </span>
            </div>
          )}

          {/* Sub-reply target indicator (In thread view when replying to a nested reply) */}
          {post.parent && (variant === 'reply' || isFocus) && depth > 0 && (
            <div className="text-[11px] text-muted-foreground font-sans">
              En réponse à{' '}
              <span className="text-brand font-medium">
                @
                {post.parent.author.username ||
                  post.parent.author.subdomain ||
                  post.parent.author.id.slice(0, 8)}
              </span>
            </div>
          )}

          {/* Author Header */}
          <ThoughtHeader
            author={displayAuthor}
            createdAt={displayCreatedAt}
            isPinned={post.isPinned}
            isFocus={isFocus}
            currentUserId={currentUserId}
            canHideReply={canHideReply}
            isHiddenByAuthor={post.isHiddenByAuthor}
            postId={displayPostId}
            thoughtText={displayContent}
            isFollowingAuthor={isFollowingAuthor}
            onFollowToggle={onFollowToggle}
            onOpenProfile={onOpenProfile}
            onPinToggle={onPinToggle}
            onReportClick={handleReportAction}
            onHideReplyToggle={onHideReplyToggle}
            onBlockUserToggle={onBlockUserToggle}
            onDeleteClick={onDeleteClick}
          />

          {/* Threadgate Badge */}
          {threadgateBadge}

          {/* Text Body Content */}
          <ThoughtBody
            content={displayContent}
            imageUrl={displayImageUrl}
            attachments={post.attachments}
            triggerWarning={post.triggerWarning}
            isFocus={isFocus}
            onOpenMedia={onOpenMedia}
          />

          {/* Poll Slot */}
          {pollSlot}

          {/* Quoted Thought Card (if quoting another thought) */}
          {isQuotePost && (
            <QuotedThoughtCard
              post={post.repost || null}
              onOpenPost={(id, authorUsername) => {
                const handle =
                  authorUsername ||
                  post.repost?.author?.username ||
                  post.repost?.author?.subdomain ||
                  'auteur';
                if (onOpenPost) onOpenPost(id, handle);
              }}
            />
          )}

          {/* Quoted Article Card (Explicit prop) */}
          {post.articleQuote && (
            <QuotedArticleCard
              article={post.articleQuote}
              quotedExcerpt={quotedExcerpt || undefined}
              onOpenArticle={onOpenArticle}
            />
          )}

          {/* Unfurled Link Preview (Apple Reader Highlight if article link, or external link preview) */}
          {!post.articleQuote && urls.length > 0 && (
            <LinkPreview
              urls={urls}
              quotedExcerpt={quotedExcerpt || undefined}
              unfurlFn={unfurlFn}
              onNavigate={(target) => {
                if (target.type === 'post') {
                  if (onOpenPost) onOpenPost(target.id);
                } else if (target.type === 'article') {
                  if (onOpenArticle) {
                    onOpenArticle({ id: target.id, slug: target.slug || '', title: '' });
                  }
                }
              }}
            />
          )}

          {/* Focus Mode Date & Time Footer */}
          {isFocus && (
            <div className="py-2.5 my-1 border-y border-border/40 text-xs text-muted-foreground font-sans">
              {new Date(displayCreatedAt).toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
              {' · '}
              {new Date(displayCreatedAt).toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </div>
          )}
          {/* Detailed stats & KnownLikers in Focus mode */}
          {isFocus &&
            ((post.repostsCount ?? post.repostCount ?? post._count?.reposts ?? 0) > 0 ||
              (post.likesCount ?? post.likeCount ?? post._count?.likes ?? 0) > 0 ||
              (knownLikers && knownLikers.length > 0)) && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5 px-1 border-b border-border/40 text-xs text-muted-foreground font-sans">
                <div className="flex items-center gap-4">
                  {(post.repostsCount ?? post.repostCount ?? post._count?.reposts ?? 0) > 0 && (
                    <span>
                      <strong className="font-semibold text-foreground">
                        {post.repostsCount ?? post.repostCount ?? post._count?.reposts ?? 0}
                      </strong>{' '}
                      repost
                      {(post.repostsCount ?? post.repostCount ?? post._count?.reposts ?? 0) > 1
                        ? 's'
                        : ''}
                    </span>
                  )}
                  {(post.likesCount ?? post.likeCount ?? post._count?.likes ?? 0) > 0 && (
                    <span>
                      <strong className="font-semibold text-foreground">
                        {post.likesCount ?? post.likeCount ?? post._count?.likes ?? 0}
                      </strong>{' '}
                      j'aime
                    </span>
                  )}
                </div>

                {/* Dot Separator if there are both stats and known likers */}
                {((post.repostsCount ?? post.repostCount ?? post._count?.reposts ?? 0) > 0 ||
                  (post.likesCount ?? post.likeCount ?? post._count?.likes ?? 0) > 0) &&
                  knownLikers &&
                  knownLikers.length > 0 && (
                    <span className="text-muted-foreground/30 font-sans select-none shrink-0">
                      •
                    </span>
                  )}

                {knownLikers && knownLikers.length > 0 && (
                  <KnownLikers
                    likers={knownLikers}
                    totalCount={knownLikersTotal ?? knownLikers.length}
                    onOpenProfile={onOpenProfile}
                    variant="inline"
                    className="shrink-0"
                  />
                )}
              </div>
            )}

          {/* Centralized Action Bar */}
          <ThoughtActions
            post={post}
            variant={isFocus ? 'lg' : isParent || isReply ? 'sm' : 'md'}
            onLike={onLikeToggle}
            onReply={handleReplyClick}
            onRepost={onRepostToggle}
            onQuote={handleQuoteClick}
            onShare={onShareClick}
          />
        </div>
      </article>
    </>
  );
}
