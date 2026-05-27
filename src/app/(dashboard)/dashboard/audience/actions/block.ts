"use server"

import { prisma } from "@/lib/db"
import { safeAction } from "@/lib/safe-action"
import { revalidatePath } from "next/cache"

export const blockReader = safeAction<string, { success: boolean }>(async (email, user) => {
  // Find the reader's user ID by email
  const reader = await prisma.user.findUnique({
    where: { email }
  })

  if (!reader) {
    throw new Error("Reader not found in the system.")
  }

  // Add to BlockedUser
  await prisma.blockedUser.upsert({
    where: {
      creatorId_readerId: {
        creatorId: user.id,
        readerId: reader.id
      }
    },
    update: {},
    create: {
      creatorId: user.id,
      readerId: reader.id
    }
  })

  // Also deactivate their subscription if any
  await prisma.subscriber.updateMany({
    where: {
      creatorId: user.id,
      email: email
    },
    data: {
      isActive: false
    }
  })

  revalidatePath("/dashboard/audience")
  return { success: true }
})
