'use client';

import React, { useState } from 'react';
import {
  ArrowUpRight,
  BookMarked,
  Bookmark,
  Clock,
  Crown,
  Heart,
  MessageSquare,
  Repeat,
} from 'lucide-react';
import { cn } from '@qoe/utils';
import { routes } from '@qoe/config';
import type { FeedArticleDTO } from '@qoe/api-client/types';
import { useRequireAuth } from './auth/AuthModalContext';
import { CertifiedBadge } from './ui/CertifiedBadge';
import { SafeAvatar } from './SafeAvatar';
import { SafeImage } from './SafeImage';
import { t } from '@lingui/core/macro';

export type { FeedArticleDTO as Article };

interface ArticleCardProps {
  article: FeedArticleDTO;
  isFollowedAuthor?: boolean;
  isBookmarked?: boolean;
  handleBookmarkToggle?: (article: FeedArticleDTO) => void;
  featured?: boolean;
  isPreview?: boolean;
  onOpenArticle?: (article: FeedArticleDTO) => void;
  onOpenProfile?: (username: string) => void;
  onOpenPost?: (postId: string) => void;
}

function ProfileMark({ author, size = 40 }: { author: FeedArticleDTO['author']; size?: number }) {
  const isMedia = author.type === 'MEDIA';
  return (
    <SafeAvatar
      src={author.logoUrl}
      name={author.name}
      username={author.username}
      size={size}
      className={cn(isMedia ? 'rounded-[12px]' : 'rounded-full', 'border border-border/60')}
    />
  );
}

type SharedContributor = {
  id: string;
  name: string | null;
  username: string | null;
  logoUrl: string | null;
  isCertified?: boolean;
  isMedia?: boolean;
  handleOnly?: boolean;
  consentStatus?: string;
};

function SharedContributorLine({ people }: { people: SharedContributor[] }) {
  if (people.length === 0) return null;
  return (
    <span className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-[11px] text-muted-foreground">
      <span className="flex shrink-0 items-center -space-x-1">
        {people.slice(0, 3).map((person) => (
          <SafeAvatar
            key={person.id}
            src={person.logoUrl}
            name={person.name}
            username={person.username}
            size={16}
            className={cn(
              'border border-border/80',
              person.isMedia ? 'rounded-[4px]' : 'rounded-full'
            )}
          />
        ))}
      </span>
      <span className="truncate">
        {people
          .slice(0, 2)
          .map((person) => {
            const handle = person.username || person.id.slice(0, 8);
            return person.handleOnly ? `@${handle}` : `${person.name || 'Auteur'} @${handle}`;
          })
          .join(' · ')}
        {people.length > 2 ? ` +${people.length - 2}` : ''}
      </span>
    </span>
  );
}

