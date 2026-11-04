'use client';

import React, { useState } from 'react';
import {
  ArrowUpRight,
  BookMarked,
  Bookmark,
  Clock,
  Heart,
  MessageSquare,
  Repeat,
} from 'lucide-react';
import { cn } from '@qoe/utils';
import { getArticleUrl } from '@qoe/config';
import type { FeedArticleDTO } from '@qoe/sdk/types';
import { useRequireAuth } from './auth/AuthModalContext';
import { Badge } from './primitives/badge/badge';
import { Button } from './primitives/button/button';
import { Tooltip } from './primitives/tooltip/tooltip';
import { CertifiedBadge } from './ui/CertifiedBadge';
import { SafeAvatar } from './SafeAvatar';
import { SafeImage } from './SafeImage';
import { ProfileHoverCard } from './social/ProfileHoverCard';
import { t } from '@lingui/core/macro';

// =====================================================================
// 📰 ArticleCard — carte éditoriale unifiée du feed
// =====================================================================
// 📖 Même grammaire que `QuotedArticleCard` et `ThoughtCard` :
//    1. Surface sobre du contrat (`rounded-panel border-border/50 bg-card`),
//       sans capsule en verre dépoli ni couleurs brutes `white` / `black`.
//    2. Identité en tête : cercle pour une personne, carré adouci pour un
//       média (`SafeAvatar`), survol de profil (`ProfileHoverCard`) et ligne
//       de co-auteurs (`SharedContributorLine`).
//    3. Couverture optionnelle : rendue UNIQUEMENT quand `article.imageUrl`
//       est défini — un article sans illustration est une pièce typographique,
//       jamais un rectangle gris vide ni un avatar étiré en 16/9.
//    4. Actions sur les primitives du contrat (`Button` + `Tooltip`).
// =====================================================================

export type { FeedArticleDTO as Article };

