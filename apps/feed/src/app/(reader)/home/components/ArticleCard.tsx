'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import {
  UserPlus,
  UserCheck,
  Bookmark,
  BookMarked,
  Clock,
  Crown,
  ArrowUpRight,
} from 'lucide-react';
import { cn } from '@qoe/utils';

import { ThoughtCard, type ThoughtData } from '@/components/social/ThoughtCard';
import { t } from '@lingui/core/macro';
import { routes } from '@qoe/config/routes';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@qoe/ui/ui/hover-card';
import { AuthorAvatar } from '@qoe/ui/ui/AuthorAvatar';
import { CertifiedBadge } from '@qoe/ui/ui/CertifiedBadge';

interface Journalist {
  id: string;
  name: string | null;
  username: string | null;
  logoUrl: string | null;
  isCertified?: boolean;
}

interface Author {
  id: string;
  name: string | null;
  username: string | null;
  subdomain: string | null;
  customDomain: string | null;
  logoUrl: string | null;
  heroText: string | null;
  isCertified?: boolean;
  type?: 'PERSONAL' | 'MEDIA';
  authorName?: string | null;
  journalist?: Journalist | null;
}

interface Article {
  id: string;
  title: string;
  slug: string;
  content: string;
  imageUrl?: string | null;
  published: boolean;
  isPremium: boolean;
  readingTime: number;
  createdAt: Date | string;
  author: Author;
  category: { name: string } | null;
  tags?: string[];
  parent?: unknown;
  repost?: unknown;
}

export interface ArticleCardProps {
  article: Article;
  idx: number;
  dbUser: { id?: string | null } | null;
  isBookmarked: boolean;
  isFollowed: boolean;
  handleFollowToggle: (author: Author) => void;
  handleBookmarkToggle: (article: Article) => void;
  featured?: boolean;
  onOpenArticle?: (article: Article) => void;
  onOpenProfile?: (username: string) => void;
  onOpenPost?: (postId: string, authorUsername?: string) => void;
}

function getAuthorGradient(name: string | null): string {
  const hues = [12, 200, 260, 140, 30, 340];
  const index = (name?.charCodeAt(0) || 0) % hues.length;
  return `linear-gradient(135deg, hsl(${hues[index]}, 62%, 82%) 0%, hsl(${hues[(index + 2) % hues.length]}, 48%, 94%) 100%)`;
}

