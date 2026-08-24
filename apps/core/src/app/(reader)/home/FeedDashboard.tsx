'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ReaderPageLayout } from '@/components/layout/ReaderPageLayout';
import { BookMarked, AlertCircle } from 'lucide-react';
import {
  toggleFollowCreatorHomeAction as toggleFollowCreatorHome,
  toggleBookmarkArticleHomeAction as toggleBookmarkArticleHome,
  getArticleThreadAction as getArticleThread,
} from '@qoe/api-client/actions/feed';
import { toast } from 'sonner';

import {
  GuestFloatingBar,
  useAuthModal,
  MediaLightbox,
  HotkeyHelpModal,
  OnboardingModal,
  WidgetErrorBoundary,
  type AuthActionContext,
  type OnboardingCategory,
  type OnboardingCreator,
  type OnboardingSubmitData,
} from '@qoe/ui';
import { useFeedImpressionTracker } from '@qoe/analytics';
import { ArticleCard } from './components/ArticleCard';
import { ThoughtFeedSlice } from './components/ThoughtFeedSlice';
import { VirtualizedFeedList } from '@/components/feed/VirtualizedFeedList';
import { RealtimeFeedPill } from '@/components/feed/RealtimeFeedPill';
import { useRealtimeFeedBuffer } from '@/hooks/useRealtimeFeedBuffer';
import { useOptimisticBookmark, useOptimisticFollow, useDeletePostMutation } from '@qoe/api-client';
import { ComposerModal } from './components/ComposerModal';
import { FeedTabsHeader } from './components/FeedTabsHeader';
import { ThoughtThreadView } from './components/ThoughtThreadView';
import { ArticleReaderDrawer } from '@/components/social/ArticleReaderDrawer';
import {
  FeedSidebarWidgets,
  type SemanticTrendingTopic,
  type SuggestedCreator,
} from './components/FeedSidebarWidgets';
import { t } from '@lingui/core/macro';
import { trackEvent } from '@/lib/analytics';
import { routes } from '@qoe/config/routes';
import { cn } from '@qoe/utils';
import type { ThoughtData } from '@qoe/api-client';
import type { FeedSlice } from '@/lib/feed-types';

interface Author {
  id: string;
  name: string | null;
  username: string | null;
  subdomain?: string | null;
  customDomain?: string | null;
  logoUrl: string | null;
  heroText?: string | null;
  isCertified?: boolean;
  type?: 'PERSONAL' | 'MEDIA';
  authorName?: string | null;
  journalist?: {
    id: string;
    name: string | null;
    username: string | null;
    logoUrl: string | null;
    isCertified?: boolean;
  } | null;
  coAuthors?: Array<{
    id: string;
    name: string | null;
    username: string | null;
    logoUrl: string | null;
    isCertified?: boolean;
  }>;
  contributors?: Array<{
    id: string;
    name: string | null;
    username: string | null;
    logoUrl: string | null;
    isCertified?: boolean;
    role?: string;
    order?: number;
    isVisible?: boolean;
  }>;
}

interface Creator {
  id: string;
  name?: string | null;
  username?: string | null;
  subdomain?: string | null;
  logoUrl?: string | null;
  heroText?: string | null;
  isCertified?: boolean;
}

interface Trend {
  id: string;
  hashtag: string;
  count: number;
}

interface PartnerPromo {
  id: string;
  title: string;
  description: string;
  ctaText: string | null;
  ctaUrl: string | null;
  imageUrl: string | null;
  isActive: boolean;
}

interface Article {
  id: string;
  title: string;
  slug: string;
  content: string;
  imageUrl?: string | null;
  published: boolean;
  isPremium: boolean;
  accessGranted?: boolean;
  isLoading?: boolean;
  readingTime: number;
  createdAt: Date | string;
  author: Author;
  category: { name: string } | null;
  tags?: string[];
}

interface FeedPost {
  id: string;
  content?: string | null;
  imageUrl?: string | null;
  createdAt?: Date | string;
  triggerWarning?: string | null;
  author?: Author;
  authorId?: string;
  parentId?: string | null;
  rootId?: string | null;
  repostId?: string | null;
  repost?: unknown;
  poll?: unknown;
}

