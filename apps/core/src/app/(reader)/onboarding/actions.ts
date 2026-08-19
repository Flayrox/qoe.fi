'use server';

import { prisma } from '@qoe/db/client';
import { createClient } from '@qoe/supabase/server';
import { generateMockEmbedding, updateUserEmbedding } from '../../../lib/ai';

const GENDERS = ['FEMALE', 'MALE', 'NON_BINARY', 'OTHER', 'PREFER_NOT_TO_SAY'] as const;
const AGE_RANGES = [
  'UNDER_18',
  'AGE_18_24',
  'AGE_25_34',
  'AGE_35_44',
  'AGE_45_54',
  'AGE_55_64',
  'AGE_65_PLUS',
  'PREFER_NOT_TO_SAY',
] as const;

export async function completeOnboarding(data: {
  interests: string[];
  onboardingText?: string;
  mutedWords: string[];
  creatorsToFollow: string[];
  gender?: string;
  ageRange?: string;
  pronouns?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error('Unauthorized');

  try {
    const gender = GENDERS.includes(data.gender as (typeof GENDERS)[number])
      ? (data.gender as (typeof GENDERS)[number])
      : undefined;
    const ageRange = AGE_RANGES.includes(data.ageRange as (typeof AGE_RANGES)[number])
      ? (data.ageRange as (typeof AGE_RANGES)[number])
      : undefined;
    const pronouns = data.pronouns?.trim().slice(0, 50) || undefined;

    // Update onboarding completion and save biography if provided
    await prisma.user.update({
      where: { id: user.id },
      data: {
        hasCompletedOnboarding: true,
        ...(data.onboardingText ? { onboardingText: data.onboardingText } : {}),
        ...(gender || ageRange || pronouns
          ? {
              gender,
              ageRange,
              pronouns,
              demographicsUpdatedAt: new Date(),
            }
          : {}),
      },
    });

    // Generate and save AI pgvector embedding
    const embeddingVector = await generateMockEmbedding(data.onboardingText || '', data.interests);
    await updateUserEmbedding(user.id, embeddingVector);

    // 1. Save Muted Words
    if (data.mutedWords.length > 0) {
      await prisma.mutedWord.createMany({
        data: data.mutedWords.map((word) => ({
          word: word.toLowerCase().trim(),
          userId: user.id,
        })),
        skipDuplicates: true,
      });
    }

    // 2. Save Follows
    if (data.creatorsToFollow.length > 0) {
      await prisma.follows.createMany({
        data: data.creatorsToFollow.map((publicationId) => ({
          readerId: user.id,
          publicationId: publicationId,
        })),
        skipDuplicates: true,
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Onboarding error:', error);
    throw new Error('Failed to save preferences');
  }
}
