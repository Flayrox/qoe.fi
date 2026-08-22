import { createClient } from '@qoe/supabase/server';
import { prisma } from '@qoe/db/client';
import { getRequestDbUser, getCachedPromos, getCachedFeaturedArticle } from '@/lib/cached-queries';
import { buildFeedSlices } from '@qoe/db/repositories/posts';
import { getSuggestedCreatorsByVector, getSemanticTrendingTopics } from '@qoe/db/feed';
import {
  articleFeedInclude,
  buildVectorFeedPage,
  getPostIncludeSelect,
  mapArticleToFeedItem,
  mapPublicationToAuthor,
  mapSliceToFeedItem,
  publicationProfileSelect,
  type FeedItem,
} from '@/lib/vector-feed';
import { FeedDashboard } from './FeedDashboard';

export default async function ReaderHomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Étape 1 : Récupérer les détails de dbUser, publications suivies et données d'onboarding en parallèle
  const [dbUser, followedPublications, onboardingData] = await Promise.all([
    user ? getRequestDbUser(user.id) : null,
    user
      ? prisma.follows.findMany({
          where: { readerId: user.id },
          include: {
            publication: {
              select: publicationProfileSelect,
            },
          },
          orderBy: { createdAt: 'desc' },
        })
      : [],
    (await import('@qoe/db/onboarding')).getOnboardingData(),
  ]);

  const needsOnboarding = Boolean(
    dbUser && dbUser.role === 'user' && !dbUser.hasCompletedOnboarding
  );

  const publicationIds = followedPublications.map((f) => f.publicationId);

  // Résout les Users propriétaires des publications PERSONAL suivies (pour les Thoughts)
  const followedUserIds = await (async () => {
    if (publicationIds.length === 0) return [];
    const pubs = await prisma.publication.findMany({
      where: { id: { in: publicationIds }, type: 'PERSONAL' },
      select: { user: { select: { id: true } } },
    });
    return pubs.map((p) => p.user?.id).filter(Boolean) as string[];
  })();

  const postIncludeSelect = getPostIncludeSelect(user?.id);

  // Étape 2 : Définir les promesses de base de données parallèles
  const dbFollowingArticlesPromise =
    publicationIds.length > 0
      ? prisma.article.findMany({
          where: {
            publicationId: { in: publicationIds },
            published: true,
            author: { is: { isShadowbanned: false, isSuspended: false } },
          },
          include: {
            publication: { select: publicationProfileSelect },
            author: {
              select: {
                id: true,
                name: true,
                username: true,
                logoUrl: true,
                isCertified: true,
              },
            },
            coAuthors: {
              select: {
                id: true,
                name: true,
                username: true,
                logoUrl: true,
                isCertified: true,
              },
            },
            attributions: {
              orderBy: { order: 'asc' as const },
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    username: true,
                    logoUrl: true,
                    isCertified: true,
                  },
                },
              },
            },
            category: { select: { name: true } },
          },
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
                  { authorId: user.id },
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
            ...(user ? [{ authorId: user.id }] : []),
            ...(followedUserIds.length > 0
              ? [
                  {
                    authorId: { in: followedUserIds },
                    visibility: 'followers',
                  },
                ]
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
    include: {
      publication: { select: publicationProfileSelect },
      author: {
        select: {
          id: true,
          name: true,
          username: true,
          logoUrl: true,
          isCertified: true,
        },
      },
      coAuthors: {
        select: {
          id: true,
          name: true,
          username: true,
          logoUrl: true,
          isCertified: true,
        },
      },
      attributions: {
        orderBy: { order: 'asc' as const },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              username: true,
              logoUrl: true,
              isCertified: true,
            },
          },
        },
      },
      category: { select: { name: true } },
    },
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
                followedUserIds.length > 0
                  ? { notIn: [...followedUserIds, user.id] }
                  : { not: user.id },
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
        where: { readerId: user.id },
        include: {
          article: {
            include: {
              publication: { select: publicationProfileSelect },
              author: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  logoUrl: true,
                  isCertified: true,
                },
              },
              coAuthors: {
                select: {
                  id: true,
                  name: true,
                  username: true,
                  logoUrl: true,
                  isCertified: true,
                },
              },
              attributions: {
                orderBy: { order: 'asc' as const },
                include: {
                  user: {
                    select: {
                      id: true,
                      name: true,
                      username: true,
                      logoUrl: true,
                      isCertified: true,
                    },
                  },
                },
              },
              category: { select: { name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
    : Promise.resolve([]);

  const highlightsCountPromise = user
    ? prisma.highlight.count({ where: { readerId: user.id } })
    : Promise.resolve(0);

  const activityDataPromise = user
    ? (async () => {
        const since = new Date(Date.now() - 7 * 86400000);
        const [bms, hls] = await Promise.all([
          prisma.bookmark.findMany({
            where: { readerId: user.id, createdAt: { gte: since } },
            select: { createdAt: true },
          }),
          prisma.highlight.findMany({
            where: { readerId: user.id, createdAt: { gte: since } },
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

  // Moteur vectoriel Two-Tower pour l'onglet « Pour vous » (pgvector + circadien + MMR).
  // Première page : connecté → affinité sémantique ; déconnecté → cold-start.
  const vectorFeedPagePromise = buildVectorFeedPage({
    userId: user?.id ?? null,
    limit: 20,
    offset: 0,
  });

  const suggestedCreatorsPromise = getSuggestedCreatorsByVector({
    userId: user?.id,
    limit: 4,
  });

  // Récupérer les mots masqués en parallèle
  const mutedWordsPromise = user
    ? prisma.mutedWord.findMany({
        where: { userId: user.id },
        select: { word: true },
      })
    : Promise.resolve([]);

  // Promesses pour les Widgets (Tendances sémantiques IA + Promos + Article vedette)
  const trendsPromise = getSemanticTrendingTopics({ limit: 5 });
  const promosPromise = getCachedPromos();
  const featuredArticlePromise = getCachedFeaturedArticle();

  // Étape 2 : Exécuter toutes les promesses de base de données en parallèle
  const [
    dbFollowingArticles,
    dbFollowingPosts,
    dbRecArticles,
    dbRecPosts,
    dbDiscoverArticles,
    dbDiscoverPosts,
    bookmarks,
    highlightsCount,
    suggestedCreators,
    vectorFeedPage,
    mutedWords,
    trends,
    promos,
    dbFeaturedArticle,
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
    suggestedCreatorsPromise,
    vectorFeedPagePromise,
    mutedWordsPromise,
    trendsPromise,
    promosPromise,
    featuredArticlePromise,
    activityDataPromise,
  ]);

  const [followingSlices, recSlices, discoverSlices] = await Promise.all([
    buildFeedSlices(dbFollowingPosts, user?.id),
    buildFeedSlices(dbRecPosts, user?.id),
    buildFeedSlices(dbDiscoverPosts, user?.id),
  ]);

  // Combiner et trier les éléments de la timeline
  const followingArticles = [
    ...dbFollowingArticles.map(mapArticleToFeedItem),
    ...followingSlices.map((s) => mapSliceToFeedItem(s, user?.id)),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Flux « Pour vous » : moteur vectoriel Two-Tower (pgvector + circadien + MMR).
  // Connecté → affinité sémantique ; déconnecté → cold-start fraîcheur/engagement.
  // Première page ici, pages suivantes au scroll via /api/feed/personalized.
  let recommendationArticles: FeedItem[] = vectorFeedPage?.items ?? [];
  const feedHasMore = vectorFeedPage?.hasMore ?? false;

  if (recommendationArticles.length === 0) {
    recommendationArticles = [
      ...dbRecArticles.map(mapArticleToFeedItem),
      ...recSlices.map((s) => mapSliceToFeedItem(s, user?.id)),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  const discoverArticles = [
    ...dbDiscoverArticles.map(mapArticleToFeedItem),
    ...discoverSlices.map((s) => mapSliceToFeedItem(s, user?.id)),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const followsCount = followedPublications.length;
  const bookmarksCount = bookmarks.length;
  const mutedWordsList = mutedWords.map((w) => w.word.toLowerCase());

  // Déterminer l'article à la une pour le widget
  const featuredArticle = dbFeaturedArticle || dbRecArticles[0] || null;
  const widgetFeaturedArticle = featuredArticle ? mapArticleToFeedItem(featuredArticle) : null;

  // Déterminer les articles recommandés pour le widget (exclure l'article à la une)
  const widgetRecArticles = dbRecArticles
    .filter((art) => art.id !== featuredArticle?.id)
    .slice(0, 5)
    .map(mapArticleToFeedItem);

  const feedProps = {
    dbUser,
    followingArticles,
    recommendationArticles,
    feedHasMore,
    discoverArticles,
    bookmarks: bookmarks.map((b) => mapArticleToFeedItem(b.article)),
    followedCreators: followedPublications.map((f) => mapPublicationToAuthor(f.publication)),
    suggestedCreators,
    semanticTrends: trends,
    initialFollowsCount: followsCount,
    followedAuthorIds: followedUserIds,
    initialBookmarksCount: bookmarksCount,
    initialHighlightsCount: highlightsCount,
    mutedWords: mutedWordsList,
    featuredArticle: widgetFeaturedArticle,
    recommendedArticles: widgetRecArticles,
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
    activityData,
  };

  return <FeedDashboard {...feedProps} />;
}
