"use server"

import { prisma } from "@/lib/db"

export async function subscribeToNewsletter(formData: FormData) {
  const email = formData.get("email") as string
  const creatorId = formData.get("creatorId") as string

  if (!email || !creatorId) {
    return { error: "Missing required fields." }
  }

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Invalid email address." }
  }

  try {
    // We use upsert so if they resubscribe, we just set isActive to true
    await prisma.subscriber.upsert({
      where: {
        email_creatorId: {
          email,
          creatorId
        }
      },
      update: {
        isActive: true
      },
      create: {
        email,
        creatorId,
        isActive: true
      }
    })

    return { success: true }
  } catch (error) {
    console.error("Subscription error:", error)
    return { error: "An error occurred while subscribing. Please try again." }
  }
}
