import { createClient } from "@qoe/supabase/server"
import { redirect } from "next/navigation"
import { prisma } from "@qoe/db/client"
import type { Prisma, FeedArticleDTO, FeedPostDTO } from "@qoe/db/types"
import { unstable_cache } from "next/cache"
import { getRequestDbUser } from "@/lib/cached-queries"
import { FeedDashboard } from "./FeedDashboard"

type PostWithDetails = Prisma.PostGetPayload<{
  include: {
    author: { select: { id: true; name: true; username: true; subdomain: true; customDomain: true; logoUrl: true; heroText: true; isCertified: true } };
    parent: { select: { id: true; author: { select: { id: true; name: true; username: true; subdomain: true } } } };
    repost: {
      include: {
        author: { select: { id: true; name: true; username: true; subdomain: true; customDomain: true; logoUrl: true; heroText: true; isCertified: true } }
      }
    };
    likes: { select: { userId: true } };
    _count: { select: { likes: true; replies: true } };
  };
}>

type ArticleWithDetails = Prisma.ArticleGetPayload<{
  include: {
    author: { select: { id: true; name: true; username: true; subdomain: true; customDomain: true; logoUrl: true; heroText: true; isCertified: true } };
    category: { select: { name: true } };
  };
}>

const postIncludeSelect = {
  author: { select: { id: true, name: true, username: true, subdomain: true, customDomain: true, logoUrl: true, heroText: true, isCertified: true } },
  parent: { select: { id: true, author: { select: { id: true, name: true, username: true, subdomain: true } } } },
  repost: {
    include: {
      author: { select: { id: true, name: true, username: true, subdomain: true, customDomain: true, logoUrl: true, heroText: true, isCertified: true } }
    }
  },
  likes: { select: { userId: true } },
  _count: { select: { likes: true, replies: true } }
}

