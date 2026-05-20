"use server"

import { prisma } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"

export async function completeOnboarding(data: {
  interests: string[];
  mutedWords: string[];
  creatorsToFollow: string[];
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error("Unauthorized")

  try {
    // 1. Save Muted Words
    if (data.mutedWords.length > 0) {
      await prisma.mutedWord.createMany({
        data: data.mutedWords.map(word => ({
          word: word.toLowerCase().trim(),
          userId: user.id
        })),
        skipDuplicates: true
      })
    }

    // 2. Save Follows
    if (data.creatorsToFollow.length > 0) {
      await prisma.follows.createMany({
        data: data.creatorsToFollow.map(creatorId => ({
          readerId: user.id,
          creatorId: creatorId
        })),
        skipDuplicates: true
      })
    }
    
    // In a real scenario, we might also save interests directly on the user model 
    // or as a relation to personalize the pgvector query later.
    
    return { success: true }
  } catch (error) {
    console.error("Onboarding error:", error)
    throw new Error("Failed to save preferences")
  }
}
