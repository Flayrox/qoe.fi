import { createClient } from '@qoe/supabase/server';
import type { FeedSlice } from '@/lib/feed-types';
import { getRequestDbUser, getCachedPromos } from '@/lib/cached-queries';
import { goFetch } from '@qoe/api-client/actions/utils/go-client';
import {
  buildVectorFeedPage,
  mapArticleToFeedItem,
  mapPublicationToAuthor,
  mapSliceToFeedItem,
  type ArticleWithDetails,
  type FeedItem,
  type HydrateArticle,
  type HydratePublication,
} from '@/lib/vector-feed';
import { FeedDashboard } from './FeedDashboard';

// ── Bundle Go de la home (GET /v1/home/feed) ─────────────────────────────────
interface HomeFeedGroup {
  articles: HydrateArticle[];
  thoughts: FeedSlice[];
}
// Widgets Go de la home (GET /v1/home/*) — remplace getOnboardingData,
// getSuggestedCreatorsByVector et getSemanticTrendingTopics (packages/db).
interface OnboardingCreatorDTO {
  id: string;
  name: string | null;
  slug?: string | null;
  subdomain?: string | null;
  logoUrl: string | null;
  heroText: string | null;
  isCertified: boolean;
}
interface OnboardingDataDTO {
  categories: {
    id: string;
    name: string;
    slug: string;
    icon: string;
    subtopics: { id: string; name: string; slug: string; tags?: string[] }[];
  }[];
  suggestedCreators: OnboardingCreatorDTO[];
}
interface SuggestedCreatorDTO {
  id: string;
  name: string;
  username: string;
  subdomain?: string | null;
  customDomain?: string | null;
  logoUrl: string | null;
  heroText?: string | null;
  isCertified: boolean;
  affinityScore: number;
  recentArticleTitle?: string | null;
  subscribersCount: number;
}
interface SemanticTrendingTopicDTO {
  id: string;
  topicName: string;
  description: string;
  count: number;
  growthRate: string;
}

interface HomeFeedResult {
  followedCreators: HydratePublication[];
  followedUserIds: string[];
  following: HomeFeedGroup;
  discover: HomeFeedGroup;
  recommended: HomeFeedGroup;
  bookmarks: HydrateArticle[];
  highlightsCount: number;
  activityData: number[];
  mutedWords: string[];
  featuredArticle: HydrateArticle | null;
}

// HomeData est la forme normalisée consommée par FeedDashboard (bundle Go).
type ArticleFeedItem = ReturnType<typeof mapArticleToFeedItem>;

interface HomeData {
  followingArticles: FeedItem[];
  recommendationArticles: FeedItem[];
  discoverArticles: FeedItem[];
  bookmarks: ArticleFeedItem[];
  followedCreators: ReturnType<typeof mapPublicationToAuthor>[];
  followedAuthorIds: string[];
  initialFollowsCount: number;
  initialBookmarksCount: number;
  initialHighlightsCount: number;
  mutedWords: string[];
  featuredArticle: ArticleFeedItem | null;
  widgetRecArticles: ArticleFeedItem[];
  activityData?: number[];
}

const mapHydrated = (a: HydrateArticle): ArticleFeedItem =>
  mapArticleToFeedItem(a as unknown as ArticleWithDetails);

const mergeTimeline = (articles: FeedItem[], thoughts: FeedSlice[], userId?: string): FeedItem[] =>
  [...articles, ...thoughts.map((s) => mapSliceToFeedItem(s, userId))].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