interface FeedSliceItem {
  id: string;
  title: string;
  slug: string;
  createdAt: Date | string;
  content?: string;
  category?: { name: string } | null;
  author?: Author;
  targetPost: FeedPost | null;
  parentPost?: FeedPost | null;
  rootPost?: FeedPost | null;
  isIncompleteThread: boolean;
  hiddenIntermediateCount?: number;
}

type FeedItem = Article | FeedSliceItem;

interface FeedDashboardProps {
  dbUser: {
    id: string;
    name: string | null;
    email: string;
    walletBalanceCents: number;
    onboardingText: string | null;
    role: string;
    logoUrl: string | null;
    username: string | null;
  } | null;
  followingArticles: FeedItem[];
  recommendationArticles: FeedItem[];
  feedHasMore?: boolean;
  discoverArticles: FeedItem[];
  bookmarks: Article[];
  followedCreators: Creator[];
  suggestedCreators: SuggestedCreator[];
  semanticTrends?: SemanticTrendingTopic[];
  initialFollowsCount: number;
  followedAuthorIds: string[];
  initialBookmarksCount: number;
  initialHighlightsCount: number;
  mutedWords?: string[];
  featuredArticle: Article | null;
  recommendedArticles: Article[];
  trends: Trend[];
  promos: PartnerPromo[];
  needsOnboarding?: boolean;
  onboardingCategories?: OnboardingCategory[];
  onboardingSuggestedCreators?: OnboardingCreator[];
  activityData?: number[];
}

