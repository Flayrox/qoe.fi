import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { prisma } from "@/lib/db"
import { FeedDashboard } from "./FeedDashboard"

export default async function ReaderHomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/login")

  // Fetch dbUser details
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, name: true, email: true, walletBalanceCents: true, onboardingText: true, role: true, logoUrl: true, username: true }
  })

  // Creators the user follows
  const following = await prisma.follows.findMany({
    where: { readerId: user.id },
    select: { creatorId: true }
  })
  
  const creatorIds = following.map(f => f.creatorId)

  // Mapping helper
  const mapPostToFeedItem = (post: any) => ({
    id: post.id,
    title: "", // Empty title identifies it as a micro-post (tweet) in FeedDashboard
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

  // 1. Abonnements Feed (Followed creators' articles + micro-posts)
  const dbFollowingArticles = await prisma.article.findMany({
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

  const dbFollowingPosts = await prisma.post.findMany({
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

  const followingArticles = [
    ...dbFollowingArticles.map(mapArticleToFeedItem),
    ...dbFollowingPosts.map(mapPostToFeedItem)
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  // 2. Recommandations Feed (Featured articles + recent micro-posts on the platform)
  const dbRecArticles = await prisma.article.findMany({
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

  const dbRecPosts = await prisma.post.findMany({
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
            {
              authorId: { in: creatorIds },
              visibility: "followers"
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

  const recommendationArticles = [
    ...dbRecArticles.map(mapArticleToFeedItem),
    ...dbRecPosts.map(mapPostToFeedItem)
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  // 3. Découvrir Feed (Articles + posts from certified creators NOT followed yet)
  const dbDiscoverArticles = await prisma.article.findMany({
    where: {
      published: true,
      author: {
        role: 'creator',
        isCertified: true,
        id: { notIn: creatorIds }
      }
    },
    include: {
      author: { select: { id: true, name: true, username: true, subdomain: true, customDomain: true, logoUrl: true, heroText: true, isCertified: true } },
      category: { select: { name: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: 20
  })

  const dbDiscoverPosts = await prisma.post.findMany({
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
        id: { notIn: [...creatorIds, user.id] }
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

  const discoverArticles = [
    ...dbDiscoverArticles.map(mapArticleToFeedItem),
    ...dbDiscoverPosts.map(mapPostToFeedItem)
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  // Bookmarks (Sanctuaire)
  const bookmarks = await prisma.bookmark.findMany({
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

  // Followed creators
  const followedCreators = await prisma.follows.findMany({
    where: { readerId: user.id },
    include: {
      creator: { select: { id: true, name: true, username: true, subdomain: true, customDomain: true, logoUrl: true, heroText: true, isCertified: true } }
    },
    orderBy: { createdAt: 'desc' }
  })

  const followsCount = followedCreators.length
  const bookmarksCount = bookmarks.length
  const highlightsCount = await prisma.highlight.count({ where: { readerId: user.id } })

  // Suggested creators to follow
  const suggestedCreators = await prisma.user.findMany({
    where: {
      role: 'creator',
      isCertified: true,
      id: { notIn: [...creatorIds, user.id] }
    },
    select: { id: true, name: true, username: true, subdomain: true, customDomain: true, logoUrl: true, heroText: true, isCertified: true },
    take: 3
  })

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
  }

  return (
    <FeedDashboard {...feedProps} />
  )
}
