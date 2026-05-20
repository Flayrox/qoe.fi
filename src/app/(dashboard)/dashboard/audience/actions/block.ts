"use server"

import { prisma } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

export async function blockReader(email: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error("Unauthorized")

  // Find the reader's user ID by email
  const reader = await prisma.user.findUnique({
    where: { email }
  })

  if (!reader) {
    throw new Error("Reader not found in the system.")
  }

  try {
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
  } catch (error) {
    console.error("Block error:", error)
    throw new Error("Failed to block the reader.")
  }
}
