'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@qoe/utils';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '../ui/hover-card';
import { SafeAvatar } from '../SafeAvatar';
import { CertifiedBadge } from '../ui/CertifiedBadge';
import { routes } from '@qoe/config/routes';
import { t } from '@lingui/core/macro';
import { toggleFollowCreatorHomeAction, resolveProfileAction } from '@qoe/sdk/actions/feed';
import { Building2, UserPlus, UserCheck, Loader2 } from 'lucide-react';

export interface ProfileHoverUserData {
  id?: string;
  name?: string | null;
  username?: string | null;
  subdomain?: string | null;
  customDomain?: string | null;
  logoUrl?: string | null;
  headerImageUrl?: string | null;
  bannerUrl?: string | null;
  heroText?: string | null;
  bio?: string | null;
  isCertified?: boolean;
  isFollowing?: boolean;
  isMedia?: boolean;
  type?: 'PERSONAL' | 'MEDIA' | string | null;
  _count?: {
    followers?: number;
    following?: number;
    articles?: number;
  };
  followersCount?: number;
  followingCount?: number;
  articlesCount?: number;
}

export interface ProfileHoverCardProps {
  user?: ProfileHoverUserData | null;
  username?: string;
  children: React.ReactNode;
  onOpenProfile?: (username: string) => void;
  onFollowToggle?: (userId: string, followed: boolean) => void;
  className?: string;
}

// ── In-Memory client cache for resolved profiles ────────────────────
const profileHoverCache = new Map<
  string,
  {
    name?: string | null;
    username?: string | null;
    logoUrl?: string | null;
    headerImageUrl?: string | null;
    heroText?: string | null;
    isCertified?: boolean;
    isFollowing?: boolean;
    isMedia?: boolean;
    followersCount?: number;
    followingCount?: number;
    articlesCount?: number;
  }
>();

