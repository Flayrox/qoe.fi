'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  MapPin,
  Calendar,
  Link as LinkIcon,
  ArrowLeft,
  Edit3,
  Repeat,
  MessageSquare,
  FileText,
  Image as ImageIcon,
  Pin,
  Share2,
  Lock,
  ExternalLink,
} from 'lucide-react';
import { AuthorAvatar } from '@qoe/ui/ui/AuthorAvatar';
import { ThoughtCard } from '@/components/social/ThoughtCard';
import {
  useArticleOverlay,
  type OpenArticleInput,
} from '@/components/article-overlay/ArticleOverlayProvider';
import { useThoughtOverlay } from '@/components/thought-overlay/context';
import { ArticleCard } from '@qoe/ui/cards';
import { Button } from '@qoe/ui/button';
import { Tabs, TabList, Tab } from '@qoe/ui/tabs';
import { EditProfileModal } from '@/components/profile/EditProfileModal';
import { FollowList } from './FollowList';
import { toggleFollowCreatorHomeAction as toggleFollowCreator } from '@qoe/sdk/actions/feed';
// Le type vit dans les mappers purs : un module 'use server' ne réexporte pas de type.
import type { ProfilePostPayload } from '@qoe/sdk';
import {
  useDeletePostMutation,
  useActorShadow,
  updateActorShadow,
  withShadowMutation,
} from '@qoe/sdk';
import {
  CertifiedBadge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  ShareMenu,
  type QuotedArticleData,
} from '@qoe/ui';
import { HiddenParentNotice } from '@qoe/ui/social';

import { routes, getArticleUrl } from '@qoe/config/routes';
import { toast } from '@qoe/ui/toast';
import { cn } from '@qoe/utils';
import { ReaderPageLayout } from '@/components/layout/ReaderPageLayout';
import type { FeedArticleDTO } from '@/lib/feed-types';
import { t } from '@lingui/core/macro';

/**
 * Le profil ne redéfinit pas la pensée : il rend le même contrat que le
 * feed (`ProfilePostPayload`), citations et chaîne comprises. Une copie
 * locale plus étroite était la cause des cartes différentes d'une page à
 * l'autre.
 */
type ProfilePost = ProfilePostPayload;

interface ProfileUser {
  id: string;
  ownerUserId?: string | null;
  type?: 'PERSONAL' | 'MEDIA';
  name: string | null;
  username: string | null;
  subdomain: string | null;
  customDomain: string | null;
  logoUrl: string | null;
  heroText: string | null;
  headerImageUrl?: string | null;
  onboardingText?: string | null;
  pronouns?: string | null;
  website?: string | null;
  supportUrl?: string | null;
  socialLinks?: Array<{ platform: string; url: string }> | null;
  isCertified?: boolean;
  createdAt: string | Date;
  posts?: ProfilePost[];
  articles?: FeedArticleDTO[];
  _count?: {
    followers?: number;
    following?: number;
    follows?: number;
    posts?: number;
  };
}

interface ProfileViewProps {
  profileUser: ProfileUser;
  currentUserId: string | null;
  isOwnProfile: boolean;
  initialIsFollowing: boolean;
  /** Demande de follow déjà en attente (compte PRIVATE). */
  initialFollowRequested?: boolean;
  /** Visibilité effective du profil (PUBLIC | FOLLOWERS | PRIVATE). */
  profileVisibility?: 'PUBLIC' | 'FOLLOWERS' | 'PRIVATE';
  /** false = le contenu est masqué au viewer (privé / abonnés uniquement). */
  initialCanViewContent?: boolean;
  initialTab?: string;
  /** PublisherId (cible de l'endpoint follow) — le profile.id du Go. */
  initialPublisherId?: string;
}

type ProfileTab = 'thoughts' | 'with_replies' | 'articles' | 'reposts' | 'media';

const PROFILE_TABS: ProfileTab[] = ['thoughts', 'with_replies', 'articles', 'reposts', 'media'];

