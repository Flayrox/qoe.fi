import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { getRequestDbUser } from "@/lib/cached-queries"
import { FeedDashboard } from "./FeedDashboard"

export default async function ReaderHomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  // Étape 1 : Récupérer les détails de dbUser et les créateurs suivis en parallèle
  const [dbUser, followedCreators] = await Promise.all([
    getRequestDbUser(user.id),
    prisma.follows.findMany({
      where: { readerId: user.id },
      include: {
        creator: { select: { id: true, name: true, username: true, subdomain: true, customDomain: true, logoUrl: true, heroText: true, isCertified: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
  ])

  const creatorIds = followedCreators.map(f => f.creatorId)

  // Fonctions utilitaires de remappage
  const mapPostToFeedItem = (post: any) => ({
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
    category: { name: "Micro-post" },
    tags: post.tags || [],
    likesCount: post._count?.likes || 0,
    repliesCount: post._count?.replies || 0,
    liked: post.likes?.some((l: any) => l.userId === user.id) || false
  })

  const mapArticleToFeedItem = (art: any) => ({
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

  const dbFollowingPostsPromise = creatorIds.length > 0
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
        include: {
          author: { select: { id: true, name: true, username: true, subdomain: true, customDomain: true, logoUrl: true, heroText: true, isCertified: true } },
          likes: { select: { userId: true } },
          _count: { select: { likes: true, replies: true } }
        },
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
            { authorId: user.id },
            ...(creatorIds.length > 0 ? [{
              authorId: { in: creatorIds },
              visibility: "followers"
            }] : [])
          ]
        }
      ]
    },
    include: {
      author: { select: { id: true, name: true, username: true, subdomain: true, customDomain: true, logoUrl: true, heroText: true, isCertified: true } },
      likes: { select: { userId: true } },
      _count: { select: { likes: true, replies: true } }
    },
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
        id: creatorIds.length > 0 ? { notIn: [...creatorIds, user.id] } : { not: user.id }
      }
    },
    include: {
      author: { select: { id: true, name: true, username: true, subdomain: true, customDomain: true, logoUrl: true, heroText: true, isCertified: true } },
      likes: { select: { userId: true } },
      _count: { select: { likes: true, replies: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: 20
  })

  const bookmarksPromise = prisma.bookmark.findMany({
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

  const highlightsCountPromise = prisma.highlight.count({ where: { readerId: user.id } })

  const suggestedCreatorsPromise = prisma.user.findMany({
    where: {
      role: 'creator',
      isCertified: true,
      id: creatorIds.length > 0 ? { notIn: [...creatorIds, user.id] } : { not: user.id }
    },
    select: { id: true, name: true, username: true, subdomain: true, customDomain: true, logoUrl: true, heroText: true, isCertified: true },
    take: 3
  })

  // Récupérer les mots masqués en parallèle
  const mutedWordsPromise = prisma.mutedWord.findMany({
    where: { userId: user.id },
    select: { word: true }
  })

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
    mutedWords
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
    mutedWordsPromise
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
    mutedWords: mutedWordsList
  }

  return (
    <FeedDashboard {...feedProps} />
  )
}
