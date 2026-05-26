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
    select: { id: true, name: true, email: true, walletBalanceCents: true, onboardingText: true }
  })

  // Creators the user follows
  const following = await prisma.follows.findMany({
    where: { readerId: user.id },
    select: { creatorId: true }
  })
  
  const creatorIds = following.map(f => f.creatorId)

  // 1. Abonnements Feed (Articles from followed creators)
  const followingArticles = await prisma.article.findMany({
    where: { 
      authorId: { in: creatorIds },
      published: true 
    },
    include: {
      author: { select: { id: true, name: true, subdomain: true, customDomain: true, logoUrl: true, heroText: true } },
      category: { select: { name: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: 20
  })

  // 2. Recommandations Feed (curated/editor picks + all recent articles)
  const recommendationArticles = await prisma.article.findMany({
    where: { 
      published: true 
    },
    include: {
      author: { select: { id: true, name: true, subdomain: true, customDomain: true, logoUrl: true, heroText: true } },
      category: { select: { name: true } }
    },
    orderBy: [
      { isEditorPick: 'desc' },
      { createdAt: 'desc' }
    ],
    take: 20
  })

  // 3. Découvrir Feed (Articles from certified creators NOT followed yet)
  const discoverArticles = await prisma.article.findMany({
    where: {
      published: true,
      author: {
        role: 'creator',
        isCertified: true,
        id: { notIn: creatorIds }
      }
    },
    include: {
      author: { select: { id: true, name: true, subdomain: true, customDomain: true, logoUrl: true, heroText: true } },
      category: { select: { name: true } }
    },
    orderBy: { createdAt: 'desc' },
    take: 20
  })

  // Bookmarks details (Sanctuaire)
  const bookmarks = await prisma.bookmark.findMany({
    where: { readerId: user.id },
    include: {
      article: {
        include: {
          author: { select: { id: true, name: true, subdomain: true, customDomain: true, logoUrl: true } },
          category: { select: { name: true } }
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  })

  // Followed creators list
  const followedCreators = await prisma.follows.findMany({
    where: { readerId: user.id },
    include: {
      creator: { select: { id: true, name: true, subdomain: true, customDomain: true, logoUrl: true, heroText: true } }
    },
    orderBy: { createdAt: 'desc' }
  })

  // Counts for sidebar metrics
  const followsCount = await prisma.follows.count({ where: { readerId: user.id } })
  const bookmarksCount = bookmarks.length
  const highlightsCount = await prisma.highlight.count({ where: { readerId: user.id } })

  // Suggested creators list to discover
  const suggestedCreators = await prisma.user.findMany({
    where: {
      role: 'creator',
      isCertified: true,
      id: { notIn: creatorIds }
    },
    select: { id: true, name: true, subdomain: true, customDomain: true, logoUrl: true, heroText: true },
    take: 3
  })

  return (
    <FeedDashboard
      dbUser={dbUser}
      followingArticles={followingArticles}
      recommendationArticles={recommendationArticles}
      discoverArticles={discoverArticles}
      bookmarks={bookmarks.map(b => b.article)}
      followedCreators={followedCreators.map(f => f.creator)}
      suggestedCreators={suggestedCreators}
      initialFollowsCount={followsCount}
      initialBookmarksCount={bookmarksCount}
      initialHighlightsCount={highlightsCount}
    />
  )
}
