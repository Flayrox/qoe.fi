"use server"

import { prisma } from "@qoe/db/client"
import { createClient } from "@qoe/supabase/server"
import { generateMockEmbedding, updateUserEmbedding } from "../../../lib/ai"

export async function completeOnboarding(data: {
  interests: string[];
  onboardingText?: string;
  mutedWords: string[];
  creatorsToFollow: string[];
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error("Unauthorized")

  try {
    // Save onboarding text if provided
    if (data.onboardingText) {
      await prisma.user.update({
        where: { id: user.id },
        data: { onboardingText: data.onboardingText }
      })
    }

    // Generate and save AI pgvector embedding
    const embeddingVector = await generateMockEmbedding(data.onboardingText || "", data.interests)
    await updateUserEmbedding(user.id, embeddingVector)

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
    
    return { success: true }
  } catch (error) {
    console.error("Onboarding error:", error)
    throw new Error("Failed to save preferences")
  }
}
