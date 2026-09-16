'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import {
  ArrowUpRight,
  BookMarked,
  Bookmark,
  Clock,
  Crown,
  EyeOff,
  MoreHorizontal,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { cn } from '@qoe/utils';
import { t } from '@lingui/core/macro';
import { getArticleUrl } from '@qoe/config/routes';
import { Popover, PopoverContent, PopoverTrigger } from '@qoe/ui/ui/popover';
import { SafeAvatar, ProfileHoverCard } from '@qoe/ui';
import { CertifiedBadge } from '@qoe/ui/ui/CertifiedBadge';
import { ThoughtCard, type ThoughtData } from '@/components/social/ThoughtCard';

interface Journalist {
  id: string;
  name: string | null;
  username: string | null;
  logoUrl: string | null;
  isCertified?: boolean;
  role?: string;
  order?: number;
  isVisible?: boolean;
  consentStatus?: string;
}

interface Author {
  id: string;
  name: string | null;
  username: string | null;
  subdomain?: string | null;
  customDomain?: string | null;
  logoUrl: string | null;
  heroText?: string | null;
  isCertified?: boolean;
  type?: 'PERSONAL' | 'MEDIA' | string | null;
  journalist?: Journalist | null;
  coAuthors?: Journalist[];
  contributors?: Journalist[];
}

export interface Article {
  id: string;
  title: string;
  slug: string;
  readingTime: number;
  imageUrl?: string | null;
  isPremium?: boolean;
  published?: boolean;
  createdAt: Date | string;
  content?: string | null;
  author: Author;
  category?: { name: string } | null;
  tags?: string[];
  contributors?: Journalist[];
  likesCount?: number;
  repliesCount?: number;
  liked?: boolean;
}

export interface ArticleCardProps {
  article: Article;
  idx?: number;
  dbUser?: {
    id?: string | null;
    email?: string | null;
    name?: string | null;
    avatarUrl?: string | null;
  } | null;
  isBookmarked?: boolean;
  isFollowed?: boolean;
  isFollowedAuthor?: boolean;
  disableAuthorOverride?: boolean;
  handleFollowToggle: (author: Author) => void;
  handleBookmarkToggle: (article: Article) => void;
  featured?: boolean;
  discovery?: boolean;
  onHideArticle?: (article: Article) => void;
  onOpenArticle?: (article: Article | Partial<Article>) => void;
  onOpenProfile?: (username: string) => void;
  onOpenPost?: (id: string) => void;
}

function plainText(content?: string | null): string {
  if (!content) return '';
  return content
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function BrandAvatar({ author, size = 42 }: { author: Author; size?: number }) {
  const isMedia = author.type === 'MEDIA';
  return (
    <SafeAvatar
      src={author.logoUrl}
      name={author.name}
      username={author.username || author.subdomain}
      size={size}
      shape={isMedia ? 'squircle' : 'circle'}
      type={isMedia ? 'MEDIA' : 'PERSONAL'}
      className={isMedia ? 'rounded-xl' : 'rounded-full'}
    />
  );
}

type Contributor = Journalist & { isMedia?: boolean; handleOnly?: boolean };

function ContributorLine({
  people,
  forMedia,
  onOpenProfile,
}: {
  people: Contributor[];
  forMedia?: Contributor | null;
  onOpenProfile?: (username: string) => void;
}) {
  if (!forMedia && people.length === 0) return null;

  const allAvatars = forMedia ? [forMedia, ...people] : people;

  return (
    <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground font-sans">
      <div className="flex shrink-0 items-center -space-x-1">
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
                'border border-background shrink-0',
                person.isMedia ? 'rounded-[4px]' : 'rounded-full'
              )}
            />
          </ProfileHoverCard>
        ))}
      </div>
      <span className="truncate flex items-center gap-1 flex-wrap">
        {forMedia ? (
          <>
            <span>Pour</span>
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
                <span>avec</span>
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
            <span>avec</span>
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
    </div>
  );
}

