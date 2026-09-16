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
import { getArticleUrl } from '@qoe/config';
import type { FeedArticleDTO } from '@qoe/sdk/types';
import { useRequireAuth } from './auth/AuthModalContext';
import { CertifiedBadge } from './ui/CertifiedBadge';
import { SafeAvatar } from './SafeAvatar';
import { SafeImage } from './SafeImage';
import { ProfileHoverCard } from './social/ProfileHoverCard';
import { t } from '@lingui/core/macro';

export type { FeedArticleDTO as Article };

interface ArticleCardProps {
  article: FeedArticleDTO;
  isFollowedAuthor?: boolean;
  disableAuthorOverride?: boolean;
  isBookmarked?: boolean;
  handleBookmarkToggle?: (article: FeedArticleDTO) => void;
  featured?: boolean;
  isPreview?: boolean;
  onOpenArticle?: (article: FeedArticleDTO) => void;
  onOpenProfile?: (username: string) => void;
  onOpenPost?: (id: string) => void;
}

function ProfileMark({ author, size = 40 }: { author: FeedArticleDTO['author']; size?: number }) {
  return (
    <SafeAvatar
      src={author.logoUrl}
      name={author.name}
      username={author.username || author.subdomain}
      size={size}
      shape={author.type === 'MEDIA' ? 'squircle' : 'circle'}
      type={author.type === 'MEDIA' ? 'MEDIA' : 'PERSONAL'}
      className={cn(
        'border border-white/80 shadow-xs shrink-0',
        author.type === 'MEDIA' ? 'rounded-[10px]' : 'rounded-full'
      )}
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

function SharedContributorLine({
  people,
  forMedia,
  onOpenProfile,
}: {
  people: SharedContributor[];
  forMedia?: SharedContributor | null;
  onOpenProfile?: (username: string) => void;
}) {
  if (!forMedia && people.length === 0) return null;

  const allAvatars = forMedia ? [forMedia, ...people] : people;

  return (
    <span className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate text-[11px] text-muted-foreground font-sans">
      <span className="flex shrink-0 items-center -space-x-1">
        {allAvatars.slice(0, 3).map((person) => (
          <ProfileHoverCard
            key={person.id}
            user={{
              id: person.id,
              name: person.name,
              username: person.username,
              logoUrl: person.logoUrl,
              isCertified: person.isCertified,
              isMedia: person.isMedia,
              type: person.isMedia ? 'MEDIA' : 'PERSONAL',
            }}
            onOpenProfile={onOpenProfile}
          >
            <SafeAvatar
              src={person.logoUrl}
              name={person.name}
              username={person.username}
              size={16}
              shape={person.isMedia ? 'squircle' : 'circle'}
              type={person.isMedia ? 'MEDIA' : 'PERSONAL'}
              className={cn(
                'border border-border/80 shrink-0',
                person.isMedia ? 'rounded-[4px]' : 'rounded-full'
              )}
            />
          </ProfileHoverCard>
        ))}
      </span>
      <span className="truncate flex items-center gap-1 flex-wrap">
        {forMedia ? (
          <>
            <span>{t`Pour`}</span>
            <ProfileHoverCard
              user={{
                id: forMedia.id,
                name: forMedia.name,
                username: forMedia.username,
                logoUrl: forMedia.logoUrl,
                isCertified: forMedia.isCertified,
                isMedia: true,
                type: 'MEDIA',
              }}
              onOpenProfile={onOpenProfile}
            >
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenProfile?.(forMedia.username || forMedia.id);
                }}
                className="font-semibold text-foreground/90 hover:underline cursor-pointer"
              >
                {forMedia.name || `@${forMedia.username || 'média'}`}
              </span>
            </ProfileHoverCard>
            {people.length > 0 && (
              <>
                <span>{t`, avec`}</span>
                {people.map((person, idx) => {
                  const pHandle = person.username || person.id.slice(0, 8);
                  return (
                    <React.Fragment key={person.id}>
                      {idx > 0 && <span>,</span>}
                      <ProfileHoverCard
                        user={{
                          id: person.id,
                          name: person.name,
                          username: person.username,
                          logoUrl: person.logoUrl,
                          isCertified: person.isCertified,
                          isMedia: person.isMedia,
                          type: person.isMedia ? 'MEDIA' : 'PERSONAL',
                        }}
                        onOpenProfile={onOpenProfile}
                      >
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenProfile?.(pHandle);
                          }}
                          className="font-medium text-foreground/80 hover:underline cursor-pointer"
                        >
                          {person.name || `@${pHandle}`}
                        </span>
                      </ProfileHoverCard>
                    </React.Fragment>
                  );
                })}
              </>
            )}
          </>
        ) : (
          <>
            <span>{t`avec`}</span>
            {people.slice(0, 2).map((person, idx) => {
              const pHandle = person.username || person.id.slice(0, 8);
              return (
                <React.Fragment key={person.id}>
                  {idx > 0 && <span>·</span>}
                  <ProfileHoverCard
                    user={{
                      id: person.id,
                      name: person.name,
                      username: person.username,
                      logoUrl: person.logoUrl,
                      isCertified: person.isCertified,
                      isMedia: person.isMedia,
                      type: person.isMedia ? 'MEDIA' : 'PERSONAL',
                    }}
                    onOpenProfile={onOpenProfile}
                  >
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenProfile?.(pHandle);
                      }}
                      className="font-medium text-foreground/80 hover:underline cursor-pointer"
                    >
                      {person.handleOnly ? `@${pHandle}` : `${person.name || 'Auteur'} @${pHandle}`}
                    </span>
                  </ProfileHoverCard>
                </React.Fragment>
              );
            })}
            {people.length > 2 && <span>+{people.length - 2}</span>}
          </>
        )}
      </span>
    </span>
  );
}

