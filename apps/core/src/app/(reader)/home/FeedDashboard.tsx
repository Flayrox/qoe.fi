'use client';

import React, { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ReaderPageLayout } from '@/components/layout/ReaderPageLayout';
import { BookMarked, AlertCircle } from 'lucide-react';
import {
  toggleFollowCreatorHomeAction as toggleFollowCreatorHome,
  toggleBookmarkArticleHomeAction as toggleBookmarkArticleHome,
} from '@qoe/sdk/actions/feed';
import { toast } from '@qoe/ui/toast';

import {
  GuestFloatingBar,
  useAuthModal,
  MediaLightbox,
  HotkeyHelpModal,
  OnboardingModal,
  type AuthActionContext,
  type OnboardingCategory,
  type OnboardingCreator,
  type OnboardingSubmitData,
} from '@qoe/ui';
import { useFeedImpressionTracker } from '@qoe/analytics';
import { ArticleCard } from '@qoe/ui/cards';
import { ThoughtFeedSlice } from './components/ThoughtFeedSlice';
import { VirtualizedFeedList } from '@/components/feed/VirtualizedFeedList';
import { RealtimeFeedPill } from '@/components/feed/RealtimeFeedPill';
import { useRealtimeFeedBuffer } from '@/hooks/useRealtimeFeedBuffer';
import { useOptimisticBookmark, useOptimisticFollow, useDeletePostMutation } from '@qoe/sdk';
import { ComposerModal } from './components/ComposerModal';
import { FeedTabsHeader } from './components/FeedTabsHeader';
import { useThoughtOverlay } from '@/components/thought-overlay/ThoughtOverlayProvider';
import {
  useArticleOverlay,
  type OpenArticleInput,
} from '@/components/article-overlay/ArticleOverlayProvider';
import { type SemanticTrendingTopic, type SuggestedCreator } from './components/FeedSidebarWidgets';
import { t } from '@lingui/core/macro';
import { trackEvent } from '@/lib/analytics';
import { routes } from '@qoe/config/routes';
import { cn } from '@qoe/utils';
import type { CanonicalDocument, SpotlightRange } from '@qoe/ui/annotations';
import type { ThoughtData } from '@qoe/sdk';
import type { FeedSlice } from '@/lib/feed-types';
import type { HiddenAuthor } from '@/lib/home-feed-data';

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
  authorName?: string | null;
  journalist?: {
    id: string;
    name: string | null;
    username: string | null;
    logoUrl: string | null;
    isCertified?: boolean;
    type?: 'PERSONAL' | 'MEDIA' | string | null;
  } | null;
  coAuthors?: Array<{
    id: string;
    name: string | null;
    username: string | null;
    logoUrl: string | null;
    isCertified?: boolean;
    type?: 'PERSONAL' | 'MEDIA' | string | null;
  }>;
  contributors?: Array<{
    id: string;
    name: string | null;
    username: string | null;
    logoUrl: string | null;
    isCertified?: boolean;
    type?: 'PERSONAL' | 'MEDIA' | string | null;
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
  publication?: {
    name?: string | null;
    slug?: string | null;
    subdomain?: string | null;
    logoUrl?: string | null;
    customDomain?: string | null;
  } | null;
  tags?: string[];
  /** Passage cité résolu par le serveur (tranche 6-a) — sert de spotlight
   *  quand la carte de citation ouvre l'article dans le drawer (6-b). */
  quoteContext?: {
    before: string;
    highlight: string;
    after: string;
    start: number;
    end: number;
    sha: string;
  } | null;
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
    type?: 'PERSONAL' | 'MEDIA' | string | null;
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
  initialArticle?: Article | null;
  initialCanonicalDocument?: CanonicalDocument | null;
  initialSpotlight?: SpotlightRange | null;
  /** Route de retour quand l'article initial vient d'un deep-link (ex. profil). */
  initialReturnUrl?: string | null;
  /** Auteurs suivis dont les contenus sont masqués du flux Suivis (fiche 06 §9 :
   * jamais de suppression silencieuse — le bandeau ci-dessous les nomme). */
  followingHidden?: HiddenAuthor[];
}

