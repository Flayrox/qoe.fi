import { prisma } from "@/lib/db"

/**
 * Generates a deterministic, normalized 1536-dimensional vector embedding
 * based on input text and interest categories to calibrating the pgvector algorithm.
 */
export function generateMockEmbedding(text: string, interests: string[]): number[] {
  const vector = new Array(1536).fill(0);
  
  // Seed hash generation
  const combinedInput = `${interests.join("|")}:${text.toLowerCase().trim()}`;
  
  // Simple seedable PRNG (Mulberry32)
  let seed = 0;
  for (let i = 0; i < combinedInput.length; i++) {
    seed = (seed << 5) - seed + combinedInput.charCodeAt(i);
    seed |= 0;
  }
  
  const random = () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Populate vector with deterministic values
  for (let i = 0; i < 1536; i++) {
    vector[i] = random() * 2 - 1; // values between -1 and 1
  }

  // Inject strong signals for selected categories
  const categorySignals: Record<string, number[]> = {
    politique: [0, 10, 20, 30],
    international: [40, 50, 60, 70],
    technologie: [80, 90, 100, 110],
    economie: [120, 130, 140, 150],
    philosophie: [160, 170, 180, 190],
    science: [200, 210, 220, 230],
    design: [240, 250, 260, 270],
  };

  interests.forEach(interest => {
    const slug = interest.toLowerCase().trim();
    // find key that matches slug
    const matchingKey = Object.keys(categorySignals).find(key => slug.includes(key));
    if (matchingKey) {
      const indices = categorySignals[matchingKey];
      indices.forEach(idx => {
        vector[idx] += 2.0; // amplify signal on specific dimensions
      });
    }
  });

  // Normalize the vector (unit length) for cosine similarity
  let magnitude = 0;
  for (let i = 0; i < 1536; i++) {
    magnitude += vector[i] * vector[i];
  }
  magnitude = Math.sqrt(magnitude);

  if (magnitude > 0) {
    for (let i = 0; i < 1536; i++) {
      vector[i] = vector[i] / magnitude;
    }
  }

  return vector;
}

/**
 * Saves a user's sémantic embedding in the database using raw SQL for pgvector compatibility.
 */
export async function updateUserEmbedding(userId: string, embedding: number[]) {
  const vectorString = `[${embedding.join(",")}]`;
  
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "User" SET "embedding" = '${vectorString}'::vector WHERE "id" = '${userId}'::uuid`
    );
    console.log(`Successfully updated pgvector embedding for user: ${userId}`);
    return true;
  } catch (error) {
    console.error("Failed to update pgvector embedding:", error);
    return false;
  }
}
