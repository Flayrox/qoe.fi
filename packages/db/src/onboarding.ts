// =====================================================================
// 🎯 @qoe/db — Onboarding partagé (core + tenants)
// =====================================================================
// Logique d'onboarding utilisée par la page core ET le modal tenants :
//   - getOnboardingData()      → catégories + créateurs suggérés (server)
//   - completeOnboardingInDb() → persistance (prisma + embedding pgvector)
// L'authentification (getUser) reste dans une server action fine de chaque
// app, qui délègue à completeOnboardingInDb(userId, data).
// =====================================================================

import { prisma } from './client';

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

const DEFAULT_INTERESTS = [
  'Politique',
  'International',
  'Technologie',
  'Économie',
  'Philosophie',
  'Sciences',
  'Art & Design',
];

export interface OnboardingCategory {
  id: string;
  name: string;
  slug: string;
}

export interface OnboardingCreator {
  id: string;
  name: string | null;
  slug?: string | null;
  subdomain?: string | null;
  logoUrl: string | null;
  heroText: string | null;
}

export interface OnboardingData {
  categories: OnboardingCategory[];
  suggestedCreators: OnboardingCreator[];
}

export interface CompleteOnboardingInput {
  interests: string[];
  onboardingText?: string;
  mutedWords: string[];
  creatorsToFollow: string[];
  gender?: string;
  ageRange?: string;
  pronouns?: string;
}

/**
 * Récupère les centres d'intérêt (SystemConfig, modifiable depuis l'admin)
 * et les créateurs certifiés à suggérer lors de l'onboarding.
 */
export async function getOnboardingData(): Promise<OnboardingData> {
  let categories: OnboardingCategory[] = [];
  const configInterests = await prisma.systemConfig.findUnique({
    where: { key: 'ONBOARDING_INTERESTS' },
  });

  if (configInterests) {
    const list = configInterests.value
      .split(',')
      .map((i: string) => i.trim())
      .filter(Boolean);
    categories = list.map((name: string) => ({
      id: name,
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9_-]/g, ''),
    }));
  } else {
    // Liste par défaut, persistée au premier passage (idempotent).
    try {
      await prisma.systemConfig.create({
        data: {
          key: 'ONBOARDING_INTERESTS',
          value: DEFAULT_INTERESTS.join(', '),
          description:
            "Liste des centres d'intérêt proposés lors de l'onboarding (séparés par des virgules).",
        },
      });
    } catch {
      // Ignore si une création concurrente a déjà eu lieu.
    }
    categories = DEFAULT_INTERESTS.map((name) => ({
      id: name,
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9_-]/g, ''),
    }));
  }

  // Créateurs certifiés en priorité, sinon n'importe quel créateur (dev).
  const select = {
    id: true,
    name: true,
    slug: true,
    subdomain: true,
    logoUrl: true,
    heroText: true,
  } as const;

  const certified = await prisma.publication.findMany({
    where: {
      type: 'PERSONAL',
      isCertified: true,
      user: { is: { role: 'creator' } },
    },
    select,
    take: 5,
  });

  const suggestedCreators: OnboardingCreator[] =
    certified.length > 0
      ? certified
      : await prisma.publication.findMany({
          where: { type: 'PERSONAL', user: { is: { role: 'creator' } } },
          select,
          take: 5,
        });

  return { categories, suggestedCreators };
}

// ---------------------------------------------------------------------
// Embedding (stub déterministe — jina-embeddings-v3 MRL 512 dims, auto-hébergé)
// ---------------------------------------------------------------------

const EMBEDDING_DIM = 512;

function generateMockEmbedding(text: string, interests: string[] = []): number[] {
  const seedSource = `${text}|${interests.sort().join(',')}`;
  let hash = 0;
  for (let i = 0; i < seedSource.length; i++) {
    hash = (hash * 31 + seedSource.charCodeAt(i)) >>> 0;
  }
  return new Array(EMBEDDING_DIM).fill(0).map((_, i) => {
    const x = Math.sin(hash + i) * 10000;
    return (x - Math.floor(x)) * 2 - 1;
  });
}

async function updateUserEmbedding(userId: string, vector: number[]): Promise<void> {
  // Stub : l'inférence jina-embeddings-v3 auto-hébergée arrive en phase dédiée.
  // Phase future : prisma.$executeRaw`UPDATE "User" SET embedding = ${vector}::vector WHERE id = ${userId}`
  void userId;
  void vector;
  return Promise.resolve();
}

// ---------------------------------------------------------------------
// Persistance
// ---------------------------------------------------------------------

export async function completeOnboardingInDb(
  userId: string,
  data: CompleteOnboardingInput
): Promise<{ success: true }> {
  try {
    const gender = GENDERS.includes(data.gender as (typeof GENDERS)[number])
      ? (data.gender as (typeof GENDERS)[number])
      : undefined;
    const ageRange = AGE_RANGES.includes(data.ageRange as (typeof AGE_RANGES)[number])
      ? (data.ageRange as (typeof AGE_RANGES)[number])
      : undefined;
    const pronouns = data.pronouns?.trim().slice(0, 50) || undefined;

    // Marque l'onboarding comme terminé + biographie + démographie.
    await prisma.user.update({
      where: { id: userId },
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

    // Embedding sémantique (pgvector) pour le feed / recommandations.
    const embeddingVector = generateMockEmbedding(data.onboardingText || '', data.interests);
    await updateUserEmbedding(userId, embeddingVector);

    // 1. Mots masqués.
    if (data.mutedWords.length > 0) {
      await prisma.mutedWord.createMany({
        data: data.mutedWords.map((word) => ({
          word: word.toLowerCase().trim(),
          userId,
        })),
        skipDuplicates: true,
      });
    }

    // 2. Follows des créateurs choisis.
    if (data.creatorsToFollow.length > 0) {
      await prisma.follows.createMany({
        data: data.creatorsToFollow.map((publicationId) => ({
          readerId: userId,
          publicationId,
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