export default async function ReaderHomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Étape 1 : Récupérer les détails de dbUser et les créateurs suivis en parallèle (si connecté)
  const [dbUser, followedCreators] = user
    ? await Promise.all([
        getRequestDbUser(user.id),
        prisma.follows.findMany({
          where: { readerId: user.id },
          include: {
            creator: { select: { id: true, name: true, username: true, subdomain: true, customDomain: true, logoUrl: true, heroText: true, isCertified: true } }
          },
          orderBy: { createdAt: 'desc' }
        })
      ])
    : [null, []]

  const creatorIds = followedCreators.map(f => f.creatorId)

  // Fonctions utilitaires de remappage typées strictement
  const mapPostToFeedItem = (post: PostWithDetails) => ({
    id: post.id,
    title: "", // Un titre vide identifie un micro-post (tweet) dans FeedDashboard
    slug: `post-${post.id}`,
    content: post.content,
    imageUrl: post.imageUrl || null,
    published: true,
    isPremium: false,
    readingTime: 1,
    createdAt: post.createdAt.toISOString(),
    author: {
      ...post.author,
      isCertified: post.author.isCertified || false
    },
    parent: post.parent || null,
    repost: post.repost ? {
      ...post.repost,
      author: {
        ...post.repost.author,
        isCertified: post.repost.author.isCertified || false
      }
    } : null,
    category: { name: "Micro-post" },
    tags: post.tags || [],
    likesCount: post._count?.likes || 0,
    repliesCount: post._count?.replies || 0,
    liked: post.likes?.some((l) => l.userId === user?.id) || false
  })

  const mapArticleToFeedItem = (art: ArticleWithDetails) => ({
    ...art,
    createdAt: art.createdAt.toISOString(),
    author: {
      ...art.author,
      isCertified: art.author.isCertified || false
    },
    tags: art.semanticTags || []
  })


  // Étape 2 : Définir les promesses de base de données parallèles
  const dbFollowingArticlesPromise = creatorIds.length > 0
    ? prisma.article.findMany({
        where: { 
          authorId: { in: creatorIds },
          published: true 
        },
        include: {
          author: { select: { id: true, name: true, username: true, subdomain: true, customDomain: true, logoUrl: true, heroText: true, isCertified: true } },
          category: { select: { name: true } }
        },
        orderBy: { createdAt: 'desc' },
        take: 20
      })
    : Promise.resolve([])

  const dbFollowingPostsPromise = creatorIds.length > 0 && user
    ? prisma.post.findMany({
        where: {
          isDraft: false,
          OR: [
            { scheduledAt: null },
            { scheduledAt: { lte: new Date() } }
          ],
          AND: [
            {
              OR: [
                { authorId: user.id },
                {
                  authorId: { in: creatorIds },
                  visibility: { in: ["public", "followers"] }
                }
              ]
            }
          ]
        },
        include: postIncludeSelect,
        orderBy: { createdAt: 'desc' },
        take: 20
      })
    : Promise.resolve([])

  const dbRecArticlesPromise = prisma.article.findMany({
    where: { 
      published: true 
    },
    include: {
      author: { select: { id: true, name: true, username: true, subdomain: true, customDomain: true, logoUrl: true, heroText: true, isCertified: true } },
      category: { select: { name: true } }
    },
    orderBy: [
      { isEditorPick: 'desc' },
      { createdAt: 'desc' }
    ],
    take: 20
  })

  const dbRecPostsPromise = prisma.post.findMany({
    where: {
      isDraft: false,
      OR: [
        { scheduledAt: null },
        { scheduledAt: { lte: new Date() } }
      ],
      AND: [
        {
          OR: [
            { visibility: "public" },
            ...(user ? [{ authorId: user.id }] : []),
            ...(creatorIds.length > 0 ? [{
              authorId: { in: creatorIds },
              visibility: "followers"
            }] : [])
          ]
        }
      ]
    },
    include: postIncludeSelect,
    orderBy: { createdAt: 'desc' },
    take: 20
  })

  const dbDiscoverArticlesPromise = prisma.article.findMany({
    where: {
      published: true,
      author: {
        role: 'creator',
        isCertified: true,
        id: creatorIds.length > 0 ? { notIn: creatorIds } : undefined
      }
    },
    include: {
      author: { select: { id: true, name: true, username: true, subdomain: true, customDomain: true, logoUrl: true, heroText: true, isCertified: true } },
      category: { select: { name: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: 20
  })

  const dbDiscoverPostsPromise = prisma.post.findMany({
    where: {
      isDraft: false,
      OR: [
        { scheduledAt: null },
        { scheduledAt: { lte: new Date() } }
      ],
      visibility: "public",
      author: {
        role: 'creator',
        isCertified: true,
        ...(user ? {
          id: creatorIds.length > 0 ? { notIn: [...creatorIds, user.id] } : { not: user.id }
        } : {})
      }
    },
    include: postIncludeSelect,
    orderBy: { createdAt: 'desc' },
    take: 20
  })

  const bookmarksPromise = user
    ? prisma.bookmark.findMany({
        where: { readerId: user.id },
        include: {
          article: {
            include: {
              author: { select: { id: true, name: true, username: true, subdomain: true, customDomain: true, logoUrl: true, heroText: true, isCertified: true } },
              category: { select: { name: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      })
    : Promise.resolve([])

  const highlightsCountPromise = user
    ? prisma.highlight.count({ where: { readerId: user.id } })
    : Promise.resolve(0)

  const suggestedCreatorsPromise = prisma.user.findMany({
    where: {
      role: 'creator',
      isCertified: true,
      ...(user ? {
        id: creatorIds.length > 0 ? { notIn: [...creatorIds, user.id] } : { not: user.id }
      } : {})
    },
    select: { id: true, name: true, username: true, subdomain: true, customDomain: true, logoUrl: true, heroText: true, isCertified: true },
    take: 3
  })

  // Récupérer les mots masqués en parallèle
  const mutedWordsPromise = user
    ? prisma.mutedWord.findMany({
        where: { userId: user.id },
        select: { word: true }
      })
    : Promise.resolve([])

  // Promesses pour les Widgets (mises en cache pour éviter la surcharge DB)
  const trendsPromise = unstable_cache(
    async () => prisma.trend.findMany({
      orderBy: { count: 'desc' },
      take: 5
    }),
    ["home-widget-trends"],
    { revalidate: 120 }
  )()

  const promosPromise = unstable_cache(
    async () => prisma.partnerPromo.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      take: 3
    }),
    ["home-widget-promos"],
    { revalidate: 300 }
  )()

  const featuredArticlePromise = unstable_cache(
    async () => prisma.article.findFirst({
      where: { published: true, isEditorPick: true },
      include: {
        author: { select: { id: true, name: true, username: true, subdomain: true, customDomain: true, logoUrl: true, heroText: true, isCertified: true } },
        category: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' }
    }),
    ["home-widget-featured-article"],
    { revalidate: 120 }
  )()


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
    mutedWords,
    trends,
    promos,
    dbFeaturedArticle
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
    mutedWordsPromise,
    trendsPromise,
    promosPromise,
    featuredArticlePromise
  ])

  // Combiner et trier les éléments de la timeline
  const followingArticles = [
    ...dbFollowingArticles.map(mapArticleToFeedItem),
    ...dbFollowingPosts.map(mapPostToFeedItem)
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const recommendationArticles = [
    ...dbRecArticles.map(mapArticleToFeedItem),
    ...dbRecPosts.map(mapPostToFeedItem)
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const discoverArticles = [
    ...dbDiscoverArticles.map(mapArticleToFeedItem),
    ...dbDiscoverPosts.map(mapPostToFeedItem)
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const followsCount = followedCreators.length
  const bookmarksCount = bookmarks.length
  const mutedWordsList = mutedWords.map(w => w.word.toLowerCase())

  // Déterminer l'article à la une pour le widget
  const featuredArticle = dbFeaturedArticle || dbRecArticles[0] || null
  const widgetFeaturedArticle = featuredArticle ? mapArticleToFeedItem(featuredArticle) : null

  // Déterminer les articles recommandés pour le widget (exclure l'article à la une)
  const widgetRecArticles = dbRecArticles
    .filter(art => art.id !== featuredArticle?.id)
    .slice(0, 5)
    .map(mapArticleToFeedItem)

  const feedProps = {
    dbUser,
    followingArticles,
    recommendationArticles,
    discoverArticles,
    bookmarks: bookmarks.map(b => mapArticleToFeedItem(b.article)),
    followedCreators: followedCreators.map(f => f.creator),
    suggestedCreators,
    initialFollowsCount: followsCount,
    initialBookmarksCount: bookmarksCount,
    initialHighlightsCount: highlightsCount,
    mutedWords: mutedWordsList,
    // Widget props
    featuredArticle: widgetFeaturedArticle,
    recommendedArticles: widgetRecArticles,
    trends: trends.map(t => ({ id: t.id, hashtag: t.hashtag, count: t.count })),
    promos: promos.map(p => ({
      id: p.id,
      title: p.title,
      description: p.description,
      ctaText: p.ctaText,
      ctaUrl: p.ctaUrl,
      imageUrl: p.imageUrl,
      isActive: p.isActive
    }))
  }

  return (
    <FeedDashboard {...feedProps} />
  )
}