export interface ArticleCardProps {
  article: FeedArticleDTO & {
    reposted?: boolean;
    repostsCount?: number;
  };
  isFollowedAuthor?: boolean;
  disableAuthorOverride?: boolean;
  isBookmarked?: boolean;
  handleBookmarkToggle?: (article: FeedArticleDTO) => void;
  onLikeToggle?: (article: FeedArticleDTO, event: React.MouseEvent) => void;
  onRepostToggle?: (article: FeedArticleDTO, event: React.MouseEvent) => void;
  featured?: boolean;
  isPreview?: boolean;
  onOpenArticle?: (article: FeedArticleDTO) => void;
  onOpenProfile?: (username: string) => void;
  onOpenPost?: (id: string) => void;
  className?: string;
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
    <span className="mt-0.5 flex min-w-0 items-center gap-1.5 truncate type-control-xs text-muted-foreground font-sans">
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
              id={person.id}
              src={person.logoUrl}
              name={person.name}
              username={person.username}
              size={16}
              type={person.isMedia ? 'MEDIA' : 'PERSONAL'}
              className="shrink-0 border border-border/70"
            />
          </ProfileHoverCard>
        ))}
      </span>
      <span className="flex flex-wrap items-center gap-1 truncate">
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
                  if (!onOpenProfile) return;
                  e.preventDefault();
                  e.stopPropagation();
                  onOpenProfile(forMedia.username || forMedia.id);
                }}
                className="cursor-pointer font-semibold text-foreground/90 transition-colors hover:text-brand"
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
                            if (!onOpenProfile) return;
                            e.preventDefault();
                            e.stopPropagation();
                            onOpenProfile(pHandle);
                          }}
                          className="cursor-pointer font-medium text-foreground/80 transition-colors hover:text-brand"
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
                        if (!onOpenProfile) return;
                        e.preventDefault();
                        e.stopPropagation();
                        onOpenProfile(pHandle);
                      }}
                      className="cursor-pointer font-medium text-foreground/80 transition-colors hover:text-brand"
                    >
                      {person.handleOnly ? `@${pHandle}` : `${person.name || t`Auteur`}`}
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
  onLikeToggle,
  onRepostToggle,
  featured = false,
  isPreview = false,
  onOpenArticle,
  onOpenProfile,
  onOpenPost,
  className,
}: ArticleCardProps) {
  const { withAuth } = useRequireAuth();
  const [bookmarked, setBookmarked] = useState(isBookmarked);
  const [liked, setLiked] = useState(article.liked || false);
  const [likesCount, setLikesCount] = useState(article.likesCount || 0);
  const [reposted, setReposted] = useState(article.reposted || false);
  const [repostsCount, setRepostsCount] = useState(article.repostsCount || 0);

  if (!article.title) return null;

  const authorHandle = article.author.username || article.author.subdomain || 'qoefi';
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
  const primaryName = primaryPerson?.name || article.author?.name || t`Auteur`;
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

  // Règle éditoriale : seule une vraie image de couverture est affichée.
  // On n'étire jamais l'avatar de l'auteur en 16/9, et on ne rend pas de
  // rectangle vide quand l'article est purement textuel.
  const coverImage = article.imageUrl?.trim() ? article.imageUrl : null;

  const excerpt = article.content
    ? article.content
        .replace(/<[^>]*>?/gm, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/\s+/g, ' ')
        .trim()
    : '';

  const parsedDate = new Date(article.createdAt);
  const date = Number.isNaN(parsedDate.getTime())
    ? ''
    : parsedDate.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
  const url = getArticleUrl(article, { preferTenant: true });
  const repliesCount = article.repliesCount || 0;

  const openProfile = (event: React.MouseEvent) => {
    if (!onOpenProfile) return;
    event.preventDefault();
    event.stopPropagation();
    onOpenProfile(primaryHandle);
  };

  const openArticle = (event: React.MouseEvent) => {
    if (onOpenArticle) {
      event.preventDefault();
      event.stopPropagation();
      onOpenArticle(article);
    } else if (typeof window !== 'undefined') {
      window.location.assign(url);
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
      onLikeToggle?.(article, event);
    },
    { actionContext: 'like' }
  );

  const toggleRepost = withAuth(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setReposted((value) => !value);
      setRepostsCount((value) => (reposted ? Math.max(0, value - 1) : value + 1));
      onRepostToggle?.(article, event);
    },
    { actionContext: 'repost' }
  );

  return (
    <article
      data-article-card={article.id}
      data-featured={featured ? 'true' : undefined}
      className={cn(
        'group/article relative flex flex-col rounded-panel border border-border/50 bg-card p-4 transition-colors duration-200 hover:border-border sm:p-5',
        featured && 'border-border/70 sm:p-6',
        className
      )}
    >
      {/* 1. EN-TÊTE UNIFIÉ : auteur / média, date et statut payant */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <ProfileHoverCard user={primaryAuthor} onOpenProfile={onOpenProfile}>
            <SafeAvatar
              id={primaryAuthor.id}
              src={primaryAuthor.logoUrl}
              name={primaryName}
              username={primaryHandle}
              type={primaryAuthor.type}
              size={36}
              className="shrink-0 border border-border/40"
            />
          </ProfileHoverCard>

          <div className="min-w-0 leading-tight">
            <div className="flex max-w-full items-center gap-1.5">
              <ProfileHoverCard user={primaryAuthor} onOpenProfile={onOpenProfile}>
                <span
                  onClick={openProfile}
                  className={cn(
                    'truncate text-sm font-semibold tracking-tight text-foreground transition-colors hover:text-brand',
                    onOpenProfile && 'cursor-pointer'
                  )}
                >
                  {primaryName}
                </span>
              </ProfileHoverCard>
              {(primaryPerson?.isCertified || article.author.isCertified) && <CertifiedBadge />}
              {date && (
                <span className="shrink-0 type-control-xs text-muted-foreground">· {date}</span>
              )}
            </div>
            <SharedContributorLine
              people={secondaryPeople}
              forMedia={useAuthorAsPrimary ? mediaContributor : null}
              onOpenProfile={onOpenProfile}
            />
          </div>
        </div>

        {article.isPremium && (
          <Badge tone="vivid" variant="outline" size="xs">
            {t`Payant`}
          </Badge>
        )}
      </div>

      {/* 2. COUVERTURE OPTIONNELLE — absente si l'article n'a pas d'image */}
      {coverImage && (
        <div
          data-article-cover
          onClick={openArticle}
          className={cn(
            'relative mt-3.5 cursor-pointer overflow-hidden rounded-lg border border-border/30 bg-muted/30',
            featured ? 'aspect-video' : 'aspect-[2/1]'
          )}
        >
          <SafeImage
            src={coverImage}
            alt={article.title || ''}
            fill
            priority={featured}
            className="object-cover transition-transform duration-300 group-hover/article:scale-[1.01]"
            sizes="(max-width: 768px) 100vw, 720px"
          />
        </div>
      )}

      {/* 3. TITRE & EXTRAIT */}
      <a
        href={url}
        target={onOpenArticle ? undefined : '_blank'}
        rel={onOpenArticle ? undefined : 'noreferrer'}
        onClick={openArticle}
        className="group/title mt-3.5 block cursor-pointer select-none"
      >
        <h2
          className={cn(
            'line-clamp-2 font-semibold leading-snug tracking-tight text-foreground transition-colors group-hover/title:text-brand',
            featured ? 'text-xl sm:text-[22px]' : 'text-lg sm:text-[19px]'
          )}
        >
          {article.title}
        </h2>
        {excerpt && (
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {excerpt}
          </p>
        )}
      </a>

      {/* 4. PIED DE CARTE : métadonnées de lecture & actions du contrat */}
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/30 pt-3 type-control-xs text-muted-foreground">
        <div className="flex min-w-0 items-center gap-2">
          {article.category && (
            <Badge variant="soft" tone="neutral" size="xs" className="max-w-36 truncate">
              {article.category.name}
            </Badge>
          )}
          {article.readingTime > 0 && (
            <span className="flex items-center gap-1 whitespace-nowrap">
              <Clock className="size-3.5" strokeWidth={1.75} aria-hidden />
              {article.readingTime} {t`min`}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          {!isPreview && (
            <>
              <Tooltip content={t`Aimer`}>
                <Button
                  variant="ghost"
                  size="xs"
                  shape={likesCount > 0 ? 'default' : 'icon'}
                  tone={liked ? 'brand' : 'neutral'}
                  onClick={toggleLike}
                  aria-label={t`Aimer`}
                  aria-pressed={liked}
                >
                  <Heart className={cn(liked && 'fill-current')} strokeWidth={1.75} />
                  {likesCount > 0 && <span className="tabular-nums">{likesCount}</span>}
                </Button>
              </Tooltip>

              <Tooltip content={t`Repartager`}>
                <Button
                  variant="ghost"
                  size="xs"
                  shape={repostsCount > 0 ? 'default' : 'icon'}
                  tone={reposted ? 'success' : 'neutral'}
                  onClick={toggleRepost}
                  aria-label={t`Repartager`}
                  aria-pressed={reposted}
                >
                  <Repeat strokeWidth={1.75} />
                  {repostsCount > 0 && <span className="tabular-nums">{repostsCount}</span>}
                </Button>
              </Tooltip>

              <Tooltip content={t`Commenter`}>
                <Button
                  variant="ghost"
                  size="xs"
                  shape={repliesCount > 0 ? 'default' : 'icon'}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onOpenPost?.(article.id);
                  }}
                  aria-label={t`Commenter`}
                >
                  <MessageSquare strokeWidth={1.75} />
                  {repliesCount > 0 && <span className="tabular-nums">{repliesCount}</span>}
                </Button>
              </Tooltip>
            </>
          )}

          {handleBookmarkToggle && (
            <Tooltip content={t`Mettre en signet`}>
              <Button
                variant="ghost"
                size="xs"
                shape="icon"
                tone={bookmarked ? 'brand' : 'neutral'}
                onClick={toggleBookmark}
                aria-label={t`Mettre en signet`}
                aria-pressed={bookmarked}
              >
                {bookmarked ? (
                  <BookMarked className="fill-current" strokeWidth={1.75} />
                ) : (
                  <Bookmark strokeWidth={1.75} />
                )}
              </Button>
            </Tooltip>
          )}

          <Tooltip content={t`Lire l'article`}>
            <Button
              variant="ghost"
              size="xs"
              shape="icon"
              onClick={openArticle}
              aria-label={t`Lire l'article`}
            >
              <ArrowUpRight strokeWidth={1.75} />
            </Button>
          </Tooltip>
        </div>
      </div>
    </article>
  );
}