export function ArticleCard({
  article,
  dbUser,
  isBookmarked,
  isFollowed,
  isFollowedAuthor = false,
  disableAuthorOverride = false,
  handleFollowToggle,
  handleBookmarkToggle,
  featured = false,
  discovery = false,
  onHideArticle,
  onOpenArticle,
  onOpenProfile,
  onOpenPost,
}: ArticleCardProps) {
  const [bookmarked, setBookmarked] = useState(isBookmarked);
  const [followed, setFollowed] = useState(isFollowed);

  useEffect(() => setBookmarked(isBookmarked), [isBookmarked]);
  useEffect(() => setFollowed(isFollowed), [isFollowed]);

  if (!article.title) {
    return (
      <ThoughtCard
        post={article as unknown as ThoughtData}
        currentUserId={dbUser?.id || null}
        onOpenPost={onOpenPost}
        onOpenProfile={onOpenProfile}
      />
    );
  }

  const articleUrl = getArticleUrl(article, { preferTenant: true });
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
  const legacyCoAuthors = article.author.coAuthors || [];
  const explicitContributorIds = new Set(explicitContributors.map((contributor) => contributor.id));
  const coAuthors = [
    ...explicitContributors.filter((contributor) => contributor.id !== journalist?.id),
    ...legacyCoAuthors.filter((contributor) => !explicitContributorIds.has(contributor.id)),
  ];
  const isMedia = article.author.type === 'MEDIA';
  const useAuthorAsPrimary =
    !disableAuthorOverride && isMedia && Boolean(journalist?.id && isFollowedAuthor);
  const primaryPerson = useAuthorAsPrimary ? journalist : null;
  const primaryName = primaryPerson?.name || article.author.name || 'Auteur';
  const primaryHandle = primaryPerson?.username || primaryPerson?.id?.slice(0, 8) || authorHandle;
  const primaryIsCertified = primaryPerson?.isCertified || article.author.isCertified;
  const primaryAuthor = primaryPerson
    ? ({
        ...article.author,
        ...primaryPerson,
        type: 'PERSONAL' as const,
        subdomain: null,
        customDomain: null,
      } as Author)
    : article.author;
  const mediaContributor: Contributor = {
    id: article.author.id,
    name: article.author.name,
    username: article.author.username || article.author.subdomain || null,
    logoUrl: article.author.logoUrl,
    isMedia: true,
    handleOnly: true,
  };
  const otherContributors = coAuthors.filter((coAuthor) => coAuthor.id !== journalist?.id);
  const secondaryPeople: Contributor[] = useAuthorAsPrimary
    ? otherContributors.map((coAuthor) => ({ ...coAuthor, isMedia: false }))
    : isMedia
      ? journalist
        ? [
            { ...journalist, isMedia: false },
            ...otherContributors.map((coAuthor) => ({ ...coAuthor, isMedia: false })),
          ]
        : otherContributors.map((coAuthor) => ({ ...coAuthor, isMedia: false }))
      : otherContributors.map((coAuthor) => ({ ...coAuthor, isMedia: false }));
  const fallbackImage = useAuthorAsPrimary ? journalist?.logoUrl : article.author.logoUrl;
  const coverImage = article.imageUrl || fallbackImage;
  const excerpt = plainText(article.content);
  const date = new Date(article.createdAt).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const openArticle = (event?: React.MouseEvent) => {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (onOpenArticle) onOpenArticle(article);
    else if (onOpenPost) onOpenPost(article.id);
    else {
      window.location.href = articleUrl;
    }
  };

  const openProfile = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onOpenProfile?.(primaryHandle);
  };

  const toggleBookmark = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setBookmarked((value) => !value);
    handleBookmarkToggle(article);
  };

  const toggleFollow = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setFollowed((value) => !value);
    handleFollowToggle(article.author);
  };

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
          <ProfileHoverCard
            user={{
              id: primaryAuthor.id,
              name: primaryName,
              username: primaryHandle,
              logoUrl: primaryAuthor.logoUrl,
              isCertified: primaryIsCertified,
              isMedia: primaryAuthor.type === 'MEDIA',
              type: primaryAuthor.type,
            }}
            onOpenProfile={onOpenProfile}
          >
            <BrandAvatar author={primaryAuthor} size={42} />
          </ProfileHoverCard>

          <div className="min-w-0 leading-tight">
            <div className="flex max-w-full items-center gap-1.5 flex-wrap">
              <ProfileHoverCard
                user={{
                  id: primaryAuthor.id,
                  name: primaryName,
                  username: primaryHandle,
                  logoUrl: primaryAuthor.logoUrl,
                  isCertified: primaryIsCertified,
                  isMedia: primaryAuthor.type === 'MEDIA',
                  type: primaryAuthor.type,
                }}
                onOpenProfile={onOpenProfile}
              >
                <span
                  onClick={openProfile}
                  className="truncate text-[15px] font-semibold text-foreground tracking-[-0.01em] hover:underline cursor-pointer"
                >
                  {primaryName}
                </span>
              </ProfileHoverCard>
              {primaryIsCertified && <CertifiedBadge />}
              <span className="text-xs text-muted-foreground">@{primaryHandle}</span>
              <span className="text-xs text-muted-foreground/50">·</span>
              <span className="text-xs text-muted-foreground/80">{date}</span>
              {discovery && (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary ml-1 shrink-0"
                  title={t`Sélection hors de ta bulle, choisie pour élargir tes horizons`}
                >
                  ✦ {t`Découverte`}
                </span>
              )}
            </div>

            <ContributorLine
              people={secondaryPeople}
              forMedia={useAuthorAsPrimary ? mediaContributor : null}
              onOpenProfile={onOpenProfile}
            />
          </div>
        </div>

        {/* Header Right: Follow button & Options Menu */}
        <div className="flex shrink-0 items-center gap-2">
          {dbUser && dbUser.id !== article.author.id && (
            <button
              type="button"
              onClick={toggleFollow}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer',
                followed
                  ? 'bg-muted text-foreground hover:bg-muted/80'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90'
              )}
            >
              {followed ? (
                <UserCheck className="h-3.5 w-3.5" />
              ) : (
                <UserPlus className="h-3.5 w-3.5" />
              )}
              <span>{followed ? t`Abonné` : t`Suivre`}</span>
            </button>
          )}

          {onHideArticle && (
            <Popover>
              <PopoverTrigger
                type="button"
                className="text-muted-foreground hover:text-foreground p-1 rounded-full transition-colors cursor-pointer"
                title={t`Plus d'options`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <MoreHorizontal className="h-4 w-4" />
              </PopoverTrigger>
              <PopoverContent
                align="end"
                sideOffset={8}
                onClick={(e) => e.stopPropagation()}
                className="w-56 rounded-xl border-border/40 bg-card p-1.5 shadow-xl"
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (window.confirm(t`Voir moins de contenu comme ça ?`)) {
                      onHideArticle(article);
                    }
                  }}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground cursor-pointer"
                >
                  <EyeOff className="h-3.5 w-3.5" />
                  <span>{t`Voir moins de contenu comme ça`}</span>
                </button>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>

      {/* 2. TITRE & EXPOSÉ */}
      <div onClick={openArticle} className="cursor-pointer group/title select-none">
        <h3 className="line-clamp-2 text-[19px] sm:text-[21px] font-bold leading-snug tracking-[-0.02em] text-foreground group-hover/title:text-primary transition-colors">
          {article.title}
        </h3>
        {excerpt && (
          <p className="mt-1.5 line-clamp-2 text-[13.5px] sm:text-[14px] leading-relaxed text-muted-foreground">
            {excerpt}
          </p>
        )}
      </div>

      {/* 3. COVER ARTWORK (Plein cadre, 100% libre et nette) */}
      {coverImage && (
        <div
          onClick={openArticle}
          className={cn(
            'relative w-full overflow-hidden rounded-[14px] bg-muted cursor-pointer border border-border/20',
            featured ? 'h-[240px] sm:h-[280px]' : 'h-[190px] sm:h-[220px]'
          )}
        >
          <Image
            src={coverImage}
            alt=""
            fill
            priority={featured}
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 720px"
          />
        </div>
      )}

      {/* 4. FOOTER D'ACTIONS & LECTURE */}
      <div className="flex items-center justify-between gap-3 pt-1 border-t border-border/30 text-xs text-muted-foreground">
        <div className="flex min-w-0 items-center gap-2.5">
          {article.category && (
            <span className="truncate font-medium text-foreground/85">{article.category.name}</span>
          )}
          {article.category && article.readingTime > 0 && <span>·</span>}
          {article.readingTime > 0 && (
            <span className="flex items-center gap-1 whitespace-nowrap">
              <Clock className="h-3.5 w-3.5" />
              {article.readingTime} min de lecture
            </span>
          )}
          {article.isPremium && (
            <span className="flex items-center gap-1 text-highlight font-medium">
              <Crown className="h-3.5 w-3.5 text-highlight" />
              Premium
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={toggleBookmark}
            className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
            title={t`Mettre en signet`}
          >
            {bookmarked ? (
              <BookMarked className="h-4 w-4 fill-primary text-primary" />
            ) : (
              <Bookmark className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={openArticle}
            className="rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
            title={t`Lire l'article`}
          >
            <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </article>
  );
}

ArticleCard.Root = ArticleCard;
ArticleCard.Footer = () => null;
