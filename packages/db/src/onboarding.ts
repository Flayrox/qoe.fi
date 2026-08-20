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
import http from 'node:http';

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

export interface OnboardingSubtopic {
  id: string;
  name: string;
  slug: string;
  tags?: string[];
}

export interface OnboardingCategory {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  subtopics: OnboardingSubtopic[];
}

export interface OnboardingCreator {
  id: string;
  name: string | null;
  slug?: string | null;
  subdomain?: string | null;
  logoUrl: string | null;
  heroText: string | null;
  isCertified?: boolean;
  categorySlugs?: string[];
}

export interface OnboardingData {
  categories: OnboardingCategory[];
  suggestedCreators: OnboardingCreator[];
}

export interface CompleteOnboardingInput {
  interests: string[];
  subtopics?: string[];
  onboardingText?: string;
  mutedWords: string[];
  creatorsToFollow: string[];
  gender?: string;
  ageRange?: string;
  pronouns?: string;
}

export const RICH_DEFAULT_TOPICS: OnboardingCategory[] = [
  {
    id: 'tech',
    name: 'Tech & IA',
    slug: 'tech',
    icon: 'Cpu',
    subtopics: [
      {
        id: 'llm',
        name: 'Grands Modèles & IA Locale',
        slug: 'llm',
        tags: ['ia', 'llm', 'open-source'],
      },
      {
        id: 'opensource',
        name: 'Open Source & Souveraineté',
        slug: 'opensource',
        tags: ['linux', 'privacy', 'dev'],
      },
      {
        id: 'cyber',
        name: 'Cybersécurité & Chiffrement',
        slug: 'cyber',
        tags: ['security', 'crypto', 'privacy'],
      },
      {
        id: 'web3',
        name: 'Protocoles Décentralisés',
        slug: 'web3',
        tags: ['p2p', 'fediverse', 'nostr'],
      },
      {
        id: 'hardware',
        name: 'Hardware & Semi-conducteurs',
        slug: 'hardware',
        tags: ['chips', 'robotique'],
      },
    ],
  },
  {
    id: 'economy',
    name: 'Économie & Finance',
    slug: 'economy',
    icon: 'TrendingUp',
    subtopics: [
      {
        id: 'macro',
        name: 'Macroéconomie & Monnaie',
        slug: 'macro',
        tags: ['macro', 'banques', 'inflation'],
      },
      {
        id: 'creatorecon',
        name: 'Creator Economy & Monétisation',
        slug: 'creatorecon',
        tags: ['business', 'media', 'saas'],
      },
      {
        id: 'invest',
        name: 'Investissement Responsable',
        slug: 'invest',
        tags: ['bourse', 'esg', 'capital'],
      },
      {
        id: 'startups',
        name: 'Entrepreneuriat Européen',
        slug: 'startups',
        tags: ['startups', 'tech', 'bootstrapping'],
      },
    ],
  },
  {
    id: 'society',
    name: 'Société & Géopolitique',
    slug: 'society',
    icon: 'Globe2',
    subtopics: [
      {
        id: 'geopol',
        name: 'Géopolitique & Europe',
        slug: 'geopol',
        tags: ['europe', 'diplomatie', 'defense'],
      },
      {
        id: 'democracy',
        name: 'Démocratie & Médias Libres',
        slug: 'democracy',
        tags: ['presse', 'liberte', 'politique'],
      },
      {
        id: 'climate',
        name: 'Climat & Transition Énergétique',
        slug: 'climate',
        tags: ['energie', 'ecologie', 'climat'],
      },
      {
        id: 'urban',
        name: 'Urbanisme & Futur du Travail',
        slug: 'urban',
        tags: ['remote', 'villes', 'sociologie'],
      },
    ],
  },
  {
    id: 'culture',
    name: 'Culture & Création',
    slug: 'culture',
    icon: 'Palette',
    subtopics: [
      {
        id: 'cinema',
        name: 'Cinéma & Narration',
        slug: 'cinema',
        tags: ['cinema', 'critique', 'series'],
      },
      {
        id: 'design',
        name: 'Design Graphique & Typographie',
        slug: 'design',
        tags: ['design', 'ui', 'typographie'],
      },
      {
        id: 'music',
        name: 'Musique & Sound Design',
        slug: 'music',
        tags: ['musique', 'production', 'audio'],
      },
      {
        id: 'literature',
        name: 'Littérature & Essais',
        slug: 'literature',
        tags: ['livres', 'essais', 'poesie'],
      },
    ],
  },
  {
    id: 'mind',
    name: 'Philosophie & Esprit',
    slug: 'mind',
    icon: 'Compass',
    subtopics: [
      {
        id: 'stoic',
        name: 'Stoïcisme & Philosophie Pratique',
        slug: 'stoic',
        tags: ['stoicisme', 'sagesse', 'ethique'],
      },
      {
        id: 'cognition',
        name: 'Attention & Déconnexion',
        slug: 'cognition',
        tags: ['focus', 'digital-detox', 'temps-long'],
      },
      {
        id: 'epistemology',
        name: 'Épistémologie & Esprit Critique',
        slug: 'epistemology',
        tags: ['science', 'verite', 'reflexion'],
      },
      {
        id: 'ethics',
        name: 'Éthique des Technologies',
        slug: 'ethics',
        tags: ['ia-ethique', 'transhumanisme'],
      },
    ],
  },
  {
    id: 'science',
    name: 'Sciences & Espace',
    slug: 'science',
    icon: 'Sparkles',
    subtopics: [
      {
        id: 'space',
        name: 'Astronomie & Espace',
        slug: 'space',
        tags: ['astronomie', 'spatial', 'physique'],
      },
      {
        id: 'bio',
        name: 'Biologie & Longévité',
        slug: 'bio',
        tags: ['sante', 'longevite', 'genetique'],
      },
      {
        id: 'quantum',
        name: 'Physique Quantique',
        slug: 'quantum',
        tags: ['physique', 'informatique-quantique'],
      },
    ],
  },
];

