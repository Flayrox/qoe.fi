'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';
import { AuthorAvatar } from '@qoe/ui/ui/AuthorAvatar';
import { ThoughtCard } from '@/components/social/ThoughtCard';
import { ArticleCard } from '@/app/(reader)/home/components/ArticleCard';
import { EditProfileModal } from '@/components/profile/EditProfileModal';
import { FollowList } from './FollowList';
import { toggleFollowCreatorHomeAction as toggleFollowCreator } from '@qoe/sdk/actions/feed';
import { useDeletePostMutation } from '@qoe/sdk';
import {
  CertifiedBadge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  ShareMenu,
} from '@qoe/ui';

import { routes } from '@qoe/config/routes';
import { toast } from '@qoe/ui/toast';
import { cn } from '@qoe/utils';
import { ReaderPageLayout } from '@/components/layout/ReaderPageLayout';
import type { FeedArticleDTO } from '@/lib/feed-types';
import { t } from '@lingui/core/macro';

interface ProfilePost {
  id: string;
  content: string;
  imageUrl?: string | null;
  createdAt: string | Date;
  triggerWarning?: string | null;
  isPinned?: boolean;
  author: {
    id: string;
    name: string | null;
    username: string | null;
    subdomain?: string | null;
    logoUrl: string | null;
    isCertified?: boolean;
  };
  parentId?: string | null;
  repostId?: string | null;
  parent?: ProfilePost | null;
  repost?: ProfilePost | null;
  likesCount?: number;
  repliesCount?: number;
  repostsCount?: number;
  liked?: boolean;
  _count?: { likes?: number; replies?: number; reposts?: number };
}

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
  initialTab?: string;
  /** PublicationId (cible de l'endpoint follow) — le profile.id du Go. */
  initialPublicationId?: string;
}

type ProfileTab = 'thoughts' | 'with_replies' | 'articles' | 'reposts' | 'media';

const PROFILE_TABS: ProfileTab[] = ['thoughts', 'with_replies', 'articles', 'reposts', 'media'];

