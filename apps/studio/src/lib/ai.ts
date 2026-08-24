// =====================================================================
// 🤖 ai — Stubs pour les embeddings IA
// =====================================================================
// TODO Phase future : implémenter avec @qoe/analytics ou package dédié
//
// Signatures alignées avec apps/console/src/app/(reader)/onboarding/actions.ts :
//   - generateMockEmbedding(text: string, interests: string[]): Promise<number[]>
//   - updateUserEmbedding(userId: string, vector: number[]): Promise<void>
// =====================================================================

const EMBEDDING_DIM = 1024; // jina-embeddings-v3 (auto-hébergé, TEI/llama.cpp)

/**
 * Génère un embedding mock (stub) à partir d'un texte + intérêts.
 * Retourne un vecteur de 1024 dimensions normalisé.
 */
export async function generateMockEmbedding(
  text: string,
  interests: string[] = []
): Promise<number[]> {
  // Stub : vecteur pseudo-aléatoire, mais déterministe par seed (text+interests)
  // pour que la même saisie produise le même vecteur entre 2 sessions.
  const seedSource = `${text}|${interests.sort().join(',')}`;
  let hash = 0;
  for (let i = 0; i < seedSource.length; i++) {
    hash = (hash * 31 + seedSource.charCodeAt(i)) >>> 0;
  }
  const vector = new Array(EMBEDDING_DIM).fill(0).map((_, i) => {
    // PRNG simple déterministe
    const x = Math.sin(hash + i) * 10000;
    return (x - Math.floor(x)) * 2 - 1;
  });
  return vector;
}

/**
 * Persiste l'embedding utilisateur en base (pgvector).
 * Stub no-op pour l'instant — sera implémenté en Phase future.
 */
export async function updateUserEmbedding(userId: string, vector: number[]): Promise<void> {
  // Stub : no-op. Phase future : UPDATE "User" SET embedding = $2::vector WHERE id = $1 (SQL direct ou Go).
  void userId;
  void vector;
  return Promise.resolve();
}
