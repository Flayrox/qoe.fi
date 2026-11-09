'use client';

import React from 'react';
import {
  ArrowUpRight,
  BookMarked,
  Bookmark,
  Clock,
  Crown,
  Heart,
  MessageSquare,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { cn } from '@qoe/utils';
import { getArticleUrl } from '@qoe/config';
import { getCoverPlaceholder } from '@qoe/theme';
import type { FeedArticleDTO } from '@qoe/sdk/types';
import {
  useArticleShadow,
  updateArticleShadow,
  useActorShadow,
  updateActorShadow,
  withShadowMutation,
} from '@qoe/sdk';
import { RepostPopover } from './social/RepostPopover';
import { useRequireAuth } from './auth/AuthModalContext';
import { CertifiedBadge } from './ui/CertifiedBadge';
import { SafeAvatar } from './SafeAvatar';
import { SafeImage } from './SafeImage';
import { ProfileHoverCard } from './social/ProfileHoverCard';
import { EntityActionMenu } from './social/EntityActionMenu';
import { t } from '@lingui/core/macro';

export type ArticleCardArticle = Omit<
  FeedArticleDTO,
  'published' | 'content' | 'category' | 'author'
> & {
  published?: boolean;
  content?: string | null;
  liked?: boolean;
  likesCount?: number;
  reposted?: boolean;
  repostsCount?: number;
  isBookmarked?: boolean;
  bookmarked?: boolean;
  publication?: {
    id: string;
    name: string;
    slug?: string | null;
    subdomain?: string | null;
    customDomain?: string | null;
    logoUrl?: string | null;
    type?: string | null;
  } | null;
  author: Omit<FeedArticleDTO['author'], 'type' | 'subdomain' | 'customDomain' | 'heroText'> & {
    type?: 'PERSONAL' | 'MEDIA' | string | null;
    subdomain?: string | null;
    customDomain?: string | null;
    heroText?: string | null;
    isFollowed?: boolean;
    viewerFollows?: boolean;
    /** État relationnel calculé par Go (voir PostCapabilities). */
    isMuted?: boolean;
    isBlocked?: boolean;
  };
  category?: {
    name: string;
    slug?: string;
    parent?: { name: string; slug?: string } | null;
  } | null;
};

export type { FeedArticleDTO as Article };

export interface ArticleCardProps {
  article: ArticleCardArticle;
  idx?: number;
  dbUser?: {
    id?: string | null;
    email?: string | null;
    name?: string | null;
    avatarUrl?: string | null;
  } | null;
  isFollowed?: boolean;
  isFollowedAuthor?: boolean;
  disableAuthorOverride?: boolean;
  isBookmarked?: boolean;
  handleFollowToggle?: (author: ArticleCardArticle['author']) => void | Promise<unknown>;
  handleBookmarkToggle?: (article: ArticleCardArticle) => void | Promise<unknown>;
  onRepostToggle?: (article: ArticleCardArticle) => void | Promise<unknown>;
  onLikeToggle?: (article: ArticleCardArticle) => void | Promise<unknown>;
  handleLikeToggle?: (article: ArticleCardArticle) => void | Promise<unknown>;
  onQuoteArticle?: (article: ArticleCardArticle) => void;
  featured?: boolean;
  discovery?: boolean;
  isPreview?: boolean;
  onHideArticle?: (article: ArticleCardArticle) => void;
  onOpenArticle?: (article: ArticleCardArticle) => void;
  onOpenProfile?: (username: string) => void;
  onOpenPost?: (id: string) => void;
}

function ProfileMark({
  author,
  size = 40,
}: {
  author: ArticleCardArticle['author'];
  size?: number;
}) {
  return (
    <SafeAvatar
      id={author.id}
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
  isMediaByline = false,
  onOpenProfile,
}: {
  people: SharedContributor[];
  forMedia?: SharedContributor | null;
  isMediaByline?: boolean;
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
            side="bottom"
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
              side="bottom"
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
                        side="bottom"
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
        ) : isMediaByline ? (
          <>
            <span>{t`par`}</span>
            {people.slice(0, 1).map((person) => {
              const pHandle = person.username || person.id.slice(0, 8);
              return (
                <ProfileHoverCard
                  key={person.id}
                  user={{
                    id: person.id,
                    name: person.name,
                    username: person.username,
                    logoUrl: person.logoUrl,
                    isCertified: person.isCertified,
                    isMedia: false,
                    type: 'PERSONAL',
                  }}
                  side="bottom"
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
              );
            })}
            {people.length > 1 && (
              <>
                <span>{t`, avec`}</span>
                {people.slice(1, 3).map((person, idx) => {
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
                        side="bottom"
                        onOpenProfile={onOpenProfile}
                      >
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenProfile?.(pHandle);
                          }}
                          className="font-medium text-foreground/80 hover:underline cursor-pointer"
                        >
                          {person.handleOnly
                            ? `@${pHandle}`
                            : `${person.name || 'Auteur'} @${pHandle}`}
                        </span>
                      </ProfileHoverCard>
                    </React.Fragment>
                  );
                })}
              </>
            )}
            {people.length > 3 && <span>+{people.length - 3}</span>}
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
                    side="bottom"
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
  article: rawArticle,
  dbUser,
  isFollowed = false,
  isFollowedAuthor = false,
  disableAuthorOverride = false,
  isBookmarked = false,
  handleFollowToggle,
  handleBookmarkToggle,
  onRepostToggle,
  onLikeToggle,
  handleLikeToggle,
  onQuoteArticle,
  featured = false,
  discovery = false,
  isPreview = false,
  onHideArticle,
  onOpenArticle,
  onOpenProfile,
  onOpenPost,
}: ArticleCardProps) {
  const { withAuth } = useRequireAuth();

  const articleWithProps = React.useMemo(
    () => ({
      ...rawArticle,
      isBookmarked: isBookmarked ?? rawArticle.isBookmarked,
    }),
    [rawArticle, isBookmarked]
  );
  const shadowedArticle = useArticleShadow(articleWithProps);

  const authorWithProps = React.useMemo(
    () => ({
      ...shadowedArticle.author,
      isFollowed: isFollowed ?? shadowedArticle.author.isFollowed,
    }),
    [shadowedArticle.author, isFollowed]
  );
  const shadowedAuthor = useActorShadow(authorWithProps);

  const article: ArticleCardArticle = React.useMemo(
    () => ({
      ...shadowedArticle,
      author: {
        ...shadowedArticle.author,
        ...shadowedAuthor,
      },
    }),
    [shadowedArticle, shadowedAuthor]
  );

  const bookmarked = article.isBookmarked ?? false;
  const followed = shadowedAuthor.isFollowed ?? isFollowed;
  const liked = article.liked ?? false;
  const likesCount = article.likesCount ?? 0;
  const reposted = article.reposted ?? false;
  const repostsCount = article.repostsCount ?? 0;

  const isThought = !article.title;
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
    username: article.author.username || article.author.subdomain || null,
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
  const authorLabel = (article.author.name ?? '').trim().toLowerCase();
  const mediaLabel = (article.publication?.name ?? '').trim().toLowerCase();
  const isAuthorTheMedia = authorLabel !== '' && authorLabel === mediaLabel;
  const profileMedia: SharedContributor | null =
    disableAuthorOverride && isMedia && !isAuthorTheMedia
      ? article.publication
        ? {
            id: article.publication.id,
            name: article.publication.name,
            username: article.publication.subdomain ?? null,
            logoUrl: article.publication.logoUrl ?? null,
            isMedia: true,
            handleOnly: true,
          }
        : mediaContributor
      : null;
  const linePeople: SharedContributor[] = profileMedia
    ? otherContributors.map((coAuthor) => ({ ...coAuthor, isMedia: false }))
    : secondaryPeople;
  const fallbackLogo = useAuthorAsPrimary ? journalist?.logoUrl : article.author.logoUrl;
  const rawCover = article.imageUrl?.includes('unsplash') ? null : article.imageUrl;
  const rawFallback = fallbackLogo?.includes('unsplash') ? null : fallbackLogo;
  const coverImage =
    rawCover ||
    rawFallback ||
    (dbUser !== undefined ? getCoverPlaceholder(article.id || article.slug) : null);
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
  const articleOwner = article.publication?.slug || article.publication?.subdomain || primaryHandle;
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
      const articleWithResolvedAuthor: ArticleCardArticle = {
        ...article,
        author: {
          ...primaryAuthor,
          username: primaryAuthor.username || primaryHandle,
        },
      };
      onOpenArticle(articleWithResolvedAuthor);
    } else if (onOpenPost) {
      event.preventDefault();
      event.stopPropagation();
      onOpenPost(article.id);
    } else {
      window.location.href = url;
    }
  };

  const toggleBookmark = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const previousBookmarked = bookmarked;
    const nextBookmarked = !bookmarked;

    void withShadowMutation({
      lockKey: `article:${article.id}:bookmark`,
      optimisticUpdate: () => {
        updateArticleShadow(article.id, { bookmarked: nextBookmarked });
      },
      rollback: () => {
        updateArticleShadow(article.id, { bookmarked: previousBookmarked });
      },
      mutation: async () => {
        await handleBookmarkToggle?.(article);
      },
    });
  };

  const toggleFollow = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const previousFollowed = followed;
    const nextFollowed = !followed;
    const authorId = article.author?.id;
    const authorUsername = article.author?.username;

    void withShadowMutation({
      lockKey: `article:${article.id}:follow`,
      optimisticUpdate: () => {
        if (authorId) updateActorShadow(authorId, { followed: nextFollowed });
        if (authorUsername) updateActorShadow(authorUsername, { followed: nextFollowed });
      },
      rollback: () => {
        if (authorId) updateActorShadow(authorId, { followed: previousFollowed });
        if (authorUsername) updateActorShadow(authorUsername, { followed: previousFollowed });
      },
      mutation: async () => {
        await handleFollowToggle?.(article.author);
      },
    });
  };

  const toggleLike = withAuth(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const previousLiked = liked;
      const nextLiked = !liked;

      void withShadowMutation({
        lockKey: `article:${article.id}:like`,
        optimisticUpdate: () => {
          updateArticleShadow(article.id, { liked: nextLiked });
        },
        rollback: () => {
          updateArticleShadow(article.id, { liked: previousLiked });
        },
        mutation: async () => {
          if (onLikeToggle) {
            await onLikeToggle(article);
          } else if (handleLikeToggle) {
            await handleLikeToggle(article);
          }
        },
      });
    },
    { actionContext: 'like' }
  );

  const toggleRepost = withAuth(
    (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const previousReposted = reposted;
      const nextReposted = !reposted;

      void withShadowMutation({
        lockKey: `article:${article.id}:repost`,
        optimisticUpdate: () => {
          updateArticleShadow(article.id, { reposted: nextReposted });
        },
        rollback: () => {
          updateArticleShadow(article.id, { reposted: previousReposted });
        },
        mutation: async () => {
          await onRepostToggle?.(article);
        },
      });
    },
    { actionContext: 'repost' }
  );

  const handleQuoteArticle = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (onQuoteArticle) {
      onQuoteArticle(article);
    } else if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('open-composer', {
          detail: {
            quotedArticle: {
              id: article.id,
              title: article.title,
              slug: article.slug,
              content: article.content,
              author: {
                ...article.author,
                subdomain: article.author.subdomain || article.publication?.subdomain,
                customDomain: article.author.customDomain || article.publication?.customDomain,
              },
            },
          },
        })
      );
    }
  };

  if (isThought) return null;

  const showFeedFollowControls = Boolean(
    dbUser && dbUser.id !== article.author.id && handleFollowToggle
  );

  return (
    <article
      data-overlay-anchor={article.id}
      className={cn(
        'group relative bg-card shadow-none transition-colors border border-border/30 hover:border-border/60',
        'rounded-[24px] p-2.5 sm:p-3 flex flex-col',
        'hover:z-20 has-[[data-slot=hover-card-content]]:z-30',
        featured && 'rounded-[28px]'
      )}
    >
      {/* 1. COVER IMAGE AVEC CAPSULE AUTEUR FLOTTANTE */}
      <div
        data-article-cover
        onClick={openArticle}
        className={cn(
          'relative rounded-[17px] bg-muted cursor-pointer',
          featured ? 'h-[250px]' : 'h-[205px]'
        )}
      >
        <div className="absolute inset-0 overflow-hidden rounded-[17px]">
          {coverImage ? (
            <SafeImage
              src={coverImage}
              alt={article.title || ''}
              fill
              priority={featured}
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 720px"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-muted-foreground/35 via-muted to-background" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/25 pointer-events-none" />
        </div>

        {/* Capsule flottante en verre dépoli (Auteur, Profil, Follow/Action) */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-x-3 top-3 z-10 flex items-center justify-between gap-3 rounded-[14px] bg-white/90 px-2.5 py-2 text-black shadow-none backdrop-blur-md dark:bg-black/75 dark:text-white"
        >
          <div className="flex min-w-0 items-center gap-2.5 text-left">
            {discovery && (
              <span
                className="flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary"
                title={t`Sélection hors de ta bulle, choisie pour élargir tes horizons`}
              >
                ✦ {t`Découverte`}
              </span>
            )}
            <ProfileHoverCard user={primaryAuthor} onOpenProfile={onOpenProfile} side="bottom">
              <ProfileMark author={primaryAuthor} size={40} />
            </ProfileHoverCard>
            <div className="min-w-0 leading-tight">
              <div className="flex max-w-full items-center gap-1.5 text-left">
                <ProfileHoverCard user={primaryAuthor} onOpenProfile={onOpenProfile} side="bottom">
                  <span
                    onClick={openProfile}
                    className="truncate text-[15px] font-semibold tracking-[-0.02em] hover:underline cursor-pointer text-foreground dark:text-white"
                  >
                    {primaryName}
                  </span>
                </ProfileHoverCard>
                {(primaryPerson?.isCertified || article.author.isCertified) && <CertifiedBadge />}
                <span className="text-[11px] font-normal text-muted-foreground dark:text-white/60">
                  · {date}
                </span>
              </div>
              <SharedContributorLine
                people={linePeople}
                forMedia={useAuthorAsPrimary ? mediaContributor : profileMedia}
                isMediaByline={isMedia && !useAuthorAsPrimary}
                onOpenProfile={onOpenProfile}
              />
            </div>
          </div>

          {showFeedFollowControls ? (
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={toggleFollow}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold transition-colors cursor-pointer',
                  followed
                    ? 'bg-muted/80 text-foreground hover:bg-muted dark:bg-white/20 dark:text-white dark:hover:bg-white/30'
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

              {onHideArticle && (
                <EntityActionMenu
                  surface="article-card-menu"
                  context={{
                    entityType: 'article',
                    entityId: article.id,
                    url,
                    text: article.title,
                    isBookmarked: bookmarked,
                    author: {
                      id: primaryAuthor.id,
                      username: primaryAuthor.username,
                      subdomain: primaryAuthor.subdomain,
                      name: primaryAuthor.name,
                      isMuted: primaryAuthor.isMuted,
                      isBlocked: primaryAuthor.isBlocked,
                    },
                    viewerId: dbUser?.id ?? null,
                    capabilities: article.capabilities,
                  }}
                  triggerClassName="text-black/60 transition-colors hover:text-black dark:text-white/60 dark:hover:text-white"
                  onShowLessClick={() => {
                    if (onHideArticle && window.confirm(t`Voir moins de contenu comme ça ?`)) {
                      onHideArticle(article);
                    }
                  }}
                />
              )}
            </div>
          ) : (
            !isPreview && (
              <button
                type="button"
                onClick={openProfile}
                className="shrink-0 px-3 py-1 rounded-full bg-muted/80 hover:bg-muted text-foreground dark:bg-white/20 dark:hover:bg-white/30 dark:text-white text-[11px] font-semibold transition-colors cursor-pointer"
              >
                {t`Profil`}
              </button>
            )
          )}
        </div>
      </div>

      {/* 2. TITRE & EXTRAIT SOUS L'IMAGE */}
      <a
        href={url}
        data-article-link
        data-article-slug={article.slug}
        data-article-title={article.title}
        data-article-owner={articleOwner}
        onClick={openArticle}
        className="block px-1.5 pb-1 pt-3 cursor-pointer group/title"
      >
        <h2 className="line-clamp-2 text-[21px] font-semibold leading-[1.12] tracking-[-0.03em] text-foreground group-hover/title:text-primary transition-colors">
          {article.title}
        </h2>
        {excerpt && (
          <p className="mt-1.5 line-clamp-2 text-[13.5px] leading-relaxed text-muted-foreground">
            {excerpt}
          </p>
        )}
      </a>

      {/* 3. FOOTER D'ACTIONS & LECTURE */}
      <div className="flex items-center justify-between gap-3 border-t border-border/30 px-1.5 pt-2.5 text-xs text-muted-foreground mt-auto">
        <div className="flex min-w-0 items-center gap-2.5">
          {article.category && (
            <span className="truncate text-foreground/80 inline-flex items-center gap-1">
              {article.category.parent && (
                <>
                  <span className="text-muted-foreground/80 font-normal">
                    {article.category.parent.name}
                  </span>
                  <span className="text-muted-foreground/50 text-[10px]">›</span>
                </>
              )}
              <span>{article.category.name}</span>
            </span>
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
                  'flex items-center gap-1 rounded-full p-1.5 hover:bg-muted transition-colors cursor-pointer',
                  liked && 'text-primary'
                )}
                title={t`Aimer`}
              >
                <Heart className={cn('h-4 w-4', liked && 'fill-current')} />
                {likesCount > 0 && <span>{likesCount}</span>}
              </button>
              <RepostPopover
                reposted={reposted}
                repostsCount={repostsCount}
                targetType="article"
                onRepost={toggleRepost}
                onQuote={handleQuoteArticle}
                triggerClass="rounded-full p-1.5 hover:bg-muted transition-colors"
                iconClass="h-4 w-4"
                textClass="text-xs"
              />
              <button
                type="button"
                onClick={() => onOpenPost?.(article.id)}
                className="rounded-full p-1.5 hover:bg-muted transition-colors cursor-pointer"
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
              className="rounded-full p-1.5 hover:bg-muted transition-colors cursor-pointer"
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
            data-article-link
            data-article-slug={article.slug}
            data-article-title={article.title}
            data-article-owner={articleOwner}
            className="rounded-full p-1.5 hover:bg-muted transition-colors cursor-pointer"
            title={t`Lire l'article`}
          >
            <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </article>
  );
}