function getGradientFromHandle(handle: string): string {
  let hash = 0;
  for (let i = 0; i < handle.length; i++) {
    hash = handle.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h1 = Math.abs(hash) % 360;
  const h2 = (h1 + 45) % 360;
  return `linear-gradient(135deg, hsl(${h1}, 65%, 38%) 0%, hsl(${h2}, 75%, 22%) 100%)`;
}

export function ProfileHoverCard({
  user,
  username: propUsername,
  children,
  onOpenProfile,
  onFollowToggle,
  className,
}: ProfileHoverCardProps) {
  const handle =
    propUsername || user?.username || user?.subdomain || user?.id?.slice(0, 8) || 'user';
  const cleanHandle = handle.replace(/^@/, '');

  // Cached profile data fallback
  const cached = profileHoverCache.get(cleanHandle.toLowerCase());

  const [name, setName] = useState<string>(user?.name || cached?.name || cleanHandle);
  const [avatarUrl, setAvatarUrl] = useState<string | null | undefined>(
    user?.logoUrl ?? cached?.logoUrl
  );
  const [bannerUrl, setBannerUrl] = useState<string | null | undefined>(
    user?.headerImageUrl ?? user?.bannerUrl ?? cached?.headerImageUrl
  );
  const [bio, setBio] = useState<string | null | undefined>(
    user?.heroText ?? user?.bio ?? cached?.heroText
  );
  const [isCertified, setIsCertified] = useState<boolean>(
    user?.isCertified ?? cached?.isCertified ?? false
  );
  const [isMedia, setIsMedia] = useState<boolean>(
    user?.isMedia ?? (user?.type ? user.type === 'MEDIA' : (cached?.isMedia ?? false))
  );
  const [isFollowing, setIsFollowing] = useState<boolean>(
    user?.isFollowing ?? cached?.isFollowing ?? false
  );
  const [followersCount, setFollowersCount] = useState<number>(
    user?.followersCount ?? user?._count?.followers ?? cached?.followersCount ?? 0
  );
  const [followingCount, setFollowingCount] = useState<number>(
    user?.followingCount ?? user?._count?.following ?? cached?.followingCount ?? 0
  );
  const [articlesCount, setArticlesCount] = useState<number | undefined>(
    user?.articlesCount ?? user?._count?.articles ?? cached?.articlesCount
  );
  const [isFollowLoading, setIsFollowLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  // Sync props when user prop updates
  useEffect(() => {
    if (user?.name) setName(user.name);
    if (user?.logoUrl !== undefined) setAvatarUrl(user.logoUrl);
    if (user?.headerImageUrl !== undefined || user?.bannerUrl !== undefined) {
      setBannerUrl(user.headerImageUrl ?? user.bannerUrl);
    }
    if (user?.heroText !== undefined || user?.bio !== undefined) {
      setBio(user.heroText ?? user.bio);
    }
    if (user?.isCertified !== undefined) setIsCertified(user.isCertified);
    if (user?.isMedia !== undefined || user?.type !== undefined) {
      setIsMedia(user.isMedia ?? user.type === 'MEDIA');
    }
    if (user?.isFollowing !== undefined) setIsFollowing(user.isFollowing);
    if (user?.followersCount !== undefined || user?._count?.followers !== undefined) {
      setFollowersCount(user.followersCount ?? user._count?.followers ?? 0);
    }
    if (user?.followingCount !== undefined || user?._count?.following !== undefined) {
      setFollowingCount(user.followingCount ?? user._count?.following ?? 0);
    }
    if (user?.articlesCount !== undefined || user?._count?.articles !== undefined) {
      setArticlesCount(user.articlesCount ?? user._count?.articles);
    }
  }, [user]);

  // Lazy fetch full details on open if counts/bio missing
  const handleOpenChange = useCallback(
    async (open: boolean) => {
      if (!open || hasFetched || cleanHandle === 'user') return;

      const cacheKey = cleanHandle.toLowerCase();
      if (profileHoverCache.has(cacheKey)) {
        const data = profileHoverCache.get(cacheKey)!;
        if (data.name) setName(data.name);
        if (data.logoUrl) setAvatarUrl(data.logoUrl);
        if (data.headerImageUrl) setBannerUrl(data.headerImageUrl);
        if (data.heroText) setBio(data.heroText);
        if (data.isCertified !== undefined) setIsCertified(data.isCertified);
        if (data.isMedia !== undefined) setIsMedia(data.isMedia);
        if (data.isFollowing !== undefined) setIsFollowing(data.isFollowing);
        if (data.followersCount !== undefined) setFollowersCount(data.followersCount);
        if (data.followingCount !== undefined) setFollowingCount(data.followingCount);
        if (data.articlesCount !== undefined) setArticlesCount(data.articlesCount);
        return;
      }

      try {
        setHasFetched(true);
        const res = await resolveProfileAction(cleanHandle);
        if (res && 'data' in res && res.data && res.data.profileUser) {
          const p = res.data.profileUser;
          const resolvedData = {
            name: p.name || cleanHandle,
            username: p.username || cleanHandle,
            logoUrl: p.logoUrl,
            headerImageUrl: p.headerImageUrl,
            heroText: p.heroText,
            isCertified: p.isCertified,
            isFollowing: res.data.isFollowing ?? false,
            isMedia: p.type === 'MEDIA',
            followersCount: p._count?.followers ?? 0,
            followingCount: p._count?.following ?? 0,
            articlesCount: p._count?.articles ?? 0,
          };
          profileHoverCache.set(cacheKey, resolvedData);

          setName(resolvedData.name);
          setAvatarUrl(resolvedData.logoUrl);
          setBannerUrl(resolvedData.headerImageUrl);
          setBio(resolvedData.heroText);
          setIsCertified(resolvedData.isCertified);
          setIsMedia(resolvedData.isMedia);
          setIsFollowing(resolvedData.isFollowing);
          setFollowersCount(resolvedData.followersCount);
          setFollowingCount(resolvedData.followingCount);
          setArticlesCount(resolvedData.articlesCount);
        }
      } catch {
        // Fallback gracefully to existing props
      }
    },
    [cleanHandle, hasFetched]
  );

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onOpenProfile) {
      onOpenProfile(cleanHandle);
    } else {
      window.location.href = routes.feed.profile(cleanHandle);
    }
  };

  const handleToggleFollow = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (isFollowLoading) return;

    const nextFollowed = !isFollowing;
    setIsFollowing(nextFollowed);
    setFollowersCount((prev) => Math.max(0, prev + (nextFollowed ? 1 : -1)));

    if (onFollowToggle && user?.id) {
      onFollowToggle(user.id, nextFollowed);
    }

    try {
      setIsFollowLoading(true);
      const targetId = user?.id || cleanHandle;
      await toggleFollowCreatorHomeAction(targetId);

      // Update cache
      const cacheKey = cleanHandle.toLowerCase();
      const existing = profileHoverCache.get(cacheKey);
      if (existing) {
        profileHoverCache.set(cacheKey, {
          ...existing,
          isFollowing: nextFollowed,
          followersCount: Math.max(0, (existing.followersCount ?? 0) + (nextFollowed ? 1 : -1)),
        });
      }
    } catch {
      // Revert optimistic state
      setIsFollowing(!nextFollowed);
      setFollowersCount((prev) => Math.max(0, prev + (nextFollowed ? -1 : 1)));
    } finally {
      setIsFollowLoading(false);
    }
  };

  return (
    <HoverCard onOpenChange={handleOpenChange}>
      <HoverCardTrigger
        render={
          <span onClick={handleClick} className={cn('inline-block cursor-pointer', className)}>
            {children}
          </span>
        }
      />
      <HoverCardContent
        side="top"
        align="start"
        sideOffset={6}
        className="w-80 p-0 overflow-hidden rounded-2xl bg-popover/95 backdrop-blur-xl border border-border/50 shadow-2xl z-50 font-sans select-none"
      >
        {/* ── BANNER (Optimisé, 0 Ko si fallback gradient) ── */}
        <div className="h-20 w-full relative bg-muted overflow-hidden">
          {bannerUrl ? (
            <img
              src={bannerUrl}
              alt=""
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover"
            />
          ) : (
            <div
              className="w-full h-full"
              style={{ background: getGradientFromHandle(cleanHandle) }}
            />
          )}
        </div>

        {/* ── AVATAR & BOUTON FOLLOW ── */}
        <div className="px-4 -mt-7 flex items-end justify-between relative z-10">
          <SafeAvatar
            src={avatarUrl}
            name={name}
            username={cleanHandle}
            size={56}
            shape={isMedia ? 'squircle' : 'circle'}
            type={isMedia ? 'MEDIA' : 'PERSONAL'}
            className="ring-4 ring-popover shrink-0 shadow-md"
          />
          <button
            type="button"
            onClick={handleToggleFollow}
            disabled={isFollowLoading}
            className={cn(
              'px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 cursor-pointer flex items-center gap-1.5 shadow-2xs',
              isFollowing
                ? 'bg-secondary text-secondary-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 border border-border/60'
                : 'bg-primary text-primary-foreground hover:opacity-90'
            )}
          >
            {isFollowLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isFollowing ? (
              <>
                <UserCheck className="w-3.5 h-3.5" />
                <span>{t`Abonné(e)`}</span>
              </>
            ) : (
              <>
                <UserPlus className="w-3.5 h-3.5" />
                <span>{t`Suivre`}</span>
              </>
            )}
          </button>
        </div>

        {/* ── IDENTITÉ ── */}
        <div className="px-4 pt-2.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h4
              onClick={handleClick}
              className="text-sm font-bold text-foreground leading-tight hover:underline cursor-pointer truncate max-w-[200px]"
            >
              {name}
            </h4>
            {isCertified && <CertifiedBadge size={14} />}
            {isMedia && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                <Building2 className="w-2.5 h-2.5" />
                {t`Média`}
              </span>
            )}
          </div>
          <p
            onClick={handleClick}
            className="text-xs text-muted-foreground hover:underline cursor-pointer leading-tight mt-0.5"
          >
            @{cleanHandle}
          </p>
        </div>

        {/* ── BIO ── */}
        {bio && (
          <p className="px-4 pt-2 text-xs text-foreground/85 leading-relaxed line-clamp-3">{bio}</p>
        )}

        {/* ── STATS ROW ── */}
        <div className="px-4 pt-3 pb-3 mt-2.5 border-t border-border/40 flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <span className="font-bold text-foreground">{followersCount}</span>
            <span>{t`abonnés`}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="font-bold text-foreground">{followingCount}</span>
            <span>{t`abonnements`}</span>
          </div>
          {articlesCount !== undefined && articlesCount > 0 && (
            <div className="flex items-center gap-1">
              <span className="font-bold text-foreground">{articlesCount}</span>
              <span>{t`articles`}</span>
            </div>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