/**
 * Récupère les centres d'intérêt (SystemConfig, modifiable depuis l'admin)
 * et les créateurs certifiés à suggérer lors de l'onboarding.
 */
export async function getOnboardingData(): Promise<OnboardingData> {
  const categories = RICH_DEFAULT_TOPICS;

  // Créateurs certifiés en priorité, sinon n'importe quel créateur (dev).
  const select = {
    id: true,
    name: true,
    slug: true,
    subdomain: true,
    logoUrl: true,
    heroText: true,
    isCertified: true,
  } as const;

  const certified = await prisma.publication.findMany({
    where: {
      type: 'PERSONAL',
      isCertified: true,
      user: { is: { role: 'creator' } },
    },
    select,
    take: 8,
  });

  const suggestedCreators: OnboardingCreator[] =
    certified.length > 0
      ? certified
      : await prisma.publication.findMany({
          where: { type: 'PERSONAL', user: { is: { role: 'creator' } } },
          select,
          take: 8,
        });

  return { categories, suggestedCreators };
}

// ---------------------------------------------------------------------
// Embedding Sémantique Utilisateur (jina-embeddings-v3 MRL 512 dims)
// ---------------------------------------------------------------------

const EMBEDDING_DIM = 512;

function generateFallbackMockEmbedding(text: string, interests: string[] = []): number[] {
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

async function fetchJinaEmbedding(text: string): Promise<number[]> {
  const embeddingUrl = process.env.EMBEDDING_URL || 'http://127.0.0.1:8081/v1/embeddings';
  const data = JSON.stringify({
    model: 'jina-embeddings-v3',
    input: text.slice(0, 4000),
  });

  return new Promise((resolve, reject) => {
    const req = http.request(
      embeddingUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
        timeout: 5000,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(body);
            if (json.data && json.data[0] && json.data[0].embedding) {
              resolve(json.data[0].embedding.slice(0, 512));
            } else {
              reject(new Error(`Invalid response format from embedding server: ${body}`));
            }
          } catch (e) {
            reject(e);
          }
        });
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Embedding request timed out'));
    });
    req.write(data);
    req.end();
  });
}

async function computeAndSaveUserEmbedding(
  userId: string,
  onboardingText: string,
  topics: string[]
): Promise<void> {
  const prompt = `Intérêts: ${topics.join(', ')} | Intention: ${onboardingText || 'Lecture attentive et pensée critique'}`;
  let vector: number[];

  try {
    vector = await fetchJinaEmbedding(prompt);
  } catch (err) {
    console.warn(
      '⚠️ [Onboarding] Inférence Jina indisponible, utilisation du fallback déterministe:',
      err
    );
    vector = generateFallbackMockEmbedding(onboardingText, topics);
  }

  try {
    const vectorStr = `[${vector.join(',')}]`;
    await prisma.$executeRawUnsafe(
      `UPDATE "User" SET "embedding" = $1::vector WHERE id = $2`,
      vectorStr,
      userId
    );
  } catch (dbErr) {
    console.error('❌ [Onboarding] Erreur écriture vecteur pgvector:', dbErr);
  }
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

    // Embedding sémantique (pgvector) pour le feed / recommandations :
    // On combine les macro-thèmes, les sous-thèmes précis et le texte d'intention de lecture.
    const allTopicSignals = [...data.interests, ...(data.subtopics || [])];
    await computeAndSaveUserEmbedding(userId, data.onboardingText || '', allTopicSignals);

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
