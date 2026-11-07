'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { cn } from '@qoe/utils';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '../ui/hover-card';
import { SafeAvatar } from '../SafeAvatar';
import { CertifiedBadge } from '../ui/CertifiedBadge';
import { Button } from '../primitives/button/button';
import { routes } from '@qoe/config/routes';
import { getMainAppUrl } from '@qoe/config';
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
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
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
  side = 'top',
  align = 'start',
  sideOffset = 6,
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
  // La carte est contrôlée : le focus clavier et le tap tactile doivent
  // pouvoir l'ouvrir sans dépendre du survol (impossible au doigt).
  const [isOpen, setIsOpen] = useState(false);
  const pointerTypeRef = useRef<string | null>(null);

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
    // Un lien parent (ex. un <Link> Next) est déjà la source de vérité : il
    // gère la navigation client, le prefetch et les clics modifiés (Ctrl/Maj).
    // Intercepter ici laisserait le navigateur suivre le href de l'ancre en
    // plus de la navigation SPA — donc un rechargement complet de la page.
    if ((e.target as Element | null)?.closest?.('a[href]')) return;

    e.stopPropagation();
    if (onOpenProfile) {
      onOpenProfile(cleanHandle);
    } else {
      const mainAppUrl = getMainAppUrl(
        typeof window !== 'undefined' ? window.location.host : undefined
      );
      window.location.href = `${mainAppUrl}${routes.feed.profile(cleanHandle)}`;
    }
  };

  const handleCardOpenChange = useCallback(
    (nextOpen: boolean) => {
      setIsOpen(nextOpen);
      void handleOpenChange(nextOpen);
    },
    [handleOpenChange]
  );

  const handleTriggerClick = (e: React.MouseEvent<HTMLSpanElement>) => {
    const target = e.target as Element | null;
    const childAnchor = e.currentTarget.querySelector('a[href]');
    const tappedChildAnchor = Boolean(childAnchor && target && childAnchor.contains(target));
    const isTouch = pointerTypeRef.current === 'touch' || pointerTypeRef.current === 'pen';

    // Au doigt, le survol n'existe pas : le premier tap ouvre la carte et ne
    // doit pas suivre le lien de la ligne. Un lien enfant (logo tenant) garde
    // sa navigation ; seul le déclencheur lui-même capture le tap.
    if (isTouch && !tappedChildAnchor) {
      e.preventDefault();
      e.stopPropagation();
      handleCardOpenChange(true);
      return;
    }

    handleClick(e);
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLSpanElement>) => {
    // Les événements d'un lien enfant (logo tenant) ne doivent pas être
    // détournés : Entrée y déclenche la navigation, pas la carte.
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      handleCardOpenChange(true);
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

  // Le contenu de la carte est portailé, mais React fait remonter les
  // événements par l'arbre React : sans barrière, un clic sur la bio ou les
  // statistiques suivrait le <Link> de la notification parente.
  return (
    <HoverCard open={isOpen} onOpenChange={handleCardOpenChange}>
      <HoverCardTrigger
        render={
          <span
            tabIndex={0}
            aria-label={name}
            data-profile-hover-trigger
            onClick={handleTriggerClick}
            onPointerDown={(event) => {
              pointerTypeRef.current = event.pointerType;
            }}
            onFocus={() => handleCardOpenChange(true)}
            onBlur={(event) => {
              // Le focus clavier quitte le déclencheur : refermer la carte,
              // sauf si le focus entre dans son contenu (bouton Suivre). Un
              // blur sans cible (clic dans le contenu) est laissé au survol.
              const next = event.relatedTarget;
              if (!next) return;
              const content = document.querySelector('[data-profile-hover-content]');
              if (content && next instanceof Node && content.contains(next)) return;
              handleCardOpenChange(false);
            }}
            onKeyDown={handleTriggerKeyDown}
            className={cn(
              'inline-block cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              className
            )}
          >
            {children}
          </span>
        }
      />
      <HoverCardContent
        side={side}
        data-profile-hover-content
        onClick={(event: React.MouseEvent) => event.stopPropagation()}
        align={align}
        sideOffset={sideOffset}
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
            shape={isMedia ? 'square' : 'circle'}
            type={isMedia ? 'MEDIA' : 'PERSONAL'}
            className="ring-4 ring-popover shrink-0 shadow-md"
          />
          <Button
            type="button"
            size="xs"
            variant={isFollowing ? 'soft' : 'solid'}
            tone={isFollowing ? 'neutral' : 'brand'}
            onClick={handleToggleFollow}
            disabled={isFollowLoading}
            aria-busy={isFollowLoading}
            className="rounded-full gap-1.5"
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
          </Button>
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
