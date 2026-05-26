"use server"

import { prisma } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

/**
 * Follow or unfollow a user from their profile page
 */
export async function toggleFollowUser(targetUserId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "UNAUTHORIZED" }
  }

  if (user.id === targetUserId) {
    return { success: false, error: "CANNOT_FOLLOW_SELF" }
  }

  try {
    const existing = await prisma.follows.findUnique({
      where: {
        readerId_creatorId: {
          readerId: user.id,
          creatorId: targetUserId
        }
      }
    })

    const dbUsers = await prisma.user.findMany({
      where: { id: { in: [user.id, targetUserId] } },
      select: { id: true, username: true }
    })
    const currentUserDb = dbUsers.find(u => u.id === user.id)
    const targetUserDb = dbUsers.find(u => u.id === targetUserId)

    if (existing) {
      await prisma.follows.delete({
        where: { id: existing.id }
      })
      revalidatePath("/home")
      if (currentUserDb?.username) revalidatePath(`/@${currentUserDb.username}`)
      if (targetUserDb?.username) revalidatePath(`/@${targetUserDb.username}`)
      return { success: true, followed: false }
    } else {
      await prisma.follows.create({
        data: {
          readerId: user.id,
          creatorId: targetUserId
        }
      })
      revalidatePath("/home")
      if (currentUserDb?.username) revalidatePath(`/@${currentUserDb.username}`)
      if (targetUserDb?.username) revalidatePath(`/@${targetUserDb.username}`)
      return { success: true, followed: true }
    }
  } catch (error) {
    console.error("Error in toggleFollowUser:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}

/**
 * Send a direct letter (private or public) to another user
 */
export async function sendLetter(recipientId: string, content: string, isPublic: boolean) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "UNAUTHORIZED" }
  }

  const cleanContent = content.trim()
  if (!cleanContent) {
    return { success: false, error: "EMPTY_CONTENT" }
  }

  try {
    const letter = await prisma.letter.create({
      data: {
        content: cleanContent,
        isPublic,
        senderId: user.id,
        recipientId
      }
    })

    return { success: true, letter }
  } catch (error) {
    console.error("Error in sendLetter:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}

/**
 * Instantly update avatar URL from direct profile uploads
 */
export async function updateAvatarDirect(avatarUrl: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "UNAUTHORIZED" }
  }

  const cleanUrl = avatarUrl.trim()
  if (!cleanUrl) {
    return { success: false, error: "INVALID_URL" }
  }

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { logoUrl: cleanUrl }
    })

    revalidatePath("/home")
    revalidatePath("/settings")
    return { success: true }
  } catch (error) {
    console.error("Error in updateAvatarDirect:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}

/**
 * Fetch followed users (followers or following list) for overlays
 */
export async function fetchUserConnections(userId: string, type: "followers" | "following") {
  try {
    if (type === "followers") {
      const records = await prisma.follows.findMany({
        where: { creatorId: userId },
        include: {
          reader: {
            select: { id: true, name: true, username: true, logoUrl: true, role: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      })
      return { success: true, users: records.map(r => r.reader) }
    } else {
      const records = await prisma.follows.findMany({
        where: { readerId: userId },
        include: {
          creator: {
            select: { id: true, name: true, username: true, logoUrl: true, role: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      })
      return { success: true, users: records.map(r => r.creator) }
    }
  } catch (error) {
    console.error("Error in fetchUserConnections:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}

/**
 * Direct profile update from the public profile modal
 */
export async function updateProfileDirect(data: { name: string, username: string, bio: string, email: string }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { success: false, error: "UNAUTHORIZED" }
  }

  const cleanName = data.name.trim()
  const cleanUsername = data.username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "")
  const cleanEmail = data.email.trim()

  if (!cleanName || !cleanUsername) {
    return { success: false, error: "INVALID_FIELDS" }
  }

  try {
    // Check username availability
    const existing = await prisma.user.findFirst({
      where: {
        username: cleanUsername,
        id: { not: user.id }
      }
    })

    if (existing) {
      return { success: false, error: "USERNAME_TAKEN" }
    }

    // Update email in Supabase auth if changed
    if (cleanEmail && cleanEmail !== user.email) {
      const { error: emailError } = await supabase.auth.updateUser({ email: cleanEmail })
      if (emailError) {
        return { success: false, error: emailError.message }
      }
    }

    // Update profile in DB
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: cleanName,
        username: cleanUsername,
        onboardingText: data.bio.trim() || null
      }
    })

    revalidatePath("/home")
    revalidatePath("/settings")
    if (updatedUser.username) {
      revalidatePath(`/@${updatedUser.username}`)
    }
    return { success: true }
  } catch (error) {
    console.error("Error in updateProfileDirect:", error)
    return { success: false, error: "DATABASE_ERROR" }
  }
}
