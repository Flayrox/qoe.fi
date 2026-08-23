import { createClient } from '@qoe/supabase/server';
import { prisma } from '@qoe/db/client';
import { getRequestDbUser, getCachedPromos } from '@/lib/cached-queries';
import { buildFeedSlices, type FeedSlice } from '@qoe/db/repositories/posts';
import { getSuggestedCreatorsByVector, getSemanticTrendingTopics } from '@qoe/db/feed';
import { goFetch } from '@qoe/api-client/actions/utils/go-client';
import {
  articleFeedInclude,
  buildVectorFeedPage,
  getPostIncludeSelect,
  mapArticleToFeedItem,
  mapPublicationToAuthor,
  mapSliceToFeedItem,
  publicationProfileSelect,
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

// HomeData est la forme normalisée consommée par FeedDashboard — produite soit
// par le bundle Go, soit par le fallback Prisma (dev sans QOE_API_URL).
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

  // Étape 1 : dbUser + onboarding + données partagées (non couvertes par /v1/home/feed).
  const [dbUser, onboardingData] = await Promise.all([
    user ? getRequestDbUser(user.id) : null,
    (await import('@qoe/db/onboarding')).getOnboardingData(),
  ]);

  const needsOnboarding = Boolean(
    dbUser && dbUser.role === 'user' && !dbUser.hasCompletedOnboarding
  );

  // Étape 2 : bundle Go de la home (fallback Prisma si Go indisponible — dev).
  let home: HomeData;
  try {
    const bundle = await goFetch<HomeFeedResult>('/v1/home/feed');
    home = homeDataFromGo(bundle, user?.id);
  } catch {
    home = await buildHomeFromPrisma(user?.id ?? null);
  }

  // Moteur vectoriel Two-Tower pour l'onglet « Pour vous » (déjà Go).
  const vectorFeedPagePromise = buildVectorFeedPage({
    userId: user?.id ?? null,
    limit: 20,
    offset: 0,
  });

  const [vectorFeedPage, suggestedCreators, trends, promos] = await Promise.all([
    vectorFeedPagePromise,
    getSuggestedCreatorsByVector({ userId: user?.id, limit: 4 }),
    getSemanticTrendingTopics({ limit: 5 }),
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

// ── Fallback Prisma (dev sans QOE_API_URL) : reproduit l'ancien comportement ──
async function buildHomeFromPrisma(userId: string | null): Promise<HomeData> {
  const user = userId;
  const [followedPublications] = user
    ? [
        await prisma.follows.findMany({
          where: { readerId: user },
          include: { publication: { select: publicationProfileSelect } },
          orderBy: { createdAt: 'desc' },
        }),
      ]
    : [[]];

  const publicationIds = followedPublications.map((f) => f.publicationId);

  const followedUserIds = await (async () => {
    if (publicationIds.length === 0) return [];
    const pubs = await prisma.publication.findMany({
      where: { id: { in: publicationIds }, type: 'PERSONAL' },
      select: { user: { select: { id: true } } },
    });
    return pubs.map((p) => p.user?.id).filter(Boolean) as string[];
  })();

  const postIncludeSelect = getPostIncludeSelect(user ?? undefined);

  const dbFollowingArticlesPromise =
    publicationIds.length > 0
      ? prisma.article.findMany({
          where: {
            publicationId: { in: publicationIds },
            published: true,
            author: { is: { isShadowbanned: false, isSuspended: false } },
          },
          include: articleFeedInclude,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 20,
        })
      : Promise.resolve([]);

  const dbFollowingPostsPromise =
    followedUserIds.length > 0 && user
      ? prisma.thought.findMany({
          where: {
            isDraft: false,
            deletedAt: null,
            author: { isShadowbanned: false, isSuspended: false },
            OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
            AND: [
              {
                OR: [
                  { authorId: user },
                  {
                    authorId: { in: followedUserIds },
                    visibility: { in: ['public', 'followers'] },
                  },
                ],
              },
            ],
          },
          include: postIncludeSelect,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 20,
        })
      : Promise.resolve([]);

  const dbRecArticlesPromise = prisma.article.findMany({
    where: {
      published: true,
      author: { is: { isShadowbanned: false, isSuspended: false } },
    },
    include: articleFeedInclude,
    orderBy: [{ isEditorPick: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    take: 20,
  });

  const dbRecPostsPromise = prisma.thought.findMany({
    where: {
      isDraft: false,
      deletedAt: null,
      author: { isShadowbanned: false, isSuspended: false },
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
      AND: [
        {
          OR: [
            { visibility: 'public' },
            ...(user ? [{ authorId: user }] : []),
            ...(followedUserIds.length > 0
              ? [{ authorId: { in: followedUserIds }, visibility: 'followers' }]
              : []),
          ],
        },
      ],
    },
    include: postIncludeSelect,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 20,
  });

  const dbDiscoverArticlesPromise = prisma.article.findMany({
    where: {
      published: true,
      publication: {
        is: {
          isCertified: true,
          ...(publicationIds.length > 0 ? { id: { notIn: publicationIds } } : {}),
        },
      },
      author: { is: { isShadowbanned: false, isSuspended: false } },
    },
    include: articleFeedInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 20,
  });

  const dbDiscoverPostsPromise = prisma.thought.findMany({
    where: {
      isDraft: false,
      deletedAt: null,
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
      visibility: 'public',
      author: {
        role: 'creator',
        isCertified: true,
        isShadowbanned: false,
        isSuspended: false,
        ...(user
          ? {
              id:
                followedUserIds.length > 0 ? { notIn: [...followedUserIds, user] } : { not: user },
            }
          : {}),
      },
    },
    include: postIncludeSelect,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 20,
  });

  const bookmarksPromise = user
    ? prisma.bookmark.findMany({
        where: { readerId: user },
        include: { article: { include: articleFeedInclude } },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
    : Promise.resolve([]);

  const highlightsCountPromise = user
    ? prisma.highlight.count({ where: { readerId: user } })
    : Promise.resolve(0);

  const activityDataPromise = user
    ? (async () => {
        const since = new Date(Date.now() - 7 * 86400000);
        const [bms, hls] = await Promise.all([
          prisma.bookmark.findMany({
            where: { readerId: user, createdAt: { gte: since } },
            select: { createdAt: true },
          }),
          prisma.highlight.findMany({
            where: { readerId: user, createdAt: { gte: since } },
            select: { createdAt: true },
          }),
        ]);
        const data = Array(7).fill(0) as number[];
        const now = new Date();
        const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const todayStart = dayStart(now);
        for (const { createdAt } of [...bms, ...hls]) {
          const diff = Math.floor(
            (todayStart.getTime() - dayStart(new Date(createdAt)).getTime()) / 86400000
          );
          if (diff >= 0 && diff < 7) data[6 - diff] += 1;
        }
        return data;
      })()
    : Promise.resolve(undefined as number[] | undefined);

  const mutedWordsPromise = user
    ? prisma.mutedWord.findMany({
        where: { userId: user },
        select: { word: true },
      })
    : Promise.resolve([]);

  const [
    dbFollowingArticles,
    dbFollowingPosts,
    dbRecArticles,
    dbRecPosts,
    dbDiscoverArticles,
    dbDiscoverPosts,
    bookmarks,
    highlightsCount,
    mutedWords,
    activityData,
  ] = await Promise.all([
    dbFollowingArticlesPromise,
    dbFollowingPostsPromise,
    dbRecArticlesPromise,
    dbRecPostsPromise,
    dbDiscoverArticlesPromise,
    dbDiscoverPostsPromise,
    bookmarksPromise,
    highlightsCountPromise,
    mutedWordsPromise,
    activityDataPromise,
  ]);

  const [followingSlices, recSlices, discoverSlices] = await Promise.all([
    buildFeedSlices(dbFollowingPosts, user ?? undefined),
    buildFeedSlices(dbRecPosts, user ?? undefined),
    buildFeedSlices(dbDiscoverPosts, user ?? undefined),
  ]);

  const followingArticles = [
    ...dbFollowingArticles.map(mapArticleToFeedItem),
    ...followingSlices.map((s) => mapSliceToFeedItem(s, user ?? undefined)),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const recommendationArticles = [
    ...dbRecArticles.map(mapArticleToFeedItem),
    ...recSlices.map((s) => mapSliceToFeedItem(s, user ?? undefined)),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const discoverArticles = [
    ...dbDiscoverArticles.map(mapArticleToFeedItem),
    ...discoverSlices.map((s) => mapSliceToFeedItem(s, user ?? undefined)),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const featuredArticle = dbRecArticles[0] ? mapArticleToFeedItem(dbRecArticles[0]) : null;
  const widgetRecArticles = dbRecArticles.slice(0, 5).map(mapArticleToFeedItem);

  return {
    followingArticles,
    recommendationArticles,
    discoverArticles,
    bookmarks: bookmarks.map((b) => mapArticleToFeedItem(b.article)),
    followedCreators: followedPublications.map((f) => mapPublicationToAuthor(f.publication)),
    followedAuthorIds: followedUserIds,
    initialFollowsCount: followedPublications.length,
    initialBookmarksCount: bookmarks.length,
    initialHighlightsCount: highlightsCount,
    mutedWords: mutedWords.map((w) => w.word.toLowerCase()),
    featuredArticle,
    widgetRecArticles,
    activityData,
  };
}