export function FeedDashboard({
  dbUser,
  followingArticles,
  recommendationArticles,
  feedHasMore = false,
  discoverArticles,
  bookmarks: initialBookmarks,
  followedCreators: initialFollowedCreators,
  suggestedCreators,
  semanticTrends,
  followedAuthorIds,
  mutedWords = [],
  needsOnboarding = false,
  onboardingCategories,
  onboardingSuggestedCreators,
  initialFollowsCount,
  initialBookmarksCount,
  initialHighlightsCount,
  activityData,
}: FeedDashboardProps) {
  const [activeFeed, setActiveFeed] = useState<string>('recommandation');
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(needsOnboarding);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [activeArticle, setActiveArticle] = useState<Article | null>(null);
  const [activeArticleSource, setActiveArticleSource] = useState<
    'feed' | 'subdomain' | 'public_profile' | 'direct' | undefined
  >(undefined);
  const [isComposerModalOpen, setIsComposerModalOpen] = useState(false);
  const [isHotkeyModalOpen, setIsHotkeyModalOpen] = useState(false);
  const [lightboxImages] = useState<{ url: string; alt?: string | null }[]>([]);
  const [lightboxIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  // Global Hotkeys Listener
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger hotkeys if typing inside an input/textarea
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setIsComposerModalOpen(true);
      } else if (e.key === '?') {
        e.preventDefault();
        setIsHotkeyModalOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const { mutate: mutateBookmark } = useOptimisticBookmark();
  const { mutate: mutateFollow } = useOptimisticFollow();
  const { mutateAsync: deletePostMutation } = useDeletePostMutation();

  const { unreadCount, flushBuffer } = useRealtimeFeedBuffer({
    enabled: activeFeed === 'recommandation' || activeFeed === 'abonnement',
    type: activeFeed === 'abonnement' ? 'following' : 'for-you',
  });

  const { openAuthModal } = useAuthModal();

  const openAuth = (options?: { mode?: 'login' | 'signup'; actionContext?: AuthActionContext }) => {
    openAuthModal({ mode: options?.mode || 'login', actionContext: options?.actionContext });
  };

  const [bookmarks, setBookmarks] = useState<Article[]>(initialBookmarks);
  const [followedCreators, setFollowedCreators] = useState<Creator[]>(initialFollowedCreators);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [localPosts, setLocalPosts] = useState<FeedItem[]>([]);
  const [interactions, setInteractions] = useState<Record<string, { bookmarked?: boolean }>>({});

  // Pagination infinie du « Pour vous » (moteur vectoriel, pages via /api/feed/personalized)
  const [feedItems, setFeedItems] = useState<FeedItem[]>(recommendationArticles);
  const [feedHasMoreState, setFeedHasMoreState] = useState(feedHasMore);
  const [isFetchingNextPage, setIsFetchingNextPage] = useState(false);
  const feedNextOffsetRef = React.useRef(recommendationArticles.length);
  const isFetchingRef = React.useRef(false);
  const hasMoreRef = React.useRef(feedHasMore);
  React.useEffect(() => {
    hasMoreRef.current = feedHasMoreState;
  }, [feedHasMoreState]);
  React.useEffect(() => {
    isFetchingRef.current = isFetchingNextPage;
  }, [isFetchingNextPage]);

  const fetchNextFeedPage = React.useCallback(async () => {
    if (isFetchingRef.current || !hasMoreRef.current) return;
    isFetchingRef.current = true;
    setIsFetchingNextPage(true);
    try {
      const res = await fetch(
        `/api/feed/personalized?limit=20&offset=${feedNextOffsetRef.current}`
      );
      if (!res.ok) throw new Error('FEED_FAILED');
      const data = (await res.json()) as {
        items: FeedItem[];
        hasMore: boolean;
        nextOffset: number;
      };
      setFeedItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        const fresh = data.items.filter((i) => !seen.has(i.id));
        return fresh.length ? [...prev, ...fresh] : prev;
      });
      feedNextOffsetRef.current = data.nextOffset;
      hasMoreRef.current = data.hasMore;
      setFeedHasMoreState(data.hasMore);
    } catch (err) {
      console.error('[feed] pagination « Pour vous »', err);
    } finally {
      isFetchingRef.current = false;
      setIsFetchingNextPage(false);
    }
  }, []);

  const isCreatorFollowed = (creatorId: string) => followedCreators.some((f) => f.id === creatorId);
  const isArticleBookmarked = (articleId: string) => {
    const inter = interactions[articleId];
    if (inter?.bookmarked !== undefined) return inter.bookmarked;
    return bookmarks.some((b) => b.id === articleId);
  };

  const currentFeedArticles = useMemo(() => {
    let list: FeedItem[] = [];
    if (activeFeed === 'recommandation') {
      list = [...localPosts, ...feedItems];
    } else if (activeFeed === 'abonnement') {
      list = [
        ...localPosts.filter((p) => isCreatorFollowed(p.author?.id || '')),
        ...followingArticles,
      ];
    } else if (activeFeed === 'decouvrir') {
      list = discoverArticles;
    } else if (activeFeed === 'bookmarks') {
      list = bookmarks;
    }

    if (mutedWords && mutedWords.length > 0) {
      list = list.filter((art) => {
        if (!art) return false;
        const contentLower = (art.content || '').toLowerCase();
        const titleLower = (art.title || '').toLowerCase();
        return !mutedWords.some((word) => contentLower.includes(word) || titleLower.includes(word));
      });
    }

    const seenIds = new Set<string>();
    list = list.filter((art) => {
      if (!art || !art.id) return false;
      const idStr = String(art.id);
      if (seenIds.has(idStr)) return false;
      seenIds.add(idStr);
      return true;
    });

    if (selectedTag) {
      list = list.filter(
        (art) =>
          art.title.toLowerCase().includes(selectedTag.toLowerCase()) ||
          (art.content || '').toLowerCase().includes(selectedTag.toLowerCase()) ||
          (art.category && art.category.name.toLowerCase() === selectedTag.toLowerCase())
      );
    }

    return list;
  }, [
    activeFeed,
    localPosts,
    feedItems,
    followingArticles,
    discoverArticles,
    bookmarks,
    selectedTag,
    followedCreators,
    mutedWords,
  ]);

  const handleFollowToggle = async (creator: Creator) => {
    if (!dbUser) {
      openAuth({ mode: 'signup', actionContext: 'follow' });
      return;
    }
    const isCurrentlyFollowed = isCreatorFollowed(creator.id);
    trackEvent('follow_creator_toggled', { creatorId: creator.id, followed: !isCurrentlyFollowed });

    if (isCurrentlyFollowed) {
      setFollowedCreators((prev) => prev.filter((f) => f.id !== creator.id));
    } else {
      setFollowedCreators((prev) => [creator, ...prev]);
    }

    mutateFollow({
      creatorId: creator.id,
      isFollowedCurrent: isCurrentlyFollowed,
      followMutationFn: async (id: string) => {
        const res = await toggleFollowCreatorHome(id);
        return { success: res.ok };
      },
    });
  };

  const handleBookmarkToggle = async (article: Article) => {
    if (!dbUser) {
      openAuth({ mode: 'signup', actionContext: 'bookmark' });
      return;
    }
    const isCurrentlyBookmarked = isArticleBookmarked(article.id);

    setInteractions((prev) => ({
      ...prev,
      [article.id]: {
        ...prev[article.id],
        bookmarked: !isCurrentlyBookmarked,
      },
    }));

    trackEvent('bookmark_toggled', { articleId: article.id, bookmarked: !isCurrentlyBookmarked });

    if (isCurrentlyBookmarked) {
      setBookmarks((prev) => prev.filter((b) => b.id !== article.id));
    } else {
      setBookmarks((prev) => [article, ...prev]);
    }

    mutateBookmark({
      articleId: article.id,
      isBookmarkedCurrent: isCurrentlyBookmarked,
      bookmarkMutationFn: async (id: string) => {
        const res = await toggleBookmarkArticleHome(id);
        return { success: res.ok };
      },
    });
  };

  const handleDeletePost = async (postId: string): Promise<boolean> => {
    if (!dbUser) {
      openAuth({ mode: 'signup', actionContext: 'delete' });
      return false;
    }

    trackEvent('thought_delete', { postId });

    const res = await deletePostMutation(postId);

    if (!res.ok) {
      toast.error(t`Erreur lors de la suppression de la pensée.`);
      return false;
    }

    toast.success(t`Pensée supprimée.`);
    return true;
  };

  // 🚫 « Voir moins de contenu comme ça » — feedback négatif explicite.
  // Retire la carte localement ; l'exclusion SQL + le push vectoriel sont
  // faits par /api/feed/show-less (appelé dans les composants cartes).
  const handleHideArticle = (article: Article) => {
    setLocalPosts((prev) => prev.filter((p) => p.id !== article.id));
    setFeedItems((prev) => prev.filter((p) => p.id !== article.id));
    trackEvent('feed_show_less', { articleId: article.id });
    toast.success(t`Tu verras moins de contenu comme ça.`);
  };

  const handleHidePost = (postId: string) => {
    setLocalPosts((prev) => prev.filter((p) => p.id !== postId));
    setFeedItems((prev) => prev.filter((p) => p.id !== postId));
  };

  const [savedScrollPosition, setSavedScrollPosition] = useState<number>(0);

  const handleOpenPost = (postId: string, authorUsername?: string) => {
    const scroll = window.scrollY;
    setSavedScrollPosition(scroll);
    const foundItem = currentFeedArticles.find((item) => item.id === postId);
    const handle =
      authorUsername ||
      foundItem?.author?.username ||
      foundItem?.author?.subdomain ||
      foundItem?.author?.id ||
      'author';
    const newUrl = routes.feed.thought(handle, postId);
    window.history.pushState({ postId, scroll }, '', newUrl);
    setActivePostId(postId);
    setActiveArticle(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleClosePost = () => {
    setActivePostId(null);
    if (window.location.pathname.includes('/thought/')) {
      window.history.pushState(null, '', routes.feed.home());
    }
    setTimeout(() => {
      window.scrollTo({ top: savedScrollPosition, behavior: 'instant' });
    }, 50);
  };

  const handleOpenArticle = async (articleInput: Partial<Article>) => {
    const scroll = window.scrollY;
    setSavedScrollPosition(scroll);
    const slug = articleInput?.slug || articleInput?.id;
    if (!slug) return;

    setActiveArticleSource('feed');
    window.history.pushState({ articleSlug: slug, scroll }, '', routes.feed.article(slug));

    if (articleInput && articleInput.content && articleInput.title && articleInput.author) {
      setActiveArticle(articleInput as Article);
      setActivePostId(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Immediately open drawer with loading state while fetching full article thread
    setActiveArticle({
      id: articleInput.id || slug,
      title: articleInput.title || t`Chargement...`,
      slug: slug,
      content: '',
      readingTime: articleInput.readingTime || 3,
      createdAt: articleInput.createdAt || new Date(),
      author: articleInput.author || {
        id: 'loading',
        name: t`Chargement...`,
        username: '...',
        subdomain: null,
        customDomain: null,
        logoUrl: null,
        heroText: null,
      },
      category: null,
      published: true,
      isPremium: articleInput.isPremium || false,
      isLoading: true,
    });
    setActivePostId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
      const res = await getArticleThread(slug);
      if (res.ok && res.data?.article) {
        setActiveArticle(res.data.article);
      } else {
        window.location.href = routes.feed.article(slug);
      }
    } catch {
      window.location.href = routes.feed.article(slug);
    }
  };

  const handleCloseArticle = () => {
    setActiveArticle(null);
    setActiveArticleSource(undefined);
    if (window.location.pathname.includes('/article/')) {
      window.history.pushState(null, '', routes.feed.home());
    }
    setTimeout(() => {
      window.scrollTo({ top: savedScrollPosition, behavior: 'instant' });
    }, 50);
  };

  React.useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (e.state?.postId) {
        setActivePostId(e.state.postId);
        setActiveArticle(null);
      } else if (e.state?.articleSlug) {
        const found = currentFeedArticles.find((item) => item.slug === e.state.articleSlug);
        if (found) {
          setActiveArticle(found as Article);
        }
        setActivePostId(null);
      } else {
        setActivePostId(null);
        setActiveArticle(null);
        if (e.state?.scroll !== undefined) {
          window.scrollTo({ top: e.state.scroll, behavior: 'instant' });
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [currentFeedArticles]);

  const [composerQuotedThought, setComposerQuotedThought] = useState<ThoughtData | null>(null);
  const [composerReplyToThought, setComposerReplyToThought] = useState<ThoughtData | null>(null);
  const [composerQuotedArticle, setComposerQuotedArticle] = useState<Article | null>(null);
  const [composerQuotedExcerpt, setComposerQuotedExcerpt] = useState<string | null>(null);
  const [composerInitialText, setComposerInitialText] = useState<string>('');
  const [composerInitialMode, setComposerInitialMode] = useState<'thought' | 'article'>('thought');

  React.useEffect(() => {
    const handleOpenComposer = (e: Event) => {
      if (!dbUser) {
        openAuthModal({ mode: 'signup', actionContext: 'comment' });
        return;
      }
      const customDetail = (e as CustomEvent)?.detail;
      if (customDetail?.replyToThought) {
        setComposerReplyToThought(customDetail.replyToThought);
        setComposerQuotedThought(null);
        setComposerQuotedArticle(null);
        setComposerQuotedExcerpt(null);
        setComposerInitialText(customDetail.initialText || '');
        setComposerInitialMode('thought');
      } else if (customDetail?.quotedThought) {
        setComposerQuotedThought(customDetail.quotedThought);
        setComposerReplyToThought(null);
        setComposerQuotedArticle(null);
        setComposerQuotedExcerpt(null);
        setComposerInitialText(customDetail.initialText || '');
        setComposerInitialMode('thought');
      } else if (customDetail?.quotedArticle) {
        setComposerQuotedArticle(customDetail.quotedArticle);
        setComposerQuotedExcerpt(customDetail.quotedExcerpt || null);
        setComposerQuotedThought(null);
        setComposerReplyToThought(null);
        setComposerInitialText(customDetail.initialText || '');
        setComposerInitialMode('thought');
      } else if (customDetail?.initialText) {
        setComposerInitialText(customDetail.initialText);
        setComposerQuotedThought(null);
        setComposerReplyToThought(null);
        setComposerQuotedArticle(null);
        setComposerQuotedExcerpt(null);
        setComposerInitialMode('thought');
      } else if (customDetail?.mode) {
        setComposerInitialMode(customDetail.mode);
        setComposerQuotedThought(null);
        setComposerReplyToThought(null);
        setComposerQuotedArticle(null);
        setComposerQuotedExcerpt(null);
        setComposerInitialText('');
      } else {
        setComposerQuotedThought(null);
        setComposerReplyToThought(null);
        setComposerQuotedArticle(null);
        setComposerQuotedExcerpt(null);
        setComposerInitialText('');
        setComposerInitialMode('thought');
      }
      setIsComposerModalOpen(true);
    };

    const handleResetFeedView = () => {
      setActivePostId(null);
      setActiveArticle(null);
      if (
        window.location.pathname.includes('/thought/') ||
        window.location.pathname.includes('/article/')
      ) {
        window.history.pushState(null, '', routes.feed.home());
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'n')) {
        e.preventDefault();
        handleOpenComposer(e);
      }
    };

    const handleThoughtCreated = (e: Event) => {
      const customDetail = (e as CustomEvent)?.detail;
      if (customDetail && customDetail.id) {
        setLocalPosts((prev) => [
          customDetail,
          ...prev.filter((post) => post.id !== customDetail.id),
        ]);
      }
    };

    window.addEventListener('open-composer', handleOpenComposer);
    window.addEventListener('thought-created', handleThoughtCreated);
    window.addEventListener('reset-feed-view', handleResetFeedView);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('open-composer', handleOpenComposer);
      window.removeEventListener('thought-created', handleThoughtCreated);
      window.removeEventListener('reset-feed-view', handleResetFeedView);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [dbUser]);

  const tagsList = [
    '#souverainete',
    '#anti-ia',
    '#attention',
    '#philosophie',
    '#design',
    '#creators',
  ];

  // 👁️ Wrapper impression : fire-once par item (IntersectionObserver, batché)
  const ImpressionWrapper: React.FC<{
    children: React.ReactNode;
    itemType: 'ARTICLE' | 'THOUGHT';
    itemId: string;
    position: number;
    isDiscovery?: boolean;
  }> = ({ children, itemType, itemId, position, isDiscovery }) => {
    const ref = useFeedImpressionTracker({ itemType, itemId, position, isDiscovery });
    return <div ref={ref}>{children}</div>;
  };

  return (
    <ReaderPageLayout giantTitle={t`Lire`} hideHeader={!!activePostId || !!activeArticle}>
      {/* ── SLIDING FEED SHEET ── */}
      <motion.main
        initial={false}
        animate={{
          marginTop: activePostId || activeArticle ? 0 : 256,
        }}
        transition={{ type: 'spring', stiffness: 350, damping: 32 }}
        className={cn(
          'bg-card/95 backdrop-blur-2xl text-card-foreground border-x border-border/40 shadow-2xl min-h-screen relative z-10 transition-colors',
          activePostId || activeArticle ? 'rounded-none border-t-0' : 'rounded-t-2xl border-t'
        )}
      >
        {/* Opaque Sticky Header of the Sheet (No Background Bleed-Through) */}
        <div className="sticky top-0 z-20 flex items-center justify-between px-4 sm:px-6 py-3 bg-card border-b border-border/40 rounded-t-2xl">
          <FeedTabsHeader
            activeFeed={activeFeed}
            onTabChange={(id) => {
              if (activeFeed === id) {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              } else {
                setActiveFeed(id);
                setSelectedTag(null);
                setActivePostId(null);
                setActiveArticle(null);
                trackEvent('feed_tab_changed', { tab: id });
              }
            }}
          />
        </div>

        {/* Responsive Grid Container (Main Stream + Semantic Sidebar) */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Main Feed Column */}
          <div className="lg:col-span-8 space-y-8 min-w-0">
            <AnimatePresence mode="popLayout">
              {activePostId ? (
                <motion.div
                  key="expanded-post"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1, ease: 'easeOut' }}
                >
                  <ThoughtThreadView
                    postId={activePostId}
                    currentUserId={dbUser?.id || null}
                    dbUser={dbUser}
                    onClose={handleClosePost}
                    onOpenArticle={handleOpenArticle}
                    onOpenProfile={(username) => {
                      window.location.href = routes.feed.profile(username);
                    }}
                    onInteractionUpdate={(postId, update) => {
                      setInteractions((prev) => ({
                        ...prev,
                        [postId]: {
                          ...prev[postId],
                          ...update,
                        },
                      }));
                    }}
                    onLoginRequired={() => openAuthModal({ mode: 'login' })}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="feed-list"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1, ease: 'easeOut' }}
                  className="space-y-6"
                >
                  <div className="space-y-2">
                    <AnimatePresence mode="popLayout">
                      {activeFeed === 'bookmarks' && currentFeedArticles.length === 0 && (
                        <motion.div
                          key="bookmarks-empty"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.1 }}
                          className="bg-muted/40 border border-border/40 rounded-xl p-10 text-center flex flex-col items-center justify-center gap-2.5 text-muted-foreground"
                        >
                          <BookMarked className="w-7 h-7 text-muted-foreground/60" />
                          <h4 className="font-semibold text-xs text-foreground">
                            {t`Votre Sanctuaire est vide`}
                          </h4>
                          <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
                            {t`Enregistrez des articles en cliquant sur l'icône de signet pour les conserver ici.`}
                          </p>
                        </motion.div>
                      )}

                      {currentFeedArticles.length === 0 && activeFeed !== 'bookmarks' ? (
                        <motion.div
                          key="empty-state"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="bg-muted/40 border border-border/40 rounded-xl p-12 text-center flex flex-col items-center justify-center gap-2.5"
                        >
                          <AlertCircle className="w-7 h-7 text-muted-foreground/60" />
                          <h4 className="font-semibold text-xs text-foreground">
                            {t`Aucun article trouvé`}
                          </h4>
                          <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
                            {t`Essayez d'effacer le tag filtre ou de suivre de nouveaux créateurs dans la liste Explorer.`}
                          </p>
                        </motion.div>
                      ) : (
                        <div key={`feed-${activeFeed}`} className="space-y-4">
                          <RealtimeFeedPill unreadCount={unreadCount} onFlush={flushBuffer} />
                          <VirtualizedFeedList
                            items={currentFeedArticles}
                            fetchNextPage={
                              activeFeed === 'recommandation' ? fetchNextFeedPage : undefined
                            }
                            hasNextPage={activeFeed === 'recommandation' ? feedHasMoreState : false}
                            isFetchingNextPage={isFetchingNextPage}
                            keyExtractor={(article) => article.id}
                            estimateSize={180}
                            renderItem={(article, idx) => {
                              const isBookmarked = isArticleBookmarked(article.id);
                              const authorId =
                                article.author?.id ||
                                (article as FeedSliceItem).targetPost?.author?.id;
                              const isFollowed = authorId ? isCreatorFollowed(authorId) : false;
                              const isFollowedAuthor =
                                'journalist' in article &&
                                Boolean(
                                  article.author?.journalist?.id &&
                                  followedAuthorIds.includes(article.author.journalist.id)
                                );

                              if (!article.title) {
                                const isSlice = 'targetPost' in article;

                                const sliceData = isSlice
                                  ? {
                                      id: article.id,
                                      rootPost: (article as FeedSliceItem).rootPost,
                                      parentPost: (article as FeedSliceItem).parentPost,
                                      targetPost: (article as FeedSliceItem).targetPost,
                                      isIncompleteThread: (article as FeedSliceItem)
                                        .isIncompleteThread,
                                      hiddenIntermediateCount: (article as FeedSliceItem)
                                        .hiddenIntermediateCount,
                                    }
                                  : {
                                      id: article.id,
                                      targetPost: article,
                                      isIncompleteThread: false,
                                    };

                                return (
                                  <ImpressionWrapper
                                    key={article.id}
                                    itemType="THOUGHT"
                                    itemId={article.id}
                                    position={idx}
                                  >
                                    <ThoughtFeedSlice
                                      slice={sliceData as unknown as FeedSlice}
                                      currentUserId={dbUser?.id || null}
                                      onOpenPost={handleOpenPost}
                                      onOpenArticle={handleOpenArticle}
                                      onOpenProfile={(username) => {
                                        window.location.href = routes.feed.profile(username);
                                      }}
                                      onDeletePost={handleDeletePost}
                                      onHidePost={dbUser ? handleHidePost : undefined}
                                    />
                                  </ImpressionWrapper>
                                );
                              }

                              return (
                                <ImpressionWrapper
                                  key={article.id}
                                  itemType="ARTICLE"
                                  itemId={article.id}
                                  position={idx}
                                  isDiscovery={
                                    (article as { isDiscovery?: boolean }).isDiscovery === true
                                  }
                                >
                                  <ArticleCard
                                    article={
                                      article as unknown as React.ComponentProps<
                                        typeof ArticleCard
                                      >['article']
                                    }
                                    idx={idx}
                                    dbUser={dbUser}
                                    isBookmarked={isBookmarked}
                                    isFollowed={isFollowed}
                                    isFollowedAuthor={isFollowedAuthor}
                                    handleFollowToggle={handleFollowToggle}
                                    handleBookmarkToggle={handleBookmarkToggle}
                                    featured={idx === 0 && activeFeed === 'recommandation'}
                                    discovery={
                                      (article as { isDiscovery?: boolean }).isDiscovery === true
                                    }
                                    onHideArticle={
                                      dbUser
                                        ? (art) => handleHideArticle(art as Article)
                                        : undefined
                                    }
                                    onOpenArticle={handleOpenArticle}
                                    onOpenPost={handleOpenPost}
                                    onOpenProfile={(username) => {
                                      window.location.href = routes.feed.profile(username);
                                    }}
                                  />
                                </ImpressionWrapper>
                              );
                            }}
                          />
                        </div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right Sidebar Widgets Column */}
          <WidgetErrorBoundary>
            <FeedSidebarWidgets
              suggestedCreators={suggestedCreators}
              semanticTrends={semanticTrends}
              onFollowToggle={(c) => {
                handleFollowToggle(c as unknown as Creator);
              }}
              onOpenProfile={(username) => {
                window.location.href = routes.feed.profile(username);
              }}
              onSelectTopic={(topicName) => {
                setSelectedTag(topicName);
              }}
              userStats={
                dbUser
                  ? {
                      articlesRead: initialBookmarksCount,
                      highlights: initialHighlightsCount,
                      following: initialFollowsCount,
                    }
                  : undefined
              }
              activityData={activityData}
            />
          </WidgetErrorBoundary>
        </div>
      </motion.main>

      <ArticleReaderDrawer
        isOpen={!!activeArticle}
        article={activeArticle}
        onClose={handleCloseArticle}
        initialSource={activeArticleSource}
      />

      <ComposerModal
        isOpen={isComposerModalOpen}
        onClose={() => {
          setIsComposerModalOpen(false);
          setComposerQuotedThought(null);
          setComposerReplyToThought(null);
          setComposerQuotedArticle(null);
          setComposerQuotedExcerpt(null);
          setComposerInitialText('');
        }}
        dbUser={dbUser}
        tagsList={tagsList}
        quotedThought={composerQuotedThought}
        replyToThought={composerReplyToThought}
        quotedArticle={composerQuotedArticle}
        quotedExcerpt={composerQuotedExcerpt}
        initialText={composerInitialText}
        initialMode={composerInitialMode}
        onPostCreated={(post) =>
          setLocalPosts((prev) => [post, ...prev.filter((existing) => existing.id !== post.id)])
        }
        onLoginRequired={() => openAuthModal({ mode: 'signup', actionContext: 'comment' })}
      />
      <MediaLightbox
        isOpen={isLightboxOpen}
        images={lightboxImages}
        initialIndex={lightboxIndex}
        onClose={() => setIsLightboxOpen(false)}
      />
      <HotkeyHelpModal isOpen={isHotkeyModalOpen} onClose={() => setIsHotkeyModalOpen(false)} />
      {needsOnboarding && (
        <OnboardingModal
          open={isOnboardingModalOpen}
          onOpenChange={setIsOnboardingModalOpen}
          dismissible={false}
          categories={onboardingCategories || []}
          suggestedCreators={onboardingSuggestedCreators || []}
          onSubmit={async (data: OnboardingSubmitData) => {
            const { completeOnboarding } = await import('@/app/(reader)/onboarding/actions');
            return completeOnboarding(data);
          }}
        />
      )}
      {!dbUser && (
        <GuestFloatingBar
          onOpenAuth={(opts) =>
            openAuthModal({ mode: opts?.mode, actionContext: opts?.actionContext })
          }
        />
      )}
    </ReaderPageLayout>
  );
}
