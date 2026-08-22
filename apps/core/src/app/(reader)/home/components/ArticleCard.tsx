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
import { routes } from '@qoe/config/routes';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@qoe/ui/ui/hover-card';
import { Popover, PopoverContent, PopoverTrigger } from '@qoe/ui/ui/popover';
import { AuthorAvatar } from '@qoe/ui/ui/AuthorAvatar';
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
  subdomain: string | null;
  customDomain: string | null;
  logoUrl: string | null;
  heroText: string | null;
  isCertified?: boolean;
  type?: 'PERSONAL' | 'MEDIA';
  journalist?: Journalist | null;
  coAuthors?: Journalist[];
  contributors?: Journalist[];
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
}

export interface ArticleCardProps {
  article: Article;
  idx: number;
  dbUser: { id?: string | null } | null;
  isBookmarked: boolean;
  isFollowed: boolean;
  isFollowedAuthor?: boolean;
  handleFollowToggle: (author: Author) => void;
  handleBookmarkToggle: (article: Article) => void;
  featured?: boolean;
  discovery?: boolean;
  onHideArticle?: (article: Article) => void;
  onOpenArticle?: (article: Article) => void;
  onOpenProfile?: (username: string) => void;
  onOpenPost?: (postId: string, authorUsername?: string) => void;
}

function plainText(content: string) {
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
        className="relative shrink-0 overflow-hidden rounded-[12px] border border-black/5 bg-muted"
        style={{ width: size, height: size }}
      >
        {author.logoUrl ? (
          <Image src={author.logoUrl} alt="" fill className="object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-xs font-semibold text-brand">
            {author.name?.slice(0, 2) || 'QO'}
          </span>
        )}
      </div>
    );
  }
  return <AuthorAvatar user={author} size={size >= 40 ? 'md' : 'sm'} showBadge={false} />;
}

type Contributor = Journalist & { isMedia?: boolean; handleOnly?: boolean };

function ContributorLine({ people }: { people: Contributor[] }) {
  if (people.length === 0) return null;

  return (
    <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-black/60 dark:text-white/60">
      <div className="flex shrink-0 items-center -space-x-1">
        {people.slice(0, 3).map((person) => (
          <div
            key={person.id}
            className={cn(
              'relative h-4 w-4 overflow-hidden border border-white/80 bg-muted dark:border-black/60',
              person.isMedia ? 'rounded-[4px]' : 'rounded-full'
            )}
          >
            {person.logoUrl ? (
              <Image src={person.logoUrl} alt="" fill className="object-cover" sizes="16px" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[6px] font-semibold text-primary">
                {(person.name || 'A').slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
        ))}
      </div>
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
    </div>
  );
}

export function ArticleCard({
  article,
  dbUser,
  isBookmarked,
  isFollowed,
  isFollowedAuthor = false,
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

  const articleUrl = article.author.subdomain
    ? routes.tenant.article(article.author.subdomain, article.slug)
    : routes.feed.article(article.slug);
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
  const useAuthorAsPrimary = isMedia && Boolean(journalist?.id && isFollowedAuthor);
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
    username: article.author.username || article.author.subdomain,
    logoUrl: article.author.logoUrl,
    isMedia: true,
    handleOnly: true,
  };
  const otherContributors = coAuthors.filter((coAuthor) => coAuthor.id !== journalist?.id);
  const secondaryPeople: Contributor[] = useAuthorAsPrimary
    ? [mediaContributor, ...otherContributors.map((coAuthor) => ({ ...coAuthor, isMedia: false }))]
    : isMedia
      ? journalist
        ? [
            { ...journalist, isMedia: false },
            ...otherContributors.map((coAuthor) => ({ ...coAuthor, isMedia: false })),
          ]
        : otherContributors.length > 0
          ? otherContributors.map((coAuthor) => ({ ...coAuthor, isMedia: false }))
          : [mediaContributor]
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
          <Image
            src={coverImage}
            alt=""
            fill
            priority={featured}
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.025]"
            sizes="(max-width: 768px) 100vw, 720px"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-muted-foreground/35 via-muted to-background" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/25" />

        <div className="absolute inset-x-3 top-3 flex items-center justify-between gap-3 rounded-[14px] bg-white/90 px-2.5 py-2 text-black shadow-none backdrop-blur-md dark:bg-black/75 dark:text-white">
          <div className="flex min-w-0 items-center gap-2.5">
            {discovery && (
              <span
                className="flex shrink-0 items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary"
                title={t`Sélection hors de ta bulle, choisie pour élargir tes horizons`}
              >
                ✦ {t`Découverte`}
              </span>
            )}
            <BrandAvatar author={primaryAuthor} size={40} />
            <div className="min-w-0 leading-tight">
              <HoverCard>
                <HoverCardTrigger>
                  <button
                    type="button"
                    onClick={openProfile}
                    className="flex max-w-full items-center gap-1.5 text-left"
                  >
                    <span className="truncate text-[15px] font-semibold tracking-[-0.02em]">
                      {primaryName}
                    </span>
                    {primaryIsCertified && <CertifiedBadge />}
                    <span className="text-[11px] font-normal text-black/55 dark:text-white/55">
                      · {date}
                    </span>
                  </button>
                </HoverCardTrigger>
                <HoverCardContent className="w-72 rounded-2xl border border-border/40 bg-card p-4 text-foreground shadow-xl">
                  <div className="flex gap-3">
                    <BrandAvatar author={primaryAuthor} size={40} />
                    <div>
                      <p className="text-sm font-semibold">{primaryName}</p>
                      <p className="text-xs text-muted-foreground">@{primaryHandle}</p>
                    </div>
                  </div>
                </HoverCardContent>
              </HoverCard>
              <ContributorLine people={secondaryPeople} />
            </div>
          </div>
          {dbUser && dbUser.id !== article.author.id && (
            <div className="flex shrink-0 items-center gap-2.5">
              <button
                type="button"
                onClick={toggleFollow}
                className="flex items-center gap-1.5 text-[11px] font-medium tracking-[0.02em]"
              >
                {followed ? <UserCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                <span>{followed ? t`Abonné` : t`Suivre`}</span>
              </button>
              {onHideArticle && (
                <Popover>
                  <PopoverTrigger
                    type="button"
                    className="text-black/45 transition-colors hover:text-black dark:text-white/45 dark:hover:text-white"
                    title={t`Plus d'options`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                  >
                    <MoreHorizontal className="h-5 w-5" />
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
          )}
        </div>
      </div>

      <a
        href={articleUrl}
        target="_blank"
        rel="noreferrer"
        onClick={openArticle}
        className="block px-1.5 pb-1 pt-3"
      >
        <h3 className="line-clamp-2 text-[21px] font-semibold leading-[1.08] tracking-[-0.04em] text-foreground">
          {article.title}
        </h3>
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
          <button
            type="button"
            onClick={openArticle}
            className="rounded-full p-1.5 hover:bg-muted"
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
