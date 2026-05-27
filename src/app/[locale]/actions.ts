"use server"

import { prisma } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { safeAction } from "@/lib/safe-action"

/**
 * Follow or unfollow a user from their profile page
 */
export const toggleFollowUser = safeAction<string, { followed: boolean }>(async (targetUserId, user) => {
  if (user.id === targetUserId) {
    throw new Error("CANNOT_FOLLOW_SELF")
  }

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
    return { followed: false }
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
    return { followed: true }
  }
})

/**
 * Send a direct letter (private or public) to another user
 */
export const sendLetter = safeAction<{ recipientId: string; content: string; isPublic: boolean }, { letter: any }>(async ({ recipientId, content, isPublic }, user) => {
  const cleanContent = content.trim()
  if (!cleanContent) {
    throw new Error("EMPTY_CONTENT")
  }

  const letter = await prisma.letter.create({
    data: {
      content: cleanContent,
      isPublic,
      senderId: user.id,
      recipientId
    }
  })

  return { letter }
})

/**
 * Instantly update avatar URL from direct profile uploads
 */
export const updateAvatarDirect = safeAction<string, { success: boolean }>(async (avatarUrl, user) => {
  const cleanUrl = avatarUrl.trim()
  if (!cleanUrl) {
    throw new Error("INVALID_URL")
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { logoUrl: cleanUrl }
  })

  revalidatePath("/home")
  revalidatePath("/settings")
  return { success: true }
})

/**
 * Fetch followed users (followers or following list) for overlays
 */
export const fetchUserConnections = safeAction<{ userId: string; type: "followers" | "following" }, { users: any[] }>(async ({ userId, type }) => {
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
    return { users: records.map(r => r.reader) }
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
    return { users: records.map(r => r.creator) }
  }
}, false) // No authentication required to fetch connections

/**
 * Direct profile update from the public profile modal
 */
export const updateProfileDirect = safeAction<{ name: string; username: string; bio: string; email: string }, { success: boolean }>(async (data, user) => {
  const cleanName = data.name.trim()
  const cleanUsername = data.username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "")
  const cleanEmail = data.email.trim()

  if (!cleanName || !cleanUsername) {
    throw new Error("INVALID_FIELDS")
  }

  // Check username availability
  const existing = await prisma.user.findFirst({
    where: {
      username: cleanUsername,
      id: { not: user.id }
    }
  })

  if (existing) {
    throw new Error("USERNAME_TAKEN")
  }

  // Update email in Supabase auth if changed
  if (cleanEmail && cleanEmail !== user.email) {
    const supabase = await createClient()
    const { error: emailError } = await supabase.auth.updateUser({ email: cleanEmail })
    if (emailError) {
      throw new Error(emailError.message)
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
})
