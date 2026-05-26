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