export function ProfileView({
  profileUser: initialProfileUser,
  currentUserId,
  isOwnProfile,
  initialIsFollowing,
  initialFollowRequested = false,
  profileVisibility = 'PUBLIC',
  initialCanViewContent = true,
  initialTab = 'thoughts',
  initialPublisherId,
}: ProfileViewProps) {
  const router = useRouter();
  const overlay = useArticleOverlay();
  const thoughtOverlay = useThoughtOverlay();
  const [user, setUser] = useState(initialProfileUser);
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const actorShadow = useActorShadow(user?.id || user?.username || '', {
    followed: initialIsFollowing,
  });
  const effectiveFollowing =
    actorShadow.followed !== undefined ? actorShadow.followed : isFollowing;
  const [followRequested, setFollowRequested] = useState(initialFollowRequested);
  const [followersCount, setFollowersCount] = useState(user._count?.followers || 0);
  const canViewContent = initialCanViewContent;
  const isPrivate = profileVisibility === 'PRIVATE';

  // 🧵 Un fil s'ouvre par-dessus le profil : la position et le scroll de la
  // page restent intacts. Sans provider (vitrine), navigation classique.
  const openThought = (id: string, handle: string) => {
    if (thoughtOverlay) {
      thoughtOverlay.openThought(id, handle);
      return;
    }
    router.push(routes.feed.thought(handle, id));
  };

  const handleOpenArticle = (
    art:
      | QuotedArticleData
      | {
          slug?: string;
          author?: { id?: string; username?: string | null; subdomain?: string | null } | null;
        }
      | string
      | null
      | undefined
  ) => {
    const slug = typeof art === 'string' ? art : art?.slug;
    if (!slug) return;
    const authorHandle = user.username || user.subdomain || 'author';
    const artObj = typeof art === 'object' && art !== null ? (art as Record<string, unknown>) : {};
    const artAuthor =
      artObj.author && typeof artObj.author === 'object'
        ? (artObj.author as Record<string, unknown>)
        : {};
    const resolvedInput: OpenArticleInput =
      typeof art === 'string'
        ? { slug, author: { id: user.id, username: authorHandle } }
        : {
            ...artObj,
            slug,
            author: {
              ...artAuthor,
              id: typeof artAuthor.id === 'string' ? artAuthor.id : user.id,
              username: typeof artAuthor.username === 'string' ? artAuthor.username : authorHandle,
            },
          };
    if (overlay) {
      overlay.openArticle(resolvedInput, { source: 'public_profile' });
    } else {
      window.location.href = getArticleUrl(resolvedInput, {
        fallbackOwner: authorHandle,
      });
    }
  };
  const [activeTab, setActiveTab] = useState<ProfileTab>(
    PROFILE_TABS.includes(initialTab as ProfileTab) ? (initialTab as ProfileTab) : 'thoughts'
  );
  const [followsModalTab, setFollowsModalTab] = useState<'followers' | 'following' | null>(
    initialTab === 'followers' || initialTab === 'following' ? initialTab : null
  );
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const { mutateAsync: deletePost } = useDeletePostMutation();

  const handleTabChange = (tab: ProfileTab) => {
    setActiveTab(tab);
    const username = user.username || user.subdomain || 'user';
    const newUrl = routes.feed.profile(username, tab);
    window.history.pushState({ tab }, '', newUrl);
  };

  React.useEffect(() => {
    const handlePopState = () => {
      const pathname = window.location.pathname;
      const parts = pathname.split('/').filter(Boolean);
      const lastPart = parts[parts.length - 1];
      if (PROFILE_TABS.includes(lastPart as ProfileTab)) {
        setActiveTab(lastPart as ProfileTab);
      } else {
        setActiveTab('thoughts');
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleFollowToggle = async () => {
    if (!currentUserId) {
      toast.error('Veuillez vous connecter pour suivre cet auteur.');
      return;
    }

    const wasFollowing = effectiveFollowing;
    const wasRequested = followRequested;
    // Optimiste : follow instantané, ou demande locale pour un compte privé.
    const optimisticFollowing = !wasFollowing && !wasRequested && !isPrivate;
    const optimisticRequested = !wasFollowing && (wasRequested || isPrivate);

    const targetKey = user.id || initialPublisherId || '';
    await withShadowMutation({
      lockKey: `actor:${targetKey}:follow`,
      optimisticUpdate: () => {
        setIsFollowing(optimisticFollowing);
        setFollowRequested(optimisticRequested);
        updateActorShadow(user.id, { followed: optimisticFollowing });
        if (user.username)
          updateActorShadow(user.username.replace(/^@/, ''), { followed: optimisticFollowing });
      },
      rollback: () => {
        setIsFollowing(wasFollowing);
        setFollowRequested(wasRequested);
        updateActorShadow(user.id, { followed: wasFollowing });
        if (user.username)
          updateActorShadow(user.username.replace(/^@/, ''), { followed: wasFollowing });
      },
      mutation: async () => {
        const res = await toggleFollowCreator(initialPublisherId || user.id);
        if (!res.ok) {
          throw new Error('Erreur lors de la modification du suivi.');
        }

        const nextFollowing = res.data?.followed ?? false;
        const nextRequested = res.data?.requested ?? false;
        setIsFollowing(nextFollowing);
        setFollowRequested(nextRequested);
        updateActorShadow(user.id, { followed: nextFollowing });
        if (user.username)
          updateActorShadow(user.username.replace(/^@/, ''), { followed: nextFollowing });
        if (nextFollowing !== wasFollowing) {
          setFollowersCount((prev: number) => Math.max(0, prev + (nextFollowing ? 1 : -1)));
        }

        if (nextRequested) {
          toast.success(`Demande d’abonnement envoyée à ${user.name || 'ce compte'}.`);
        } else if (nextFollowing) {
          toast.success(`Vous suivez maintenant ${user.name}`);
          // Le contenu était masqué côté serveur : on recharge une fois l'accès
          // accordé (follow instantané d'un compte FOLLOWERS).
          if (!canViewContent) router.refresh();
        } else {
          toast.success(wasRequested ? 'Demande annulée.' : 'Abonnement retiré.');
        }
      },
    });
  };

  const handleDeletePost = async (postId: string): Promise<boolean> => {
    if (!isOwnProfile) return false;

    const res = await deletePost(postId);

    if (!res.ok) {
      toast.error(t`Erreur lors de la suppression de la pensée.`);
      return false;
    }

    setUser((prev: ProfileUser) => ({
      ...prev,
      posts: prev.posts?.filter((p) => p.id !== postId) || [],
      _count: prev._count
        ? { ...prev._count, posts: Math.max(0, (prev._count.posts || 0) - 1) }
        : prev._count,
    }));
    toast.success(t`Pensée supprimée.`);
    return true;
  };

  const profileHandle = user.username || user.subdomain || 'user';

  // 🛡️ Unification de l'avatar et de l'auteur des pensées avec l'identité du profil
  const enrichedPosts = React.useMemo(() => {
    return (user.posts || []).map((p) => {
      const isOwner =
        p.author.id === user.id ||
        p.author.id === user.ownerUserId ||
        (!!user.username && p.author.username === user.username) ||
        (!!user.subdomain && p.author.username === user.subdomain);
      if (isOwner && user.logoUrl && p.author.logoUrl !== user.logoUrl) {
        return {
          ...p,
          author: {
            ...p.author,
            logoUrl: user.logoUrl,
            name: user.name ?? p.author.name,
            username: user.username ?? p.author.username,
          },
        };
      }
      return p;
    });
  }, [
    user.posts,
    user.id,
    user.ownerUserId,
    user.username,
    user.subdomain,
    user.logoUrl,
    user.name,
  ]);

  // Filter content for tabs
  const rootThoughts = enrichedPosts.filter((p) => !p.parentId);
  const replyThoughts = enrichedPosts.filter((p) => !!p.parentId);
  const articlesList = user.articles || [];
  const repostsList = enrichedPosts.filter((p) => !!p.repostId && !!p.repost);
  const mediaThoughts = enrichedPosts.filter((p) => !!p.imageUrl);
  const pinnedThoughts = rootThoughts.filter((p) => p.isPinned);
  const regularThoughts = rootThoughts.filter((p) => !p.isPinned);
  const siteUrl =
    user.website || user.customDomain || (user.subdomain ? `${user.subdomain}.qoe.fi` : null);

  const formattedJoinedDate = new Date(user.createdAt).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <ReaderPageLayout hideHeader>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 font-sans space-y-6">
        {/* Back navigation */}
        <Button
          variant="ghost"
          size="xs"
          onClick={() => {
            if (typeof window !== 'undefined' && window.history.length > 1) {
              window.history.back();
            } else {
              router.push(routes.feed.home());
            }
          }}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft />
          <span>Retour</span>
        </Button>

        {/* Profile Card Header */}
        <div className="bg-card border border-border/40 rounded-2xl overflow-hidden shadow-xs relative">
          {/* Banner */}
          <div className="h-32 sm:h-44 w-full bg-gradient-to-r from-brand/20 via-muted to-brand/10 relative overflow-hidden">
            {user.headerImageUrl && (
              <Image src={user.headerImageUrl} alt="" fill className="object-cover" />
            )}
          </div>

          {/* Profile Header Info */}
          <div className="px-5 sm:px-6 pb-6 relative">
            {/* Avatar & Action Button Row */}
            <div className="flex items-end justify-between -mt-12 sm:-mt-16 mb-4">
              <div
                className={cn(
                  'ring-4 ring-card overflow-hidden bg-card shrink-0 select-none shadow-md',
                  user.type === 'MEDIA' ? 'rounded-2xl' : 'rounded-full'
                )}
              >
                <AuthorAvatar
                  user={{
                    ...user,
                    id: user.ownerUserId || user.id,
                    type: user.type,
                  }}
                  size="2xl"
                  type={user.type}
                  shape={user.type === 'MEDIA' ? 'squircle' : 'circle'}
                  showBadge={false}
                  disableHoverCard
                />
              </div>

              <div className="flex items-center gap-2">
                {isOwnProfile && user.type !== 'MEDIA' ? (
                  <Button variant="outline" size="sm" onClick={() => setIsEditModalOpen(true)}>
                    <Edit3 />
                    <span>{t`Éditer le profil`}</span>
                  </Button>
                ) : (
                  <>
                    <Button
                      variant={effectiveFollowing ? 'outline' : 'solid'}
                      tone="neutral"
                      size="sm"
                      onClick={handleFollowToggle}
                      className={
                        effectiveFollowing
                          ? 'hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive-text'
                          : undefined
                      }
                    >
                      {effectiveFollowing ? t`Abonné` : followRequested ? t`Demandé` : t`Suivre`}
                    </Button>
                    {isOwnProfile && user.type === 'MEDIA' && (
                      <Button variant="outline" size="sm" onClick={() => setIsEditModalOpen(true)}>
                        <Edit3 />
                        <span>{t`Éditer`}</span>
                      </Button>
                    )}
                  </>
                )}

                {/* Partager le profil */}
                <ShareMenu
                  title={`Profil de ${user.name || user.username || 'Utilisateur'}`}
                  authorHandle={user.username || user.subdomain || user.id}
                  trigger={
                    <Button
                      variant="outline"
                      size="sm"
                      shape="icon"
                      onClick={(e) => e.stopPropagation()}
                      aria-label={t`Partager ce profil`}
                    >
                      <Share2 />
                    </Button>
                  }
                />
              </div>
            </div>

            {/* User Identity */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-foreground leading-none">
                  {user.name}
                </h1>
                {user.isCertified && <CertifiedBadge size={16} />}
                {isPrivate && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    <Lock className="h-3 w-3" />
                    {t`Compte privé`}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground font-medium">
                @{user.username || user.subdomain}
              </p>
              {user.pronouns && (
                <p className="text-[11px] text-muted-foreground/80 italic">{user.pronouns}</p>
              )}
            </div>

            {/* Bio */}
            {user.heroText && (
              <p className="text-sm text-foreground/90 leading-relaxed pt-3 max-w-2xl font-sans">
                {user.heroText}
              </p>
            )}

            {/* Meta Row: Location, Joined, Website */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground pt-3 font-medium">
              {user.onboardingText && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground/70" />
                  <span>{user.onboardingText}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground/70" />
                <span>A rejoint en {formattedJoinedDate}</span>
              </div>
              {siteUrl && (
                <a
                  href={siteUrl.startsWith('http') ? siteUrl : `https://${siteUrl}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-brand hover:underline cursor-pointer"
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  <span>{siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
                </a>
              )}
              {user.supportUrl && (
                <a
                  href={
                    user.supportUrl.startsWith('http')
                      ? user.supportUrl
                      : `https://${user.supportUrl}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground hover:underline cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Contact & Support</span>
                </a>
              )}
            </div>

            {/* Social Links Chips */}
            {user.socialLinks && user.socialLinks.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-3">
                {user.socialLinks.map((s) => (
                  <a
                    key={s.platform}
                    href={s.url.startsWith('http') ? s.url : `https://${s.url}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <ExternalLink className="size-3" />
                    <span className="capitalize">{s.platform}</span>
                  </a>
                ))}
              </div>
            )}

            {/* Stats — cliquables */}
            <div className="flex items-center gap-6 pt-4 text-xs">
              <button
                onClick={() =>
                  handleTabChange(
                    rootThoughts.length > 0
                      ? 'thoughts'
                      : replyThoughts.length > 0
                        ? 'with_replies'
                        : 'thoughts'
                  )
                }
                className="flex items-center gap-1.5 cursor-pointer hover:underline group"
              >
                <span className="font-bold text-foreground">
                  {user.posts?.length || user._count?.posts || 0}
                </span>
                <span className="text-muted-foreground font-medium group-hover:text-foreground transition-colors">
                  pensées
                </span>
              </button>
              <button
                onClick={() => canViewContent && setFollowsModalTab('following')}
                className="flex items-center gap-1.5 cursor-pointer hover:underline group"
              >
                <span className="font-bold text-foreground">
                  {user._count?.following || user._count?.follows || 0}
                </span>
                <span className="text-muted-foreground font-medium group-hover:text-foreground transition-colors">
                  abonnements
                </span>
              </button>
              <button
                onClick={() => canViewContent && setFollowsModalTab('followers')}
                className="flex items-center gap-1.5 cursor-pointer hover:underline group"
              >
                <span className="font-bold text-foreground">{followersCount}</span>
                <span className="text-muted-foreground font-medium group-hover:text-foreground transition-colors">
                  abonnés
                </span>
              </button>
            </div>
          </div>

          {!canViewContent && (
            <div className="border-t border-border/40 px-6 py-14 text-center space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Lock className="h-5 w-5 text-muted-foreground" />
              </div>
              <h2 className="text-sm font-semibold">{t`Ce compte est privé`}</h2>
              <p className="mx-auto max-w-sm text-xs text-muted-foreground">
                {followRequested
                  ? t`Votre demande d’abonnement est en attente. Vous verrez les pensées et articles dès qu’elle sera acceptée.`
                  : t`Abonnez-vous pour voir ses pensées et ses articles.`}
              </p>
            </div>
          )}

          {/* Profile Tabs Navigation */}
          <div
            className={cn(
              'border-t border-border/40 px-4 sm:px-5 overflow-x-auto sm:overflow-x-visible no-scrollbar overscroll-contain',
              !canViewContent && 'hidden'
            )}
          >
            <Tabs
              variant="underline"
              size="md"
              selectedKey={activeTab}
              onSelectionChange={(key) => handleTabChange(key as ProfileTab)}
            >
              <TabList
                aria-label={t`Sections du profil`}
                className="gap-5 sm:gap-7 border-b-0 min-w-max sm:min-w-0 sm:w-full sm:justify-start overflow-x-auto sm:overflow-x-visible"
              >
                <Tab
                  id="thoughts"
                  icon={MessageSquare}
                  count={rootThoughts.length > 0 ? rootThoughts.length : undefined}
                >
                  {t`Pensées`}
                </Tab>
                <Tab
                  id="with_replies"
                  icon={MessageSquare}
                  count={replyThoughts.length > 0 ? replyThoughts.length : undefined}
                >
                  {t`Réponses`}
                </Tab>
                <Tab
                  id="articles"
                  icon={FileText}
                  count={articlesList.length > 0 ? articlesList.length : undefined}
                >
                  Articles
                </Tab>
                <Tab
                  id="reposts"
                  icon={Repeat}
                  count={repostsList.length > 0 ? repostsList.length : undefined}
                >
                  Reposts
                </Tab>
                <Tab
                  id="media"
                  icon={ImageIcon}
                  count={mediaThoughts.length > 0 ? mediaThoughts.length : undefined}
                >
                  {t`Médias`}
                </Tab>
              </TabList>
            </Tabs>
          </div>
        </div>

        {/* Tab Content Stream — Instant, Snappy Rendering without Fade Lag */}
        <div className={cn('space-y-4', !canViewContent && 'hidden')}>
          {activeTab === 'thoughts' && (
            <div className="space-y-2">
              {rootThoughts.length === 0 ? (
                replyThoughts.length > 0 ? (
                  <div className="py-10 text-center text-xs text-muted-foreground bg-card/40 border border-border/30 rounded-xl space-y-3 p-4">
                    <p className="italic">Aucune pensée principale publiée pour le moment.</p>
                    <Button
                      variant="soft"
                      tone="brand"
                      size="sm"
                      onClick={() => handleTabChange('with_replies')}
                    >
                      Afficher les {replyThoughts.length} réponse
                      {replyThoughts.length > 1 ? 's' : ''} de @{profileHandle}
                    </Button>
                  </div>
                ) : (
                  <EmptyTabMessage message="Aucune pensée originale publiée pour le moment." />
                )
              ) : (
                <>
                  {/* Pensées épinglées en tête (parité Bluesky) */}
                  {pinnedThoughts.map((post) => (
                    <div key={post.id} className="relative">
                      <div className="flex items-center gap-1.5 px-1 pt-2 pb-0.5 text-xs font-medium text-muted-foreground">
                        <Pin className="w-3 h-3" />
                        <span>Épinglé</span>
                      </div>
                      <ThoughtCard
                        post={post}
                        currentUserId={currentUserId}
                        onDeletePost={handleDeletePost}
                        onOpenPost={(id, authorUsername) => {
                          const handle = authorUsername || profileHandle || user.id;
                          openThought(id, handle);
                        }}
                        onOpenArticle={handleOpenArticle}
                      />
                    </div>
                  ))}
                  {regularThoughts.map((post) => (
                    <ThoughtCard
                      key={post.id}
                      post={post}
                      currentUserId={currentUserId}
                      onDeletePost={handleDeletePost}
                      onOpenPost={(id, authorUsername) => {
                        const handle = authorUsername || profileHandle || user.id;
                        openThought(id, handle);
                      }}
                      onOpenArticle={handleOpenArticle}
                    />
                  ))}
                </>
              )}
            </div>
          )}

          {activeTab === 'with_replies' && (
            <div className="space-y-2">
              {replyThoughts.length === 0 ? (
                <EmptyTabMessage message="Aucune réponse publiée pour le moment." />
              ) : (
                replyThoughts.map((post) => (
                  <div key={post.id} className="space-y-1.5">
                    {post.parentUnavailable && (
                      <HiddenParentNotice reason={post.parentUnavailableReason} />
                    )}
                    <ThoughtCard
                      post={post}
                      currentUserId={currentUserId}
                      onDeletePost={handleDeletePost}
                      onOpenPost={(id, authorUsername) => {
                        const handle = authorUsername || user.username || user.subdomain || user.id;
                        openThought(id, handle);
                      }}
                      onOpenArticle={handleOpenArticle}
                    />
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'articles' && (
            <div className="space-y-2">
              {articlesList.length === 0 ? (
                <EmptyTabMessage message="Aucun article rédigé pour le moment." />
              ) : (
                articlesList.map((article, idx: number) => (
                  <ArticleCard
                    key={article.id}
                    article={article}
                    idx={idx}
                    dbUser={currentUserId ? { id: currentUserId } : null}
                    isBookmarked={false}
                    isFollowed={effectiveFollowing}
                    disableAuthorOverride={true}
                    handleFollowToggle={handleFollowToggle}
                    handleBookmarkToggle={() => {}}
                    onOpenArticle={(art) => handleOpenArticle(art || article)}
                  />
                ))
              )}
            </div>
          )}

          {activeTab === 'reposts' && (
            <div className="space-y-2">
              {repostsList.length === 0 ? (
                <EmptyTabMessage message="Aucun contenu repartagé." />
              ) : (
                repostsList.map((post) => (
                  <ThoughtCard
                    key={post.id}
                    post={post}
                    currentUserId={currentUserId}
                    onDeletePost={handleDeletePost}
                    onOpenPost={(id, authorUsername) => {
                      const handle =
                        authorUsername ||
                        post.author?.username ||
                        post.author?.subdomain ||
                        user.username ||
                        user.subdomain ||
                        user.id;
                      openThought(id, handle);
                    }}
                    onOpenArticle={handleOpenArticle}
                  />
                ))
              )}
            </div>
          )}

          {activeTab === 'media' && (
            <div className="space-y-2">
              {mediaThoughts.length === 0 ? (
                <EmptyTabMessage message="Aucun média partagé." />
              ) : (
                /* Grille d'images façon Bluesky (3 colonnes) */
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {mediaThoughts.map((post) =>
                    post.imageUrl ? (
                      <button
                        key={post.id}
                        onClick={() =>
                          openThought(
                            post.id,
                            post.author?.username ||
                              post.author?.subdomain ||
                              profileHandle ||
                              user.id
                          )
                        }
                        className="relative aspect-square overflow-hidden rounded-xl bg-muted group cursor-pointer"
                      >
                        <Image
                          src={post.imageUrl}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="(max-width: 768px) 50vw, 33vw"
                        />
                      </button>
                    ) : null
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Follows Modal (Abonnés / Abonnements) */}
      <Dialog
        open={Boolean(followsModalTab)}
        onOpenChange={(open) => {
          if (!open) setFollowsModalTab(null);
        }}
      >
        <DialogContent className="max-w-md max-h-[85vh] p-4 sm:p-6 overflow-hidden flex flex-col">
          <DialogHeader className="pb-2">
            <DialogTitle>{user.name || user.username}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto min-h-0 pr-1">
            {followsModalTab && (
              <FollowList
                handle={user.username || user.subdomain || user.id}
                initialTab={followsModalTab}
                currentUserId={currentUserId}
                isOwnProfile={isOwnProfile}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Profile Modal */}
      {isOwnProfile && (
        <EditProfileModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          user={user}
          // 🎯 Cible d'écriture explicite : sur un profil de MÉDIA, la
          // publisherId est celle du média — le modal écrira alors
          // PATCH /v1/media/{id}/settings et JAMAIS le profil personnel.
          publisherId={initialPublisherId}
          onProfileUpdated={(updatedUser) => {
            setUser((prev: ProfileUser) => ({
              ...prev,
              ...updatedUser,
            }));
          }}
        />
      )}
    </ReaderPageLayout>
  );
}

function EmptyTabMessage({ message }: { message: string }) {
  return (
    <div className="py-12 text-center text-xs text-muted-foreground italic bg-card/40 border border-border/30 rounded-xl">
      {message}
    </div>
  );
}
