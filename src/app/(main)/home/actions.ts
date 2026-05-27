"use server"

import { prisma } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function toggleFollowCreatorHome(creatorId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "UNAUTHORIZED" }
  }

  try {
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
      return { success: true, followed: false }
    } else {
      await prisma.follows.create({
        data: {
          readerId: user.id,
          creatorId
        }
      })
      revalidatePath("/home")
      return { success: true, followed: true }
    }
  } catch (error) {
    console.error("Error in toggleFollowCreatorHome:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}

export async function toggleBookmarkArticleHome(articleId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "UNAUTHORIZED" }
  }

  try {
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
      return { success: true, bookmarked: false }
    } else {
      await prisma.bookmark.create({
        data: {
          readerId: user.id,
          articleId
        }
      })
      revalidatePath("/home")
      return { success: true, bookmarked: true }
    }
  } catch (error) {
    console.error("Error in toggleBookmarkArticleHome:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}

export async function createMicroPost(content: string, tags: string[], imageUrl?: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "UNAUTHORIZED" }
  }

  const cleanContent = content.trim()
  if (!cleanContent || cleanContent.length > 280) {
    return { success: false, error: "INVALID_CONTENT" }
  }

  try {
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
    return { success: true, post }
  } catch (error) {
    console.error("Error in createMicroPost:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}

export async function toggleLikePost(postId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { success: false, error: "UNAUTHORIZED" }

  try {
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
      return { success: true, liked: false }
    } else {
      await prisma.like.create({
        data: {
          postId,
          userId: user.id
        }
      })
      return { success: true, liked: true }
    }
  } catch (error) {
    console.error("Like error:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}

export async function replyToPost(postId: string, content: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { success: false, error: "UNAUTHORIZED" }

  const clean = content.trim()
  if (!clean) return { success: false, error: "INVALID" }

  try {
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
    return { success: true, reply }
  } catch (error) {
    console.error("Reply error:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}

export async function getPostThread(postId: string) {
  try {
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

    return { success: true, post }
  } catch (error) {
    console.error("Fetch thread error:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}

export async function getArticleThread(slug: string) {
  try {
    const article = await prisma.article.findUnique({
      where: { slug },
      include: {
        author: { select: { id: true, name: true, username: true, logoUrl: true, isCertified: true, subdomain: true, customDomain: true } },
        category: { select: { name: true } }
      }
    })
    return { success: true, article }
  } catch (error) {
    console.error("Fetch article error:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}

export async function repostPost(postId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { success: false, error: "UNAUTHORIZED" }

  try {
    const repost = await prisma.post.create({
      data: {
        content: "", // empty content identifies a repost
        authorId: user.id,
        repostId: postId
      }
    })
    return { success: true, repost }
  } catch (error) {
    console.error("Repost error:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}
