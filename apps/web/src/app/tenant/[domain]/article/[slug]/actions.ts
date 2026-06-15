"use server"

import { prisma } from "@qoe/db/client"
import { createClient } from "@qoe/supabase/server"
import { revalidatePath } from "next/cache"

export async function toggleFollowCreator(creatorId: string) {
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
      return { success: true, followed: false }
    } else {
      await prisma.follows.create({
        data: {
          readerId: user.id,
          creatorId
        }
      })
      return { success: true, followed: true }
    }
  } catch (error) {
    console.error("Error in toggleFollowCreator:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}

export async function toggleBookmarkArticle(articleId: string) {
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
      return { success: true, bookmarked: false }
    } else {
      await prisma.bookmark.create({
        data: {
          readerId: user.id,
          articleId
        }
      })
      return { success: true, bookmarked: true }
    }
  } catch (error) {
    console.error("Error in toggleBookmarkArticle:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}

export async function createHighlight(articleId: string, text: string, note?: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "UNAUTHORIZED" }
  }

  try {
    const highlight = await prisma.highlight.create({
      data: {
        readerId: user.id,
        articleId,
        text,
        note
      }
    })
    return { success: true, highlight }
  } catch (error) {
    console.error("Error in createHighlight:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}

export async function unlockArticleWithWallet(creatorId: string, costCents: number = 200) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "UNAUTHORIZED" }
  }

  try {
    // Start transaction to avoid race conditions
    const result = await prisma.$transaction(async (tx) => {
      const dbUser = await tx.user.findUnique({
        where: { id: user.id },
        select: { walletBalanceCents: true, email: true }
      })

      if (!dbUser) {
        throw new Error("USER_NOT_FOUND")
      }

      if (dbUser.walletBalanceCents < costCents) {
        return { success: false, error: "INSUFFICIENT_FUNDS" }
      }

      // Deduct balance
      await tx.user.update({
        where: { id: user.id },
        data: {
          walletBalanceCents: {
            decrement: costCents
          }
        }
      })

      // Create transaction record
      await tx.walletTransaction.create({
        data: {
          userId: user.id,
          amountCents: -costCents,
          type: "SUBSCRIPTION_PAYMENT"
        }
      })

      // Create subscriber record
      await tx.subscriber.upsert({
        where: {
          email_creatorId: {
            email: dbUser.email,
            creatorId
          }
        },
        update: {
          isActive: true,
          isPremium: true
        },
        create: {
          email: dbUser.email,
          creatorId,
          isActive: true,
          isPremium: true,
          ltvCents: costCents
        }
      })

      return { success: true }
    })

    return result
  } catch (error: any) {
    console.error("Error in unlockArticleWithWallet:", error)
    return { success: false, error: error.message || "TRANSACTION_ERROR" }
  }
}

export async function getCurrentUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      subdomain: true,
      customDomain: true,
      walletBalanceCents: true,
    }
  })
  return dbUser
}