// 👁️ Wrapper impression module-level : fire-once par item (IntersectionObserver, batché).
// Isolé hors du corps du FeedDashboard pour garantir la stabilité de type et éviter
// que React ne démonte/remonte l'arbre complet des cartes du feed lors des re-renders.
function ImpressionWrapper({
  children,
  itemType,
  itemId,
  position,
  isDiscovery,
}: {
  children: React.ReactNode;
  itemType: 'ARTICLE' | 'THOUGHT';
  itemId: string;
  position: number;
  isDiscovery?: boolean;
}) {
  const ref = useFeedImpressionTracker({ itemType, itemId, position, isDiscovery });
  return <div ref={ref}>{children}</div>;
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
  initialArticle = null,
  initialCanonicalDocument = null,
  initialSpotlight = null,
  followingHidden = [],
}: FeedDashboardProps) {
  const [activeFeed, setActiveFeed] = useState<string>('recommandation');
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(needsOnboarding);
  const router = useRouter();
  const thoughtOverlay = useThoughtOverlay();
  // 🪟 L'article n'appartient plus à cette page : le layout en est le seul
  // propriétaire, cette page ne fait que déclarer une intention d'ouverture.
  const overlay = useArticleOverlay();

  // 🔗 Deep-link vers un article (ex. arrivée depuis un profil) : on ouvre la
  // surcouche au montage en remplaçant l'entrée courante, sans empiler.
  const initialOverlayOpened = React.useRef(false);
  React.useEffect(() => {
    if (initialOverlayOpened.current || !overlay || !initialArticle?.slug) return;
    initialOverlayOpened.current = true;
    overlay.openArticle(initialArticle, {
      replace: true,
      source: 'direct',
      spotlight: initialSpotlight,
      canonicalDocument: initialCanonicalDocument,
    });
  }, [overlay, initialArticle, initialSpotlight, initialCanonicalDocument]);
  const [isComposerModalOpen, setIsComposerModalOpen] = useState(false);
  const [isHotkeyModalOpen, setIsHotkeyModalOpen] = useState(false);
  const [lightboxImages] = useState<{ url: string; alt?: string | null }[]>([]);
  const [lightboxIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const slidingSheetOffset = 275;
  const [isFullyCovered, setIsFullyCovered] = useState(false);
  const [stageWidth, setStageWidth] = useState<number>(1400);

  // Détection du scroll : s'étend uniquement quand Lire est complètement recouvert (scrollY >= slidingSheetOffset)
  React.useEffect(() => {
    const handleScroll = () => {
      setIsFullyCovered(window.scrollY >= slidingSheetOffset);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [slidingSheetOffset]);

  // Mesure de la largeur de scène pour l'animation numérique fluide de maxWidth (672px -> stageWidth)
  React.useEffect(() => {
    const updateStageWidth = () => {
      const clientWidth =
        typeof document !== 'undefined' ? document.documentElement.clientWidth : window.innerWidth;
      const isMd = window.innerWidth >= 768;
      setStageWidth(isMd ? Math.max(clientWidth - 256, 672) : clientWidth);
    };
    updateStageWidth();
    window.addEventListener('resize', updateStageWidth, { passive: true });
    return () => window.removeEventListener('resize', updateStageWidth);
  }, []);

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

  // Résumé des auteurs masqués (un auteur suspendu / restreint, avec
  // échéance quand elle est connue). Chaîne calculée hors JSX pour rester
  // compatible avec le macro d'internationalisation.
  const hiddenSummary = useMemo(
    () =>
      followingHidden
        .map((h) => {
          const kind = h.reason === 'suspended' ? 'un auteur suspendu' : 'un auteur restreint';
          return h.until ? `${kind} (jusqu'au ${new Date(h.until).toLocaleDateString()})` : kind;
        })
        .join(' · '),
    [followingHidden]
  );

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
  // Retire la carte localement ET persiste via /api/feed/show-less : exclusion
  // SQL (ContentFeedback) + éloignement vectoriel (EMA négatif) côté Go.
  const handleHideArticle = async (article: { id: string }) => {
    setLocalPosts((prev) => prev.filter((p) => p.id !== article.id));
    setFeedItems((prev) => prev.filter((p) => p.id !== article.id));
    trackEvent('feed_show_less', { articleId: article.id });
    try {
      const res = await fetch('/api/feed/show-less', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId: article.id }),
      });
      if (res.ok) {
        toast.success(t`Tu verras moins de contenu comme ça.`);
      } else {
        toast.error(t`Erreur lors de la sauvegarde de ta préférence.`);
      }
    } catch {
      toast.error(t`Erreur réseau.`);
    }
  };

  const handleHidePost = (postId: string) => {
    setLocalPosts((prev) => prev.filter((p) => p.id !== postId));
    setFeedItems((prev) => prev.filter((p) => p.id !== postId));
  };

  // 🧵 Et pour les pensées, même contrat que l'article : le feed déclare
  // l'intention, la surcouche du layout possède l'historique, le fil, la
  // position et le focus.
  const handleOpenPost = (postId: string, authorUsername?: string) => {
    if (!postId) return;
    const foundItem = currentFeedArticles.find((item) => item.id === postId);
    const handle =
      authorUsername ||
      foundItem?.author?.username ||
      foundItem?.author?.subdomain ||
      foundItem?.author?.id ||
      'auteur';
    thoughtOverlay?.openThought(postId, handle);
  };

  // 🪟 Le feed ne possède plus le drawer : il déclare l'intention, la
  // surcouche du layout gère historique, fetch, position et focus.
  const handleOpenArticle = (articleInput: Partial<Article> | string) => {
    const slug = typeof articleInput === 'string' ? articleInput : articleInput?.slug;
    if (!slug) return;
    const inputObj: OpenArticleInput =
      typeof articleInput === 'string' ? { slug } : { ...(articleInput as OpenArticleInput) };
    if (typeof articleInput !== 'string') {
      if (articleInput?.id) {
        inputObj.isBookmarked = isArticleBookmarked(articleInput.id);
      }
      const authorId = articleInput.author?.id;
      if (authorId) {
        inputObj.isFollowed = isCreatorFollowed(authorId);
      }
    }
    overlay?.openArticle(inputObj, { source: 'feed' });
  };

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
      // La surcouche restaure elle-même l'entrée précédente ; ici on ne
      // s'occupe que du panneau de pensée, qui n'a pas de contrat d'historique.
      overlay?.closeArticle();
      thoughtOverlay?.closeThought();
      if (window.location.pathname.includes('/thought/')) {
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
    '#technologie',
    '#anti-ia',
    '#attention',
    '#philosophie',
    '#design',
    '#creators',
  ];

  return (
    <ReaderPageLayout giantTitle={t`Lire`}>
      {/* ── SLIDING FEED SHEET ── */}
      <motion.section
        initial={false}
        animate={{
          marginTop: slidingSheetOffset,
          maxWidth: isFullyCovered ? stageWidth : 672,
          borderTopLeftRadius: isFullyCovered ? 0 : 16,
          borderTopRightRadius: isFullyCovered ? 0 : 16,
        }}
        transition={{
          marginTop: { type: 'spring', stiffness: 350, damping: 32 },
          maxWidth: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
          borderTopLeftRadius: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
          borderTopRightRadius: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
        }}
        className={cn(
          'w-full mx-auto bg-card text-card-foreground shadow-sm relative z-10 border-t border-x transition-colors duration-300',
          isFullyCovered ? 'border-transparent' : 'border-border/40'
        )}
      >
        {/* 100% Solid Opaque Sticky Header of the Sheet (No Background Bleed-Through) */}
        <motion.div
          animate={{
            borderTopLeftRadius: isFullyCovered ? 0 : 16,
            borderTopRightRadius: isFullyCovered ? 0 : 16,
          }}
          transition={{
            borderTopLeftRadius: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
            borderTopRightRadius: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
          }}
          className="sticky top-0 z-20 bg-card border-b border-border/40 px-4 sm:px-6 py-3"
        >
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <FeedTabsHeader
              activeFeed={activeFeed}
              onTabChange={(id) => {
                if (activeFeed === id) {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                } else {
                  setActiveFeed(id);
                  setSelectedTag(null);
                  thoughtOverlay?.closeThought();
                  overlay?.closeArticle();
                  trackEvent('feed_tab_changed', { tab: id });
                }
              }}
            />
          </div>
        </motion.div>

        {/* Main Feed Container */}
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-6 min-w-0">
          <AnimatePresence mode="popLayout">
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
                        {t`Votre bibliothèque est vide`}
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
                      {/* Transparence du suivi (fiche 06 §9) : les auteurs
                       * suivis masqués par une mesure sont nommés ici —
                       * jamais de suivi vide et muet. */}
                      {activeFeed === 'abonnement' && followingHidden.length > 0 && (
                        <div className="bg-muted/40 border border-border/40 rounded-xl px-4 py-3 flex items-start gap-2.5 text-muted-foreground">
                          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                          <p className="text-xs leading-relaxed">
                            {t`Certains contenus de vos abonnements sont temporairement masqués (mesure de modération) : ${hiddenSummary}.`}{' '}
                            <a
                              href="/support"
                              className="underline underline-offset-2 font-semibold"
                            >
                              {t`Besoin d'aide ?`}
                            </a>
                          </p>
                        </div>
                      )}
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
                            article.author?.id || (article as FeedSliceItem).targetPost?.author?.id;
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
                                  isIncompleteThread: (article as FeedSliceItem).isIncompleteThread,
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
                                  slice={sliceData as never as FeedSlice}
                                  currentUserId={dbUser?.id || null}
                                  onOpenPost={handleOpenPost}
                                  onOpenArticle={handleOpenArticle}
                                  onOpenProfile={(username) => {
                                    router.push(routes.feed.profile(username));
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
                                  article as never as React.ComponentProps<
                                    typeof ArticleCard
                                  >['article']
                                }
                                idx={idx}
                                dbUser={dbUser}
                                isBookmarked={isBookmarked}
                                isFollowed={isFollowed}
                                isFollowedAuthor={isFollowedAuthor}
                                handleFollowToggle={handleFollowToggle}
                                handleBookmarkToggle={(art) => {
                                  void handleBookmarkToggle(art as never as Article);
                                }}
                                featured={idx === 0 && activeFeed === 'recommandation'}
                                discovery={
                                  (article as { isDiscovery?: boolean }).isDiscovery === true
                                }
                                onHideArticle={
                                  dbUser
                                    ? (art) => {
                                        void handleHideArticle(art);
                                      }
                                    : undefined
                                }
                                onOpenArticle={(art) => {
                                  void handleOpenArticle(art as never as Partial<Article>);
                                }}
                                onOpenPost={handleOpenPost}
                                onOpenProfile={(username) => {
                                  router.push(routes.feed.profile(username));
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
          </AnimatePresence>
        </div>
      </motion.section>

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
            const res = await completeOnboarding(data);
            setIsOnboardingModalOpen(false);
            return res;
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
