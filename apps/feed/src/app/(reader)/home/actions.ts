"use server"

import { prisma } from "@qoe/db/client"
import { createClient } from "@qoe/supabase/server"
import { revalidatePath } from "next/cache"
import { safeAction } from "@/lib/safe-action"

// Cache global en mémoire pour les aperçus d'URLs (unfurling) pour éviter le scraping à chaque appel et les bannissements d'IP
const unfurlCache = new Map<string, {
  isInternal: boolean
  postType?: "post" | "article"
  data?: unknown
  externalMetadata?: {
    title: string | null
    description: string | null
    image: string | null
    siteName: string | null
    url: string
  }
}>()

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
    return { followed: false }
  } else {
    await prisma.follows.create({
      data: {
        readerId: user.id,
        creatorId
      }
    })
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
    return { bookmarked: false }
  } else {
    await prisma.bookmark.create({
      data: {
        readerId: user.id,
        articleId
      }
    })
    return { bookmarked: true }
  }
})

export const createMicroPost = safeAction<{
  content: string;
  tags: string[];
  imageUrl?: string | null;
  visibility?: string;
  isDraft?: boolean;
  scheduledAt?: string | null;
  triggerWarning?: string | null;
}, { post: any }>(async ({ content, tags, imageUrl, visibility, isDraft, scheduledAt, triggerWarning }, user) => {
  const cleanContent = content.trim()
  
  // Calculate characters with link rules:
  // External links count as 20 chars, internal (post/article) count as 0 chars.
  const urlRegex = /https?:\/\/[^\s]+/gi
  const urls = cleanContent.match(urlRegex) || []
  let charLength = cleanContent.length
  for (const url of urls) {
    charLength -= url.length
    const isInternal = url.includes("/post/") || url.includes("/article/")
    if (!isInternal) {
      charLength += 20
    }
  }

  const hasImages = imageUrl && imageUrl.trim() && imageUrl !== "[]" && imageUrl !== "null"
  if ((!cleanContent && !hasImages) || charLength > 280) {
    throw new Error("INVALID_CONTENT")
  }

  const post = await prisma.post.create({
    data: {
      content: cleanContent,
      authorId: user.id,
      tags,
      imageUrl: imageUrl || null,
      visibility: visibility || "public",
      isDraft: isDraft || false,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
      triggerWarning: triggerWarning || null
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
  const isOwnProfile = currentUserId === profileUser.id
  const postsCount = await prisma.post.count({
    where: {
      authorId: profileUser.id,
      ...(isOwnProfile ? {} : {
        isDraft: false,
        OR: [
          { scheduledAt: null },
          { scheduledAt: { lte: new Date() } }
        ],
        visibility: isFollowing ? { in: ["public", "followers"] } : "public"
      })
    }
  })

  const dbPosts = await prisma.post.findMany({
    where: {
      authorId: profileUser.id,
      ...(isOwnProfile ? {} : {
        isDraft: false,
        OR: [
          { scheduledAt: null },
          { scheduledAt: { lte: new Date() } }
        ],
        visibility: isFollowing ? { in: ["public", "followers"] } : "public"
      })
    },
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

export const getUserDrafts = safeAction<void, { drafts: any[] }>(async (_, user) => {
  const drafts = await prisma.post.findMany({
    where: {
      authorId: user.id,
      isDraft: true
    },
    include: {
      author: { select: { id: true, name: true, username: true, logoUrl: true, isCertified: true } }
    },
    orderBy: { updatedAt: "desc" }
  })
  return { drafts }
})

export const pinPost = safeAction<string, { success: boolean }>(async (postId, user) => {
  const post = await prisma.post.findUnique({ where: { id: postId } })
  if (!post || post.authorId !== user.id) throw new Error("UNAUTHORIZED")

  // Reset all other pinned posts for this user
  await prisma.post.updateMany({
    where: { authorId: user.id, isPinned: true },
    data: { isPinned: false }
  })

  // Set this post as pinned
  await prisma.post.update({
    where: { id: postId },
    data: { isPinned: true }
  })

  revalidatePath("/home")
  if (user.username) {
    revalidatePath(`/@${user.username}`)
  }
  return { success: true }
})

export const unpinPost = safeAction<string, { success: boolean }>(async (postId, user) => {
  const post = await prisma.post.findUnique({ where: { id: postId } })
  if (!post || post.authorId !== user.id) throw new Error("UNAUTHORIZED")

  await prisma.post.update({
    where: { id: postId },
    data: { isPinned: false }
  })

  revalidatePath("/home")
  if (user.username) {
    revalidatePath(`/@${user.username}`)
  }
  return { success: true }
})

export const unfurlUrl = safeAction<string, {
  isInternal: boolean
  postType?: "post" | "article"
  data?: any
  externalMetadata?: {
    title: string | null
    description: string | null
    image: string | null
    siteName: string | null
    url: string
  }
}>(async (urlStr) => {
  try {
    let url = urlStr.trim()
    if (!/^https?:\/\//i.test(url)) {
      url = "https://" + url
    }

    // Retourner immédiatement si le résultat est déjà présent dans le cache mémoire global
    if (unfurlCache.has(url)) {
      return unfurlCache.get(url)!
    }

    const parsedUrl = new URL(url)
    
    // Vérifier si l'hôte appartient à la plateforme (ne traiter comme interne que si localhost ou qoe.fi)
    const isInternalHost = parsedUrl.hostname.endsWith("qoe.fi") || 
                           parsedUrl.hostname === "localhost" || 
                           parsedUrl.hostname.endsWith(".localhost") ||
                           parsedUrl.hostname === "127.0.0.1"

    if (isInternalHost) {
      // Vérifier s'il s'agit d'un micro-post ou d'un article interne
      const postMatch = parsedUrl.pathname.match(/\/post\/([a-zA-Z0-9]+)/)
      if (postMatch) {
        const postId = postMatch[1]
        const post = await prisma.post.findUnique({
          where: { id: postId },
          include: {
            author: { select: { id: true, name: true, username: true, subdomain: true, logoUrl: true, isCertified: true } }
          }
        })
        if (post) {
          const result = { isInternal: true, postType: "post" as const, data: post }
          unfurlCache.set(url, result)
          return result
        }
      }

      const articleMatch = parsedUrl.pathname.match(/\/article\/([a-zA-Z0-9_-]+)/)
      if (articleMatch) {
        const slug = articleMatch[1]
        const article = await prisma.article.findUnique({
          where: { slug },
          include: {
            author: { select: { id: true, name: true, username: true, subdomain: true, logoUrl: true, isCertified: true } }
          }
        })
        if (article) {
          const result = { isInternal: true, postType: "article" as const, data: article }
          unfurlCache.set(url, result)
          return result
        }
      }
    }

    // Unfurl (résolution) de l'URL externe
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 4000)

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    })
    
    clearTimeout(timeoutId)

    if (!response.ok) {
      const failResult = { isInternal: false, externalMetadata: { title: parsedUrl.hostname, description: null, image: null, siteName: parsedUrl.hostname, url } }
      unfurlCache.set(url, failResult)
      return failResult
    }

    const html = await response.text()

    const getMeta = (propertyOrName: string) => {
      const regex = new RegExp(`<meta[^>]*(?:property|name)=["']${propertyOrName}["'][^>]*content=["']([^"']+)["']`, "i")
      let match = html.match(regex)
      if (!match) {
        const regexReversed = new RegExp(`<meta[^]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${propertyOrName}["']`, "i")
        match = html.match(regexReversed)
      }
      return match ? match[1] : null
    }

    const getTitle = () => {
      const match = html.match(/<title[^>]*>([^<]+)<\/title>/i)
      return match ? match[1] : null
    }

    const title = getMeta("og:title") || getMeta("twitter:title") || getTitle() || parsedUrl.hostname
    const description = getMeta("og:description") || getMeta("twitter:description") || getMeta("description")
    const image = getMeta("og:image") || getMeta("twitter:image")
    const siteName = getMeta("og:site_name") || parsedUrl.hostname

    const successResult = {
      isInternal: false,
      externalMetadata: {
        title: title ? title.trim() : parsedUrl.hostname,
        description: description ? description.trim() : null,
        image: image ? image.trim() : null,
        siteName: siteName ? siteName.trim() : parsedUrl.hostname,
        url
      }
    }
    unfurlCache.set(url, successResult)
    return successResult
  } catch (error) {
    console.error("Unfurl error:", error)
    try {
      const fallbackUrl = new URL(urlStr)
      const errFallbackResult = {
        isInternal: false,
        externalMetadata: {
          title: fallbackUrl.hostname,
          description: null,
          image: null,
          siteName: fallbackUrl.hostname,
          url: urlStr
        }
      }
      unfurlCache.set(urlStr, errFallbackResult)
      return errFallbackResult
    } catch {
      const totalFallbackResult = {
        isInternal: false,
        externalMetadata: {
          title: urlStr,
          description: null,
          image: null,
          siteName: urlStr,
          url: urlStr
        }
      }
      unfurlCache.set(urlStr, totalFallbackResult)
      return totalFallbackResult
    }
  }
}, false)
