"use server"

import { prisma } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { safeAction } from "@/lib/safe-action"

export const toggleFollowCreatorHome = safeAction<string, { followed: boolean }>(async (creatorId, user) => {
  const existing = await prisma.follows.findUnique({
    where: {
      readerId_creatorId: {
        readerId: user.id,
        creatorId
      }
    }
  })

  if (existing) {
    await prisma.follows.delete({
      where: { id: existing.id }
    })
    revalidatePath("/home")
    return { followed: false }
  } else {
    await prisma.follows.create({
      data: {
        readerId: user.id,
        creatorId
      }
    })
    revalidatePath("/home")
    return { followed: true }
  }
})

export const toggleBookmarkArticleHome = safeAction<string, { bookmarked: boolean }>(async (articleId, user) => {
  const existing = await prisma.bookmark.findUnique({
    where: {
      readerId_articleId: {
        readerId: user.id,
        articleId
      }
    }
  })

  if (existing) {
    await prisma.bookmark.delete({
      where: { id: existing.id }
    })
    revalidatePath("/home")
    return { bookmarked: false }
  } else {
    await prisma.bookmark.create({
      data: {
        readerId: user.id,
        articleId
      }
    })
    revalidatePath("/home")
    return { bookmarked: true }
  }
})

export const createMicroPost = safeAction<{ content: string; tags: string[]; imageUrl?: string | null }, { post: any }>(async ({ content, tags, imageUrl }, user) => {
  const cleanContent = content.trim()
  if (!cleanContent || cleanContent.length > 280) {
    throw new Error("INVALID_CONTENT")
  }

  const post = await prisma.post.create({
    data: {
      content: cleanContent,
      authorId: user.id,
      tags,
      imageUrl: imageUrl || null
    },
    include: {
      author: { select: { id: true, name: true, subdomain: true, customDomain: true, logoUrl: true, heroText: true, username: true } }
    }
  })
  revalidatePath("/home")
  if (post.author.username) {
    revalidatePath(`/@${post.author.username}`)
  }
  return { post }
})

export const toggleLikePost = safeAction<string, { liked: boolean }>(async (postId, user) => {
  const existing = await prisma.like.findUnique({
    where: {
      postId_userId: {
        postId,
        userId: user.id
      }
    }
  })

  if (existing) {
    await prisma.like.delete({ where: { id: existing.id } })
    return { liked: false }
  } else {
    await prisma.like.create({
      data: {
        postId,
        userId: user.id
      }
    })
    return { liked: true }
  }
})

export const replyToPost = safeAction<{ postId: string; content: string }, { reply: any }>(async ({ postId, content }, user) => {
  const clean = content.trim()
  if (!clean) throw new Error("INVALID_CONTENT")

  const reply = await prisma.post.create({
    data: {
      content: clean,
      authorId: user.id,
      parentId: postId
    },
    include: {
      author: { select: { id: true, name: true, username: true, logoUrl: true, isCertified: true } }
    }
  })
  return { reply }
})

export const getPostThread = safeAction<string, { post: any }>(async (postId) => {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      author: { select: { id: true, name: true, username: true, logoUrl: true, isCertified: true, subdomain: true, customDomain: true } },
      likes: { select: { userId: true } },
      replies: {
        include: {
          author: { select: { id: true, name: true, username: true, logoUrl: true, isCertified: true } },
          likes: { select: { userId: true } },
          replies: {
            include: {
              author: { select: { id: true, name: true, username: true, logoUrl: true, isCertified: true } }
            }
          }
        },
        orderBy: { createdAt: "desc" }
      }
    }
  })

  return { post }
}, false) // No auth required for thread view

export const getArticleThread = safeAction<string, { article: any }>(async (slug) => {
  const article = await prisma.article.findUnique({
    where: { slug },
    include: {
      author: { select: { id: true, name: true, username: true, logoUrl: true, isCertified: true, subdomain: true, customDomain: true } },
      category: { select: { name: true } }
    }
  })
  return { article }
}, false)

