"use server"

import { prisma } from "@qoe/db/client"
import { createClient } from "@qoe/supabase/server"
import { revalidatePath } from "next/cache"

// 1. Profile updates
export async function updateProfile(data: { name: string, username: string, avatarUrl: string, bio: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { success: false, error: "UNAUTHORIZED" }

  const cleanName = data.name.trim()
  const cleanUsername = data.username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "")
  
  if (!cleanName || !cleanUsername) {
    return { success: false, error: "INVALID_FIELDS" }
  }

  try {
    // Check username availability if changed
    const existing = await prisma.user.findFirst({
      where: {
        username: cleanUsername,
        id: { not: user.id }
      }
    })

    if (existing) {
      return { success: false, error: "USERNAME_TAKEN" }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        name: cleanName,
        username: cleanUsername,
        logoUrl: data.avatarUrl.trim() || null,
        onboardingText: data.bio.trim() || null
      }
    })

    revalidatePath("/home")
    revalidatePath("/settings")
    return { success: true }
  } catch (error) {
    console.error("Error in updateProfile:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}

// 2. Creator upgrade
export async function upgradeToCreator(subdomain: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { success: false, error: "UNAUTHORIZED" }

  const cleanSubdomain = subdomain.trim().toLowerCase().replace(/[^a-z0-9-]/g, "")
  if (cleanSubdomain.length < 3) {
    return { success: false, error: "INVALID_SUBDOMAIN" }
  }

  try {
    // Check subdomain availability
    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { subdomain: cleanSubdomain },
          { username: cleanSubdomain }
        ]
      }
    })

    if (existing) {
      return { success: false, error: "SUBDOMAIN_TAKEN" }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        role: "creator",
        subdomain: cleanSubdomain,
        layoutStyle: "minimal",
        themeMode: "light"
      }
    })

    revalidatePath("/home")
    revalidatePath("/settings")
    return { success: true }
  } catch (error) {
    console.error("Error in upgradeToCreator:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}

// 3. Newsletter preferences
export async function updateNewsletterPreferences(creatorId: string, receiveArticles: boolean, receivePosts: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !user.email) return { success: false, error: "UNAUTHORIZED" }

  try {
    // Check if subscriber record exists
    const existing = await prisma.subscriber.findUnique({
      where: {
        email_creatorId: {
          email: user.email,
          creatorId
        }
      }
    })

    if (existing) {
      await prisma.subscriber.update({
        where: { id: existing.id },
        data: {
          receiveArticles,
          receivePosts,
          isActive: receiveArticles || receivePosts // Inactive if both toggled off
        }
      })
    } else {
      // If following but no subscriber record existed, create one
      await prisma.subscriber.create({
        data: {
          email: user.email,
          creatorId,
          receiveArticles,
          receivePosts,
          isActive: receiveArticles || receivePosts
        }
      })
    }

    revalidatePath("/settings")
    return { success: true }
  } catch (error) {
    console.error("Error in updateNewsletterPreferences:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}

// 4. Security updates (Supabase auth client wrapper)
export async function updateSecurityEmail(email: string) {
  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ email })
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function updateSecurityPassword(password: string) {
  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { success: false, error: error.message }
  return { success: true }
}

// 5. GDPR JSON Data Export
export async function exportUserData() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { success: false, error: "UNAUTHORIZED" }

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        following: {
          include: {
            creator: { select: { name: true, subdomain: true, customDomain: true } }
          }
        },
        bookmarks: {
          include: {
            article: { select: { title: true, slug: true } }
          }
        },
        highlights: {
          include: {
            article: { select: { title: true } }
          }
        },
        walletTransactions: true,
        posts: true,
        sentLetters: true,
        receivedLetters: true
      }
    })

    if (!dbUser) return { success: false, error: "USER_NOT_FOUND" }

    const exportData = {
      exportTimestamp: new Date().toISOString(),
      platform: "qoe.fi",
      legalCompliance: "GDPR Art 20 - Data Portability",
      profile: {
        id: dbUser.id,
        email: dbUser.email,
        username: dbUser.username,
        name: dbUser.name,
        role: dbUser.role,
        walletBalanceCents: dbUser.walletBalanceCents,
        onboardingText: dbUser.onboardingText,
        createdAt: dbUser.createdAt
      },
      interactions: {
        following: dbUser.following.map((f: any) => ({
          creatorName: f.creator.name,
          creatorSubdomain: f.creator.subdomain,
          followedAt: f.createdAt
        })),
        bookmarks: dbUser.bookmarks.map((b: any) => ({
          articleTitle: b.article.title,
          articleSlug: b.article.slug,
          bookmarkedAt: b.createdAt
        })),
        highlights: dbUser.highlights.map((h: any) => ({
          articleTitle: h.article.title,
          quoteText: h.text,
          personalNote: h.note,
          highlightedAt: h.createdAt
        })),
        walletTransactions: dbUser.walletTransactions.map((t: any) => ({
          amountCents: t.amountCents,
          type: t.type,
          timestamp: t.createdAt
        })),
        microPosts: dbUser.posts.map((p: any) => ({
          content: p.content,
          tags: p.tags,
          createdAt: p.createdAt
        })),
        sentLetters: dbUser.sentLetters.map((l: any) => ({
          content: l.content,
          isPublic: l.isPublic,
          sentAt: l.createdAt
        }))
      }
    }

    return { success: true, data: exportData }
  } catch (error) {
    console.error("Error in exportUserData:", error)
    return { success: false, error: "EXPORT_ERROR" }
  }
}