function homeDataFromGo(h: HomeFeedResult, userId?: string): HomeData {
  return {
    followingArticles: mergeTimeline(
      h.following.articles.map(mapHydrated),
      h.following.thoughts,
      userId
    ),
    recommendationArticles: mergeTimeline(
      h.recommended.articles.map(mapHydrated),
      h.recommended.thoughts,
      userId
    ),
    discoverArticles: mergeTimeline(
      h.discover.articles.map(mapHydrated),
      h.discover.thoughts,
      userId
    ),
    bookmarks: h.bookmarks.map(mapHydrated),
    followedCreators: h.followedCreators.map((p) => mapPublicationToAuthor(p)),
    followedAuthorIds: h.followedUserIds,
    initialFollowsCount: h.followedCreators.length,
    initialBookmarksCount: h.bookmarks.length,
    initialHighlightsCount: h.highlightsCount,
    mutedWords: h.mutedWords.map((w) => w.toLowerCase()),
    featuredArticle: h.featuredArticle ? mapHydrated(h.featuredArticle) : null,
    widgetRecArticles: h.recommended.articles.slice(0, 5).map(mapHydrated),
    activityData: h.activityData,
  };
}

export default async function ReaderHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Étape 1 : dbUser + onboarding + données partagées (Go — /v1/me + /v1/home/onboarding).
  const [dbUser, onboardingData] = await Promise.all([
    user ? getRequestDbUser(user.id) : null,
    fetchOnboardingData(),
  ]);

  const needsOnboarding = Boolean(
    dbUser && dbUser.role === 'user' && !dbUser.hasCompletedOnboarding
  );

  // Étape 2 : bundle Go de la home (backend-of-record, requis en Phase 3).
  const bundle = await goFetch<HomeFeedResult>('/v1/home/feed');
  const home = homeDataFromGo(bundle, user?.id);

  // Moteur vectoriel Two-Tower pour l'onglet « Pour vous » (Go).
  const vectorFeedPagePromise = buildVectorFeedPage({
    userId: user?.id ?? null,
    limit: 20,
    offset: 0,
  });

  const [vectorFeedPage, suggestedCreators, trends, promos] = await Promise.all([
    vectorFeedPagePromise,
    fetchSuggestedCreators(),
    fetchSemanticTrends(),
    getCachedPromos(),
  ]);

  // Flux « Pour vous » : moteur vectoriel (première page ici, scroll via /api/feed/personalized).
  let recommendationArticles: FeedItem[] = vectorFeedPage?.items ?? [];
  const feedHasMore = vectorFeedPage?.hasMore ?? false;
  if (recommendationArticles.length === 0) {
    recommendationArticles = home.recommendationArticles;
  }

  const feedProps = {
    dbUser,
    followingArticles: home.followingArticles,
    recommendationArticles,
    feedHasMore,
    discoverArticles: home.discoverArticles,
    bookmarks: home.bookmarks,
    followedCreators: home.followedCreators,
    suggestedCreators,
    semanticTrends: trends,
    initialFollowsCount: home.initialFollowsCount,
    followedAuthorIds: home.followedAuthorIds,
    initialBookmarksCount: home.initialBookmarksCount,
    initialHighlightsCount: home.initialHighlightsCount,
    mutedWords: home.mutedWords,
    featuredArticle: home.featuredArticle,
    recommendedArticles: home.widgetRecArticles,
    trends: trends.map((t) => ({ id: t.id, hashtag: t.topicName, count: t.count })),
    promos: promos.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      ctaText: p.ctaText,
      ctaUrl: p.ctaUrl,
      imageUrl: p.imageUrl,
      isActive: p.isActive,
    })),
    needsOnboarding,
    onboardingCategories: onboardingData.categories,
    onboardingSuggestedCreators: onboardingData.suggestedCreators,
    activityData: home.activityData,
  };

  return <FeedDashboard {...feedProps} />;
}

// ── Widgets : Go (backend-of-record, requis en Phase 3) ───────────────────────
async function fetchOnboardingData(): Promise<OnboardingDataDTO> {
  return goFetch<OnboardingDataDTO>('/v1/home/onboarding');
}

async function fetchSuggestedCreators(): Promise<SuggestedCreatorDTO[]> {
  return goFetch<SuggestedCreatorDTO[]>('/v1/home/suggested-creators?limit=4');
}

async function fetchSemanticTrends(): Promise<SemanticTrendingTopicDTO[]> {
  return goFetch<SemanticTrendingTopicDTO[]>('/v1/home/semantic-trends?limit=5');
}