export const repostPost = safeAction<string, { repost: any }>(async (postId, user) => {
  const repost = await prisma.post.create({
    data: {
      content: "", // empty content identifies a repost
      authorId: user.id,
      repostId: postId
    }
  })
  return { repost }
})

export const deletePost = safeAction<string, { success: boolean }>(async (postId, user) => {
  const post = await prisma.post.findUnique({ where: { id: postId } })
  if (!post || post.authorId !== user.id) throw new Error("UNAUTHORIZED")
  
  await prisma.post.delete({ where: { id: postId } })
  return { success: true }
})

export const getProfileData = safeAction<string, {
  profileUser: any
  isFollowing: boolean
  followersCount: number
  followingCount: number
  postsCount: number
  posts: any[]
  articles: any[]
  highlights: any[]
  letters: any[]
  initialMutedWords: any[]
}>(async (username) => {
  const supabase = await createClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  const currentUserId = authUser?.id || null

  const profileUser = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      role: true,
      logoUrl: true,
      heroText: true,
      onboardingText: true,
      isCertified: true,
      createdAt: true,
      subdomain: true,
      headerImageUrl: true
    }
  })

  if (!profileUser) throw new Error("NOT_FOUND")

  let isFollowing = false
  if (currentUserId && currentUserId !== profileUser.id) {
    const followRecord = await prisma.follows.findUnique({
      where: {
        readerId_creatorId: {
          readerId: currentUserId,
          creatorId: profileUser.id
        }
      }
    })
    isFollowing = !!followRecord
  }

  const followersCount = await prisma.follows.count({ where: { creatorId: profileUser.id } })
  const followingCount = await prisma.follows.count({ where: { readerId: profileUser.id } })
  const postsCount = await prisma.post.count({ where: { authorId: profileUser.id } })

  const dbPosts = await prisma.post.findMany({
    where: { authorId: profileUser.id },
    include: {
      author: { select: { id: true, name: true, username: true, logoUrl: true, isCertified: true } },
      likes: { select: { userId: true } },
      _count: { select: { likes: true, replies: true } }
    },
    orderBy: { createdAt: 'desc' }
  })

  const dbArticles = (profileUser.role === 'creator' || profileUser.role === 'superadmin')
    ? await prisma.article.findMany({
        where: { authorId: profileUser.id, published: true },
        include: { category: { select: { name: true } } },
        orderBy: { createdAt: 'desc' }
      })
    : []

  const dbHighlights = await prisma.highlight.findMany({
    where: { readerId: profileUser.id },
    include: { article: { select: { title: true, slug: true, author: { select: { name: true } } } } },
    orderBy: { createdAt: 'desc' },
    take: 15
  })

  const dbLetters = await prisma.letter.findMany({
    where: { recipientId: profileUser.id, isPublic: true },
    include: { sender: { select: { name: true, username: true, logoUrl: true, isCertified: true } } },
    orderBy: { createdAt: 'desc' }
  })

  let dbMutedWords: Array<{ id: string, word: string }> = []
  if (currentUserId && currentUserId === profileUser.id) {
    dbMutedWords = await prisma.mutedWord.findMany({
      where: { userId: currentUserId },
      select: { id: true, word: true },
      orderBy: { createdAt: 'desc' }
    })
  }

  return {
    profileUser: { ...profileUser, createdAt: profileUser.createdAt.toISOString() },
    isFollowing,
    followersCount,
    followingCount,
    postsCount,
    posts: dbPosts.map(p => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
      likesCount: p._count.likes,
      repliesCount: p._count.replies,
      liked: p.likes.some(l => l.userId === currentUserId)
    })),
    articles: dbArticles.map(a => ({ ...a, createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString() })),
    highlights: dbHighlights.map(h => ({ ...h, createdAt: h.createdAt.toISOString() })),
    letters: dbLetters.map(l => ({ ...l, createdAt: l.createdAt.toISOString() })),
    initialMutedWords: dbMutedWords
  }
}, false)