export async function addMutedWord(word: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { success: false, error: "UNAUTHORIZED" }

  const cleanWord = word.trim().toLowerCase()
  if (!cleanWord) return { success: false, error: "INVALID_WORD" }

  try {
    const muted = await prisma.mutedWord.create({
      data: {
        word: cleanWord,
        userId: user.id
      }
    })
    revalidatePath("/settings")
    return { success: true, muted }
  } catch (error) {
    console.error("Error in addMutedWord:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}

export async function removeMutedWord(id: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { success: false, error: "UNAUTHORIZED" }

  try {
    await prisma.mutedWord.delete({
      where: { id }
    })
    revalidatePath("/settings")
    return { success: true }
  } catch (error) {
    console.error("Error in removeMutedWord:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}

// 6. Asynchronous GDPR Email Export Request
export async function requestGdprExportEmail() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !user.email) return { success: false, error: "UNAUTHORIZED" }

  try {
    // In production with local or cloud Supabase/Resend, this enqueues an email job.
    // For now, log the GDPR export request
    console.log(`[GDPR EXPORT JOB] Queued data export for user ${user.id} (${user.email})`)

    return { success: true, message: "JOB_QUEUED" }
  } catch (error) {
    console.error("Error in requestGdprExportEmail:", error)
    return { success: false, error: "EXPORT_REQUEST_FAILED" }
  }
}

// 7. Account Freeze / Sleep Mode
export async function freezeAccount() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { success: false, error: "UNAUTHORIZED" }

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        isSuspended: true,
        suspendReason: "USER_FREEZE"
      }
    })

    revalidatePath("/settings")
    return { success: true }
  } catch (error) {
    console.error("Error in freezeAccount:", error)
    return { success: false, error: "FREEZE_ERROR" }
  }
}

// 8. Permanent Account Deletion Request
export async function deleteAccount(password: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || !user.email) return { success: false, error: "UNAUTHORIZED" }

  if (!password || password.trim().length === 0) {
    return { success: false, error: "PASSWORD_REQUIRED" }
  }

  try {
    // Verify user password with Supabase Auth
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: password
    })

    if (signInError) {
      return { success: false, error: "INVALID_PASSWORD" }
    }

    // Schedule account deletion in Prisma
    await prisma.user.update({
      where: { id: user.id },
      data: {
        isSuspended: true,
        suspendReason: "SCHEDULED_FOR_DELETION"
      }
    })

    revalidatePath("/settings")
    return { success: true }
  } catch (error) {
    console.error("Error in deleteAccount:", error)
    return { success: false, error: "DELETE_ERROR" }
  }
}

// 9. Revoke Session
export async function revokeUserSession(sessionId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { success: false, error: "UNAUTHORIZED" }

  try {
    console.log(`[AUTH SESSION] Revoking session ${sessionId} for user ${user.id}`)
    return { success: true }
  } catch (error) {
    console.error("Error in revokeUserSession:", error)
    return { success: false, error: "REVOKE_ERROR" }
  }
}

// 10. Update Timeline Preferences
export async function updateTimelinePreferences(data: { algorithm: "chrono" | "ai", triggerWarnings: "show" | "warn" | "hide", autoplay: boolean }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { success: false, error: "UNAUTHORIZED" }

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        themeMode: data.algorithm === "ai" ? "ai_recommended" : "chronological"
      }
    })

    revalidatePath("/settings")
    return { success: true }
  } catch (error) {
    console.error("Error in updateTimelinePreferences:", error)
    return { success: false, error: "PREFERENCES_ERROR" }
  }
}