function getPlainExcerpt(content: string): string {
  return content
    .replace(/<[^>]*>?/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function BrandAvatar({ author, size = 40 }: { author: Author; size?: number }) {
  const isMedia = author.type === 'MEDIA';

  if (isMedia) {
    return (
      <div
        className="relative shrink-0 overflow-hidden rounded-[13px] border border-white/50 bg-muted shadow-xs"
        style={{ width: size, height: size }}
      >
        {author.logoUrl ? (
          <Image src={author.logoUrl} alt={author.name || ''} fill className="object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-brand/10 text-xs font-semibold text-brand">
            {author.name?.substring(0, 2) || 'NA'}
          </div>
        )}
      </div>
    );
  }

  return <AuthorAvatar user={author} size={size === 40 ? 'md' : 'sm'} showBadge={false} />;
}

/**
 * Article card inspired by Apple Music: a quiet identity row over a cover image
 * that fades into the feed surface before the title and reading metadata.
 */
export function ArticleCard({
  article,
  dbUser,
  isBookmarked,
  isFollowed,
  handleFollowToggle,
  handleBookmarkToggle,
  featured = false,
  onOpenArticle,
  onOpenProfile,
  onOpenPost,
}: ArticleCardProps) {
  const [localBookmarked, setLocalBookmarked] = useState(isBookmarked);
  const [localFollowed, setLocalFollowed] = useState(isFollowed);

  useEffect(() => {
    setLocalBookmarked(isBookmarked);
  }, [isBookmarked]);

  useEffect(() => {
    setLocalFollowed(isFollowed);
  }, [isFollowed]);

  const isThought = !article.title;
  if (isThought) {
    return (
      <ThoughtCard
        post={article as unknown as ThoughtData}
        currentUserId={dbUser?.id || null}
        onOpenPost={onOpenPost}
        onOpenProfile={onOpenProfile}
      />
    );
  }

  const articleUrl = article.author.subdomain
    ? routes.tenant.article(article.author.subdomain, article.slug)
    : routes.feed.article(article.slug);
  const formattedDate = new Date(article.createdAt).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  });
  const excerpt = getPlainExcerpt(article.content);
  const hasHeroImage = Boolean(article.imageUrl);
  const authorHandle = article.author.username || article.author.subdomain || 'qoe.fi';
  const journalist = article.author.journalist;
  const journalistHandle = journalist?.username || journalist?.id || 'journaliste';

  const onToggleBookmark = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLocalBookmarked((previous) => !previous);
    handleBookmarkToggle(article);
  };

  const onToggleFollow = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setLocalFollowed((previous) => !previous);
    handleFollowToggle(article.author);
  };

  const handleOpenArticle = (e?: React.MouseEvent) => {
    if (onOpenArticle) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      onOpenArticle(article);
    } else if (onOpenPost) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      onOpenPost(article.id);
    }
  };

  const handleOpenProfile = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onOpenProfile) {
      onOpenProfile(authorHandle);
    } else {
      window.location.href = routes.feed.profile(authorHandle);
    }
  };

  const handleOpenJournalistProfile = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onOpenProfile && journalist?.username) {
      onOpenProfile(journalist.username);
    }
  };

  const renderAuthorHoverCard = () => (
    <HoverCardContent className="z-50 w-72 rounded-2xl border border-border/40 bg-card p-4 font-sans shadow-xl">
      <div className="flex gap-3">
        <BrandAvatar author={article.author} size={40} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <h4 className="truncate text-xs font-semibold text-foreground">
              {article.author.name}
            </h4>
            {article.author.isCertified && <CertifiedBadge />}
          </div>
          <p className="text-[11px] text-muted-foreground">@{authorHandle}</p>
          {article.author.heroText && (
            <p className="line-clamp-2 pt-0.5 text-[11px] leading-normal text-muted-foreground">
              {article.author.heroText}
            </p>
          )}
        </div>
      </div>
    </HoverCardContent>
  );

  const renderJournalistHoverCard = () =>
    journalist ? (
      <HoverCardContent className="z-50 w-72 rounded-2xl border border-border/40 bg-card p-4 font-sans shadow-xl">
        <div className="flex items-center gap-3">
          <AuthorAvatar user={journalist} size="md" showBadge={false} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-semibold text-foreground">{journalist.name}</p>
              {journalist.isCertified && <CertifiedBadge />}
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">@{journalistHandle}</p>
          </div>
        </div>
      </HoverCardContent>
    ) : null;

  return (
    <article
      className={cn(
        'group relative isolate min-h-[250px] overflow-hidden border-y border-border/25 bg-card/35 backdrop-blur-[2px] transition-colors duration-300 hover:bg-card/40',
        featured && 'min-h-[290px]'
      )}
    >
      {/* Cover image: it belongs to the whole surface, then quietly disappears into the feed. */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        {hasHeroImage ? (
          <div
            className="absolute inset-0 transition-transform duration-700 ease-out group-hover:scale-[1.04]"
            style={{
              maskImage: 'linear-gradient(to bottom, black 0%, black 48%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 48%, transparent 100%)',
            }}
          >
            <Image
              src={article.imageUrl!}
              alt=""
              fill
              priority={featured}
              className="object-cover object-center opacity-[0.42] saturate-[0.78]"
              sizes="(max-width: 768px) 100vw, 768px"
            />
          </div>
        ) : (
          <div
            className="absolute inset-0 opacity-[0.45]"
            style={{
              background: getAuthorGradient(article.author.name),
              maskImage: 'linear-gradient(to bottom, black 0%, black 42%, transparent 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 42%, transparent 100%)',
            }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-card/0 via-card/25 to-card/75" />
        <div className="absolute inset-0 bg-gradient-to-r from-card/55 via-card/15 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-card/65" />
      </div>

      <div
        className={cn(
          'relative flex min-h-[250px] flex-col p-4 sm:p-5',
          featured && 'min-h-[290px]'
        )}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <BrandAvatar author={article.author} size={40} />
            <div className="min-w-0">
              <HoverCard>
                <HoverCardTrigger>
                  <button
                    type="button"
                    onClick={handleOpenProfile}
                    className="group/author flex items-center gap-1.5 text-left outline-none"
                  >
                    <span className="truncate text-sm font-semibold tracking-[-0.01em] text-foreground transition-colors group-hover/author:text-brand">
                      {article.author.name}
                    </span>
                    {article.author.isCertified && <CertifiedBadge />}
                  </button>
                </HoverCardTrigger>
                {renderAuthorHoverCard()}
              </HoverCard>
              {journalist && (
                <HoverCard>
                  <HoverCardTrigger>
                    <button
                      type="button"
                      onClick={handleOpenJournalistProfile}
                      className="mt-0.5 block max-w-full truncate text-left text-[11px] text-muted-foreground transition-colors hover:text-brand"
                    >
                      Par {journalist.name}
                    </button>
                  </HoverCardTrigger>
                  {renderJournalistHoverCard()}
                </HoverCard>
              )}
              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground/75">
                @{authorHandle} · {formattedDate}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {featured && (
              <span className="rounded-full border border-border/35 bg-card/45 px-3 py-1.5 text-[11px] font-medium text-foreground/80 backdrop-blur-md">
                À la une
              </span>
            )}
            {dbUser && dbUser.id !== article.author.id && (
              <FollowButton isFollowed={localFollowed} onToggle={onToggleFollow} />
            )}
          </div>
        </div>

        <a
          href={articleUrl}
          target="_blank"
          rel="noreferrer"
          onClick={handleOpenArticle}
          className="mt-8 block max-w-2xl text-left"
        >
          <h3
            className={cn(
              'font-sans font-semibold tracking-[-0.035em] text-foreground transition-colors duration-300 group-hover:text-brand',
              featured ? 'text-[28px] leading-[1.08] sm:text-[34px]' : 'text-[23px] leading-[1.12]'
            )}
          >
            {article.title}
          </h3>
          {excerpt && (
            <p className="mt-2.5 line-clamp-2 max-w-xl text-[13px] leading-relaxed text-muted-foreground/90 sm:text-sm">
              {excerpt}
            </p>
          )}
        </a>

        <CardFooter
          article={article}
          isBookmarked={localBookmarked}
          handleBookmarkToggle={onToggleBookmark}
          handleOpenInTab={handleOpenArticle}
        />
      </div>
    </article>
  );
}

function FollowButton({
  isFollowed,
  onToggle,
}: {
  isFollowed: boolean;
  onToggle: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-all duration-200',
        'cursor-pointer outline-none',
        isFollowed
          ? 'bg-card/65 text-muted-foreground backdrop-blur-md hover:bg-card/85'
          : 'bg-foreground text-background shadow-xs hover:opacity-85'
      )}
    >
      {isFollowed ? (
        <UserCheck className="h-3.5 w-3.5 text-success" />
      ) : (
        <UserPlus className="h-3.5 w-3.5" />
      )}
      <span>{isFollowed ? t`Abonné` : t`Suivre`}</span>
    </button>
  );
}

function CardFooter({
  article,
  isBookmarked,
  handleBookmarkToggle,
  handleOpenInTab,
}: {
  article: Article;
  isBookmarked: boolean;
  handleBookmarkToggle: (e: React.MouseEvent) => void;
  handleOpenInTab: (e?: React.MouseEvent) => void;
}) {
  return (
    <div className="mt-5 flex items-center justify-between gap-4 border-t border-border/25 pt-3.5">
      <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        {article.category && (
          <span className="truncate text-foreground/75">{article.category.name}</span>
        )}
        {article.category && article.readingTime > 0 && (
          <span className="text-muted-foreground/50">·</span>
        )}
        {article.readingTime > 0 && (
          <span className="flex shrink-0 items-center gap-1">
            <Clock className="h-3.5 w-3.5" strokeWidth={1.7} />
            {t`${article.readingTime} min de lecture`}
          </span>
        )}
        {article.isPremium && (
          <span className="flex shrink-0 items-center gap-1 text-highlight">
            <Crown className="h-3.5 w-3.5" />
            {t`Premium`}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1 opacity-75 transition-opacity duration-200 group-hover:opacity-100">
        <button
          type="button"
          onClick={handleBookmarkToggle}
          className={cn(
            'rounded-full p-2 transition-colors',
            'cursor-pointer hover:bg-muted/70',
            isBookmarked ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          )}
          title={isBookmarked ? t`Retirer de la bibliothèque` : t`Mettre en signet`}
        >
          {isBookmarked ? (
            <BookMarked className="h-4 w-4 fill-current" />
          ) : (
            <Bookmark className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          onClick={handleOpenInTab}
          className="cursor-pointer rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
          title={t`Lire l'article`}
        >
          <ArrowUpRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

ArticleCard.Root = ArticleCard;
ArticleCard.Footer = CardFooter;