export function ArticleCard({
  article,
  isFollowedAuthor = false,
  isBookmarked = false,
  handleBookmarkToggle,
  featured = false,
  isPreview = false,
  onOpenArticle,
  onOpenProfile,
  onOpenPost,
}: ArticleCardProps) {
  const { withAuth } = useRequireAuth();
  const [bookmarked, setBookmarked] = useState(isBookmarked);
  const [liked, setLiked] = useState(article.liked || false);
  const [likesCount, setLikesCount] = useState(article.likesCount || 0);
  const [reposted, setReposted] = useState(false);
  const [repostsCount, setRepostsCount] = useState(0);

  const isThought = !article.title;
  const authorHandle = article.author.username || article.author.subdomain || 'qoe.fi';
  const explicitContributors = (article.author.contributors || [])
    .filter(
      (contributor) =>
        contributor.isVisible !== false &&
        (contributor.consentStatus === undefined || contributor.consentStatus === 'ACCEPTED')
    )
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const explicitPrimary = explicitContributors.find(
    (contributor) => contributor.role === 'PRIMARY_AUTHOR'
  );
  const journalist = article.author.journalist || explicitPrimary || null;
  const legacyCoAuthors = (article.author.coAuthors || []).filter(
    (contributor) =>
      contributor.consentStatus === undefined || contributor.consentStatus === 'ACCEPTED'
  );
  const explicitContributorIds = new Set(explicitContributors.map((contributor) => contributor.id));
  const coAuthors = [
    ...explicitContributors.filter((contributor) => contributor.id !== journalist?.id),
    ...legacyCoAuthors.filter((contributor) => !explicitContributorIds.has(contributor.id)),
  ];
  const isMedia = article.author.type === 'MEDIA';
  const useAuthorAsPrimary = isMedia && Boolean(journalist?.id && isFollowedAuthor);
  const primaryPerson = useAuthorAsPrimary ? journalist : null;
  const primaryName = primaryPerson?.name || article.author?.name || 'Auteur';
  const primaryHandle = primaryPerson?.username || primaryPerson?.id?.slice(0, 8) || authorHandle;
  const primaryAuthor = primaryPerson
    ? {
        ...article.author,
        ...primaryPerson,
        type: 'PERSONAL' as const,
        subdomain: null,
        customDomain: null,
      }
    : article.author;
  const secondaryPeople = useAuthorAsPrimary
    ? [{ ...article.author, isMedia: true, handleOnly: true }, ...coAuthors]
    : isMedia
      ? journalist
        ? [journalist, ...coAuthors]
        : coAuthors.length > 0
          ? coAuthors
          : [{ ...article.author, isMedia: true, handleOnly: true }]
      : coAuthors;
  const coverImage =
    article.imageUrl || (useAuthorAsPrimary ? journalist?.logoUrl : article.author.logoUrl);
  const excerpt = article.content
    ? article.content
        .replace(/<[^>]*>?/gm, '')
        .replace(/\s+/g, ' ')
        .trim()
    : '';
  const date = new Date(article.createdAt).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const url = article.author.subdomain
    ? routes.tenant.article(article.author.subdomain, article.slug)
    : routes.feed.article(article.slug);

  const openProfile = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenProfile?.(primaryHandle);
  };

  const openArticle = (event: React.MouseEvent) => {
    if (onOpenArticle) {
      event.preventDefault();
      event.stopPropagation();
      onOpenArticle(article);
    }
  };

  const toggleBookmark = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setBookmarked((value) => !value);
    handleBookmarkToggle?.(article);
  };

  const toggleLike = withAuth(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setLiked((value) => !value);
      setLikesCount((value) => (liked ? Math.max(0, value - 1) : value + 1));
    },
    { actionContext: 'like' }
  );

  const toggleRepost = withAuth(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setReposted((value) => !value);
      setRepostsCount((value) => (reposted ? Math.max(0, value - 1) : value + 1));
    },
    { actionContext: 'repost' }
  );

  if (isThought) return null;

  return (
    <article
      className={cn(
        'group relative overflow-hidden bg-card shadow-none transition-colors',
        'rounded-[24px] p-2.5 sm:p-3',
        featured && 'rounded-[28px]'
      )}
    >
      <div
        className={cn(
          'relative overflow-hidden rounded-[17px] bg-muted',
          featured ? 'h-[250px]' : 'h-[205px]'
        )}
      >
        {coverImage ? (
          <SafeImage
            src={coverImage}
            alt={article.title || ''}
            fill
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.025]"
            sizes="(max-width: 768px) 100vw, 720px"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-primary/25 via-muted to-background" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/5 via-transparent to-black/30" />

        <div className="absolute inset-x-3 top-3 flex items-center justify-between gap-3 rounded-[14px] bg-white/90 px-2.5 py-2 text-black backdrop-blur-md dark:bg-black/75 dark:text-white">
          <button
            type="button"
            onClick={openProfile}
            className="flex min-w-0 items-center gap-2.5 text-left"
          >
            <ProfileMark author={primaryAuthor} size={40} />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[15px] font-semibold tracking-[-0.02em]">
                  {primaryName}
                </span>
                {(primaryPerson?.isCertified || article.author.isCertified) && <CertifiedBadge />}
                <span className="text-[11px] font-normal text-black/60 dark:text-white/60">
                  · {date}
                </span>
              </span>
              <SharedContributorLine people={secondaryPeople} />
            </span>
          </button>
          {!isPreview && (
            <button
              type="button"
              onClick={openProfile}
              className="shrink-0 text-[11px] font-medium uppercase tracking-[0.08em]"
            >
              {t`Voir le profil`}
            </button>
          )}
        </div>
      </div>

      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        onClick={openArticle}
        className="block px-1.5 pb-1 pt-3"
      >
        <h2 className="line-clamp-2 text-[21px] font-semibold leading-[1.08] tracking-[-0.04em] text-foreground">
          {article.title}
        </h2>
        {excerpt && (
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-muted-foreground">
            {excerpt}
          </p>
        )}
      </a>

      <div className="flex items-center justify-between gap-3 border-t border-border/35 px-1.5 pt-2.5 text-xs text-muted-foreground">
        <div className="flex min-w-0 items-center gap-2.5">
          {article.category && (
            <span className="truncate text-foreground/80">{article.category.name}</span>
          )}
          {article.category && article.readingTime > 0 && <span>·</span>}
          {article.readingTime > 0 && (
            <span className="flex items-center gap-1 whitespace-nowrap">
              <Clock className="h-3.5 w-3.5" />
              {article.readingTime} min de lecture
            </span>
          )}
          {article.isPremium && <Crown className="h-3.5 w-3.5 text-highlight" />}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {!isPreview && (
            <>
              <button
                type="button"
                onClick={toggleLike}
                className={cn(
                  'flex items-center gap-1 rounded-full p-1.5 hover:bg-muted',
                  liked && 'text-primary'
                )}
                title={t`Aimer`}
              >
                <Heart className={cn('h-4 w-4', liked && 'fill-current')} />
                {likesCount > 0 && <span>{likesCount}</span>}
              </button>
              <button
                type="button"
                onClick={toggleRepost}
                className={cn(
                  'flex items-center gap-1 rounded-full p-1.5 hover:bg-muted',
                  reposted && 'text-success'
                )}
                title={t`Reposter`}
              >
                <Repeat className="h-4 w-4" />
                {repostsCount > 0 && <span>{repostsCount}</span>}
              </button>
              <button
                type="button"
                onClick={() => onOpenPost?.(article.id)}
                className="rounded-full p-1.5 hover:bg-muted"
                title={t`Commenter`}
              >
                <MessageSquare className="h-4 w-4" />
              </button>
            </>
          )}
          {handleBookmarkToggle && (
            <button
              type="button"
              onClick={toggleBookmark}
              className="rounded-full p-1.5 hover:bg-muted"
              title={t`Mettre en signet`}
            >
              {bookmarked ? (
                <BookMarked className="h-4 w-4 fill-current text-primary" />
              ) : (
                <Bookmark className="h-4 w-4" />
              )}
            </button>
          )}
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            onClick={openArticle}
            className="rounded-full p-1.5 hover:bg-muted"
            title={t`Lire l'article`}
          >
            <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </article>
  );
}