export function ProfileView({
  profileUser: initialProfileUser,
  currentUserId,
  isOwnProfile,
  initialIsFollowing,
  initialTab = 'thoughts',
  initialPublicationId,
}: ProfileViewProps) {
  const [user, setUser] = useState(initialProfileUser);
  const [isFollowing, setIsFollowing] = useState(initialIsFollowing);
  const [followersCount, setFollowersCount] = useState(user._count?.followers || 0);
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

    const nextState = !isFollowing;
    setIsFollowing(nextState);
    setFollowersCount((prev: number) => (nextState ? prev + 1 : prev - 1));

    const res = await toggleFollowCreator(initialPublicationId || user.id);
    if (!res.ok) {
      setIsFollowing(!nextState);
      setFollowersCount((prev: number) => (!nextState ? prev + 1 : prev - 1));
      toast.error('Erreur lors de la modification du suivi.');
    } else {
      toast.success(nextState ? `Vous suivez maintenant ${user.name}` : `Abonnement retiré.`);
    }
  };

  const handleDeletePost = async (postId: string): Promise<boolean> => {
    if (!isOwnProfile) return false;

    const res = await deletePost(postId);

    if (!res.ok) {
      toast.error('Erreur lors de la suppression de la pensée.');
      return false;
    }

    setUser((prev: ProfileUser) => ({
      ...prev,
      posts: prev.posts?.filter((p) => p.id !== postId) || [],
      _count: prev._count
        ? { ...prev._count, posts: Math.max(0, (prev._count.posts || 0) - 1) }
        : prev._count,
    }));
    toast.success('Pensée supprimée.');
    return true;
  };

  // Filter content for tabs
  const rootThoughts = user.posts?.filter((p) => !p.parentId) || [];
  const replyThoughts = user.posts?.filter((p) => !!p.parentId) || [];
  const articlesList = user.articles || [];
  const repostsList = user.posts?.filter((p) => !!p.repostId && !!p.repost) || [];
  const mediaThoughts = user.posts?.filter((p) => !!p.imageUrl) || [];
  const pinnedThoughts = rootThoughts.filter((p) => p.isPinned);
  const regularThoughts = rootThoughts.filter((p) => !p.isPinned);
  const siteUrl = user.customDomain || (user.subdomain ? `${user.subdomain}.qoe.fi` : null);
  const profileHandle = user.username || user.subdomain || 'user';

  const formattedJoinedDate = new Date(user.createdAt).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <ReaderPageLayout hideHeader>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 font-sans space-y-6">
        {/* Back navigation */}
        <button
          onClick={() => {
            if (typeof window !== 'undefined' && window.history.length > 1) {
              window.history.back();
            } else {
              window.location.href = routes.feed.home();
            }
          }}
          className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Retour</span>
        </button>

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
              <div className="ring-4 ring-card rounded-2xl overflow-hidden bg-card">
                {user.type === 'MEDIA' ? (
                  <div className="w-24 h-24 sm:w-28 sm:h-28 relative bg-muted">
                    {user.logoUrl ? (
                      <Image
                        src={user.logoUrl}
                        alt={user.name || ''}
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-brand/10 flex items-center justify-center font-black text-2xl text-brand">
                        {user.name?.substring(0, 2) || 'NA'}
                      </div>
                    )}
                  </div>
                ) : (
                  <AuthorAvatar user={user} size="2xl" showBadge={false} />
                )}
              </div>

              {isOwnProfile ? (
                <button
                  onClick={() => setIsEditModalOpen(true)}
                  className="px-4 py-2 border border-border/60 hover:bg-muted text-foreground text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-2"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{t`Éditer le profil`}</span>
                </button>
              ) : (
                <button
                  onClick={handleFollowToggle}
                  className={cn(
                    'px-5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer shadow-xs',
                    isFollowing
                      ? 'border border-border/60 bg-card hover:bg-destructive/10 hover:text-destructive text-foreground'
                      : 'bg-foreground text-background hover:opacity-90'
                  )}
                >
                  {isFollowing ? 'Abonné' : 'Suivre'}
                </button>
              )}

              {/* Partager le profil */}
              <ShareMenu
                title={`Profil de ${user.name || user.username || 'Utilisateur'}`}
                authorHandle={user.username || user.subdomain || user.id}
                trigger={
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    title="Partager ce profil"
                    className="h-9 w-9 flex items-center justify-center border border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg transition-colors cursor-pointer"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                  </button>
                }
              />
            </div>

            {/* User Identity */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-foreground leading-none">
                  {user.name}
                </h1>
                {user.isCertified && <CertifiedBadge size={16} />}
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
                  href={`https://${siteUrl}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 text-brand hover:underline cursor-pointer"
                >
                  <LinkIcon className="w-3.5 h-3.5" />
                  <span>{siteUrl}</span>
                </a>
              )}
            </div>

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
                onClick={() => setFollowsModalTab('following')}
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
                onClick={() => setFollowsModalTab('followers')}
                className="flex items-center gap-1.5 cursor-pointer hover:underline group"
              >
                <span className="font-bold text-foreground">{followersCount}</span>
                <span className="text-muted-foreground font-medium group-hover:text-foreground transition-colors">
                  abonnés
                </span>
              </button>
            </div>
          </div>

          {/* Profile Tabs Navigation */}
          <div className="flex items-center gap-1 border-t border-border/40 px-3 overflow-x-auto no-scrollbar">
            <TabButton
              active={activeTab === 'thoughts'}
              onClick={() => handleTabChange('thoughts')}
              icon={<MessageSquare className="w-3.5 h-3.5" />}
              label="Pensées"
              count={rootThoughts.length}
            />
            <TabButton
              active={activeTab === 'with_replies'}
              onClick={() => handleTabChange('with_replies')}
              icon={<MessageSquare className="w-3.5 h-3.5 opacity-60" />}
              label="Réponses"
              count={replyThoughts.length}
            />
            <TabButton
              active={activeTab === 'articles'}
              onClick={() => handleTabChange('articles')}
              icon={<FileText className="w-3.5 h-3.5" />}
              label="Articles"
              count={articlesList.length}
            />
            <TabButton
              active={activeTab === 'reposts'}
              onClick={() => handleTabChange('reposts')}
              icon={<Repeat className="w-3.5 h-3.5" />}
              label="Reposts"
              count={repostsList.length}
            />
            <TabButton
              active={activeTab === 'media'}
              onClick={() => handleTabChange('media')}
              icon={<ImageIcon className="w-3.5 h-3.5" />}
              label="Médias"
              count={mediaThoughts.length}
            />
          </div>
        </div>

        {/* Tab Content Stream — Instant, Snappy Rendering without Fade Lag */}
        <div className="space-y-4">
          {activeTab === 'thoughts' && (
            <div className="space-y-2">
              {rootThoughts.length === 0 ? (
                replyThoughts.length > 0 ? (
                  <div className="py-10 text-center text-xs text-muted-foreground bg-card/40 border border-border/30 rounded-xl space-y-3 p-4">
                    <p className="italic">Aucune pensée principale publiée pour le moment.</p>
                    <button
                      type="button"
                      onClick={() => handleTabChange('with_replies')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand/10 text-brand font-semibold rounded-lg hover:bg-brand/20 transition-colors cursor-pointer"
                    >
                      Afficher les {replyThoughts.length} réponse
                      {replyThoughts.length > 1 ? 's' : ''} de @{profileHandle}
                    </button>
                  </div>
                ) : (
                  <EmptyTabMessage message="Aucune pensée originale publiée pour le moment." />
                )
              ) : (
                <>
                  {/* Pensées épinglées en tête (parité Bluesky) */}
                  {pinnedThoughts.map((post) => (
                    <div key={post.id} className="relative">
                      <div className="flex items-center gap-1.5 px-1 pt-2 pb-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                        <Pin className="w-3 h-3" />
                        <span>Épinglé</span>
                      </div>
                      <ThoughtCard
                        post={post}
                        currentUserId={currentUserId}
                        onDeletePost={handleDeletePost}
                        onOpenPost={(id, authorUsername) => {
                          const handle = authorUsername || profileHandle || user.id;
                          window.location.href = routes.feed.thought(handle, id);
                        }}
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
                        window.location.href = routes.feed.thought(handle, id);
                      }}
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
                  <ThoughtCard
                    key={post.id}
                    post={post}
                    currentUserId={currentUserId}
                    onDeletePost={handleDeletePost}
                    onOpenPost={(id, authorUsername) => {
                      const handle = authorUsername || user.username || user.subdomain || user.id;
                      window.location.href = routes.feed.thought(handle, id);
                    }}
                  />
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
                    dbUser={{ id: currentUserId }}
                    isBookmarked={false}
                    isFollowed={isFollowing}
                    handleFollowToggle={handleFollowToggle}
                    handleBookmarkToggle={() => {}}
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
                      window.location.href = routes.feed.thought(handle, id);
                    }}
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
                          (window.location.href = routes.feed.thought(
                            post.author?.username ||
                              post.author?.subdomain ||
                              profileHandle ||
                              user.id,
                            post.id
                          ))
                        }
                        className="relative aspect-square overflow-hidden rounded-xl bg-muted group cursor-pointer"
                      >
                        <Image
                          src={post.imageUrl}
                          alt=""
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-200"
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

function TabButton({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition-all cursor-pointer whitespace-nowrap',
        active
          ? 'border-foreground text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground'
      )}
    >
      {icon}
      <span>{label}</span>
      {count > 0 && (
        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-full text-muted-foreground">
          {count}
        </span>
      )}
    </button>
  );
}

function EmptyTabMessage({ message }: { message: string }) {
  return (
    <div className="py-12 text-center text-xs text-muted-foreground italic bg-card/40 border border-border/30 rounded-xl">
      {message}
    </div>
  );
}
