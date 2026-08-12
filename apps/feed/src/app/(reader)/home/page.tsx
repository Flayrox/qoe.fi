import { createClient } from "@qoe/supabase/server"
import { redirect } from "next/navigation"
import { prisma } from "@qoe/db/client"
import type { Prisma, FeedArticleDTO, FeedPostDTO } from "@qoe/db/types"
import { unstable_cache } from "next/cache"
import { 
  getRequestDbUser, 
  getCachedTrends, 
  getCachedPromos, 
  getCachedFeaturedArticle 
} from "@/lib/cached-queries"
import { buildFeedSlices, formatPollData } from "@qoe/db/repositories/posts"
import { FeedDashboard } from "./FeedDashboard"

type PostWithDetails = Prisma.ThoughtGetPayload<{
  include: {
    author: { select: { id: true; name: true; username: true; subdomain: true; customDomain: true; logoUrl: true; heroText: true; isCertified: true } };
    parent: {
      select: {
        id: true;
        content: true;
        createdAt: true;
        author: { select: { id: true; name: true; username: true; subdomain: true; logoUrl: true; isCertified: true } };
      };
    };
    repost: {
      include: {
        author: { select: { id: true; name: true; username: true; subdomain: true; customDomain: true; logoUrl: true; heroText: true; isCertified: true } };
      };
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

const getPostIncludeSelect = (userId?: string) => ({
  author: { select: { id: true, name: true, username: true, subdomain: true, customDomain: true, logoUrl: true, heroText: true, isCertified: true } },
  parent: {
    select: {
      id: true,
      content: true,
      createdAt: true,
      author: { select: { id: true, name: true, username: true, subdomain: true, logoUrl: true, isCertified: true } }
    }
  },
  repost: {
    include: {
      author: { select: { id: true, name: true, username: true, subdomain: true, customDomain: true, logoUrl: true, heroText: true, isCertified: true } },
      likes: userId ? { where: { userId }, select: { userId: true } } : false,
      reposts: userId ? { where: { authorId: userId, deletedAt: null }, select: { id: true, authorId: true, content: true } } : false,
      _count: { select: { likes: true, replies: true, reposts: true } }
    }
  },
  likes: userId ? { where: { userId }, select: { userId: true } } : false,
  reposts: userId ? { where: { authorId: userId, deletedAt: null }, select: { id: true, authorId: true, content: true } } : false,
  poll: {
    include: {
      options: {
        orderBy: { order: "asc" as const },
        include: { _count: { select: { votes: true } } },
      },
      votes: { select: { optionId: true, userId: true } },
    },
  },
  _count: { select: { likes: true, replies: true, reposts: true } }
})

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

  const creatorIds = followedCreators.map((f: any) => f.creatorId)
  const postIncludeSelect = getPostIncludeSelect(user?.id)

  // Fonctions utilitaires de remappage typées strictement
  const mapPostToFeedItem = (post: any) => {
    const canonicalPost = post.repost || post
    const likesCount = canonicalPost._count?.likes ?? post._count?.likes ?? 0
    const repliesCount = canonicalPost._count?.replies ?? post._count?.replies ?? 0
    const repostsCount = canonicalPost._count?.reposts ?? post._count?.reposts ?? 0

    const liked = (canonicalPost.likes && Array.isArray(canonicalPost.likes) && canonicalPost.likes.length > 0) ||
                  (post.likes && Array.isArray(post.likes) && post.likes.length > 0) || false

    const reposted = (canonicalPost.reposts && Array.isArray(canonicalPost.reposts) && canonicalPost.reposts.some((r: any) => !r.content || !r.content.trim())) ||
                     (post.reposts && Array.isArray(post.reposts) && post.reposts.some((r: any) => !r.content || !r.content.trim())) || false

    return {
      id: post.id,
      title: "", // Un titre vide identifie un micro-post dans FeedDashboard
      slug: `post-${post.id}`,
      content: post.content,
      imageUrl: post.imageUrl || null,
      published: true,
      isPremium: false,
      readingTime: 1,
      createdAt: post.createdAt.toISOString(),
      author: {
        ...post.author,
        isCertified: post.author?.isCertified || false
      },
      parent: post.parent ? {
        ...post.parent,
        createdAt: post.parent.createdAt ? post.parent.createdAt.toISOString() : undefined,
        author: {
          ...post.parent.author,
          isCertified: post.parent.author?.isCertified || false
        }
      } : null,
      repost: post.repost ? {
        ...post.repost,
        createdAt: post.repost.createdAt ? post.repost.createdAt.toISOString() : post.createdAt.toISOString(),
        author: {
          ...post.repost.author,
          isCertified: post.repost.author?.isCertified || false
        }
      } : null,
      category: { name: "Micro-post" },
      tags: post.tags || [],
      likesCount,
      repliesCount,
      repostsCount,
      liked,
      reposted,
      poll: canonicalPost.poll ? formatPollData(canonicalPost.poll, user?.id) : post.poll ? formatPollData(post.poll, user?.id) : null
    }
  }

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
          published: true,
          author: { isShadowbanned: false, isSuspended: false }
        },
        include: {
          author: { select: { id: true, name: true, username: true, subdomain: true, customDomain: true, logoUrl: true, heroText: true, isCertified: true } },
          category: { select: { name: true } }
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20
      })
    : Promise.resolve([])

  const dbFollowingPostsPromise = creatorIds.length > 0 && user
    ? prisma.thought.findMany({
        where: {
          isDraft: false,
          deletedAt: null,
          author: { isShadowbanned: false, isSuspended: false },
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
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 20
      })
    : Promise.resolve([])

  const dbRecArticlesPromise = prisma.article.findMany({
    where: { 
      published: true,
      author: { isShadowbanned: false, isSuspended: false }
    },
    include: {
      author: { select: { id: true, name: true, username: true, subdomain: true, customDomain: true, logoUrl: true, heroText: true, isCertified: true } },
      category: { select: { name: true } }
    },
    orderBy: [
      { isEditorPick: 'desc' },
      { createdAt: 'desc' },
      { id: 'desc' }
    ],
    take: 20
  })

  const dbRecPostsPromise = prisma.thought.findMany({
    where: {
      isDraft: false,
      deletedAt: null,
      author: { isShadowbanned: false, isSuspended: false },
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
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 20
  })

  const dbDiscoverArticlesPromise = prisma.article.findMany({
    where: {
      published: true,
      author: {
        role: 'creator',
        isCertified: true,
        isShadowbanned: false,
        isSuspended: false,
        id: creatorIds.length > 0 ? { notIn: creatorIds } : undefined
      }
    },
    include: {
      author: { select: { id: true, name: true, username: true, subdomain: true, customDomain: true, logoUrl: true, heroText: true, isCertified: true } },
      category: { select: { name: true } }
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 20
  })

  const dbDiscoverPostsPromise = prisma.thought.findMany({
    where: {
      isDraft: false,
      deletedAt: null,
      OR: [
        { scheduledAt: null },
        { scheduledAt: { lte: new Date() } }
      ],
      visibility: "public",
      author: {
        role: 'creator',
        isCertified: true,
        isShadowbanned: false,
        isSuspended: false,
        ...(user ? {
          id: creatorIds.length > 0 ? { notIn: [...creatorIds, user.id] } : { not: user.id }
        } : {})
      }
    },
    include: postIncludeSelect,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
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
        orderBy: { createdAt: 'desc' },
        take: 20
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

  // Promesses pour les Widgets (mises en cache au niveau du module)
  const trendsPromise = getCachedTrends()
  const promosPromise = getCachedPromos()
  const featuredArticlePromise = getCachedFeaturedArticle()

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

  const [followingSlices, recSlices, discoverSlices] = await Promise.all([
    buildFeedSlices(dbFollowingPosts, user?.id),
    buildFeedSlices(dbRecPosts, user?.id),
    buildFeedSlices(dbDiscoverPosts, user?.id),
  ])

  const mapSliceToFeedItem = (slice: any) => {
    const target = slice.targetPost
    return {
      id: slice.id,
      title: "",
      slug: `post-${slice.id}`,
      createdAt: target.createdAt instanceof Date ? target.createdAt.toISOString() : target.createdAt,
      targetPost: mapPostToFeedItem(target),
      parentPost: slice.parentPost ? mapPostToFeedItem(slice.parentPost) : null,
      rootPost: slice.rootPost ? mapPostToFeedItem(slice.rootPost) : null,
      isIncompleteThread: slice.isIncompleteThread,
      hiddenIntermediateCount: slice.hiddenIntermediateCount,
    }
  }

  // Combiner et trier les éléments de la timeline
  const followingArticles = [
    ...dbFollowingArticles.map(mapArticleToFeedItem),
    ...followingSlices.map(mapSliceToFeedItem)
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const recommendationArticles = [
    ...dbRecArticles.map(mapArticleToFeedItem),
    ...recSlices.map(mapSliceToFeedItem)
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const discoverArticles = [
    ...dbDiscoverArticles.map(mapArticleToFeedItem),
    ...discoverSlices.map(mapSliceToFeedItem)
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const followsCount = followedCreators.length
  const bookmarksCount = bookmarks.length
  const mutedWordsList = mutedWords.map((w: any) => w.word.toLowerCase())

  // Déterminer l'article à la une pour le widget
  const featuredArticle = dbFeaturedArticle || dbRecArticles[0] || null
  const widgetFeaturedArticle = featuredArticle ? mapArticleToFeedItem(featuredArticle) : null

  // Déterminer les articles recommandés pour le widget (exclure l'article à la une)
  const widgetRecArticles = dbRecArticles
    .filter((art: any) => art.id !== featuredArticle?.id)
    .slice(0, 5)
    .map(mapArticleToFeedItem)

  const feedProps = {
    dbUser,
    followingArticles,
    recommendationArticles,
    discoverArticles,
    bookmarks: bookmarks.map((b: any) => mapArticleToFeedItem(b.article)),
    followedCreators: followedCreators.map((f: any) => f.creator),
    suggestedCreators,
    initialFollowsCount: followsCount,
    initialBookmarksCount: bookmarksCount,
    initialHighlightsCount: highlightsCount,
    mutedWords: mutedWordsList,
    featuredArticle: widgetFeaturedArticle,
    recommendedArticles: widgetRecArticles,
    trends: trends.map((t: any) => ({ id: t.id, hashtag: t.hashtag, count: t.count })),
    promos: promos.map((p: any) => ({
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