export function ArticleCard({
  article,
  isFollowedAuthor = false,
  disableAuthorOverride = false,
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
  const useAuthorAsPrimary =
    !disableAuthorOverride && isMedia && Boolean(journalist?.id && isFollowedAuthor);
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
  const mediaContributor: SharedContributor = {
    id: article.author.id,
    name: article.author.name,
    username: article.author.username || article.author.subdomain,
    logoUrl: article.author.logoUrl,
    isMedia: true,
    handleOnly: true,
  };
  const otherContributors = coAuthors.filter((coAuthor) => coAuthor.id !== journalist?.id);
  const secondaryPeople: SharedContributor[] = useAuthorAsPrimary
    ? otherContributors.map((coAuthor) => ({ ...coAuthor, isMedia: false }))
    : isMedia
      ? journalist
        ? [
            { ...journalist, isMedia: false },
            ...otherContributors.map((coAuthor) => ({ ...coAuthor, isMedia: false })),
          ]
        : otherContributors.map((coAuthor) => ({ ...coAuthor, isMedia: false }))
      : otherContributors.map((coAuthor) => ({ ...coAuthor, isMedia: false }));
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
  const url = getArticleUrl(article, { preferTenant: true });

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
    } else {
      window.location.href = url;
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
        'group relative overflow-hidden bg-card border border-border/40 hover:border-border/80 transition-colors shadow-xs',
        'rounded-[22px] p-4 sm:p-5 flex flex-col gap-3.5',
        featured && 'rounded-[26px] border-primary/25 bg-card/90'
      )}
    >
      {/* 1. HEADER ÉDITORIAL AÉRÉ */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <ProfileHoverCard user={primaryAuthor} onOpenProfile={onOpenProfile}>
            <ProfileMark author={primaryAuthor} size={42} />
          </ProfileHoverCard>

          <div className="min-w-0 leading-tight">
            <div className="flex max-w-full items-center gap-1.5 flex-wrap">
              <ProfileHoverCard user={primaryAuthor} onOpenProfile={onOpenProfile}>
                <span
                  onClick={openProfile}
                  className="truncate text-[15px] font-semibold text-foreground tracking-[-0.01em] hover:underline cursor-pointer"
                >
                  {primaryName}
                </span>
              </ProfileHoverCard>
              {(primaryPerson?.isCertified || article.author.isCertified) && <CertifiedBadge />}
              <span className="text-xs text-muted-foreground">@{primaryHandle}</span>
              <span className="text-xs text-muted-foreground/50">·</span>
              <span className="text-xs text-muted-foreground/80">{date}</span>
            </div>

            <SharedContributorLine
              people={secondaryPeople}
              forMedia={useAuthorAsPrimary ? mediaContributor : null}
              onOpenProfile={onOpenProfile}
            />
          </div>
        </div>

        {!isPreview && (
          <button
            type="button"
            onClick={openProfile}
            className="shrink-0 px-3 py-1 rounded-full bg-muted hover:bg-muted/80 text-foreground text-xs font-semibold transition-colors cursor-pointer"
          >
            {t`Profil`}
          </button>
        )}
      </div>

      {/* 2. TITRE & EXPOSÉ */}
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        onClick={openArticle}
        className="block cursor-pointer group/title select-none"
      >
        <h2 className="line-clamp-2 text-[19px] sm:text-[21px] font-bold leading-snug tracking-[-0.02em] text-foreground group-hover/title:text-primary transition-colors">
          {article.title}
        </h2>
        {excerpt && (
          <p className="mt-1.5 line-clamp-2 text-[13.5px] sm:text-[14px] leading-relaxed text-muted-foreground">
            {excerpt}
          </p>
        )}
      </a>

      {/* 3. COVER ARTWORK (Plein cadre, 100% libre et nette) */}
      {coverImage && (
        <div
          onClick={openArticle}
          className={cn(
            'relative w-full overflow-hidden rounded-[14px] bg-muted cursor-pointer border border-border/20',
            featured ? 'h-[240px] sm:h-[280px]' : 'h-[190px] sm:h-[220px]'
          )}
        >
          <SafeImage
            src={coverImage}
            alt={article.title || ''}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 720px"
          />
        </div>
      )}

      {/* 4. FOOTER D'ACTIONS & LECTURE */}
      <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/30 text-xs text-muted-foreground">
        <div className="flex min-w-0 items-center gap-2.5">
          {article.category && (
            <span className="truncate text-foreground/80">{article.category.name}</span>
          )}
          {article.category && article.readingTime > 0 && <span>·</span>}
          {article.readingTime > 0 && (
            <span className="flex items-center gap-1 whitespace-nowrap">
              <Clock className="h-3.5 w-3.5" />
              {article.readingTime} {t`min de lecture`}
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
