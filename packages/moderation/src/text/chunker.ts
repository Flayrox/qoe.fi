// =====================================================================
// 📄 Chunker d'Articles Longs — Découpage avec chevauchement (Sliding Window)
// =====================================================================
// Permet de soumettre des articles de plusieurs dizaines de milliers de signes
// à l'IA sans risque de troncature ni d'effet de dilution.
// Les fenêtres se chevauchent de ~200 tokens pour ne manquer aucun contexte limite.
// =====================================================================

export interface TextChunk {
  index: number;
  text: string;
  startChar: number;
  endChar: number;
}

export interface ChunkerOptions {
  /** Taille cible d'un chunk en caractères (~4 000 car. ~= 1 000 tokens). Par défaut 4000. */
  chunkSize?: number;
  /** Taille de chevauchement en caractères (~500 car. ~= 120 tokens). Par défaut 500. */
  overlap?: number;
}

/**
 * ✂️ Découpe un texte long en fenêtres glissantes respectant les limites de paragraphes/phrases.
 */
export function chunkText(text: string, options: ChunkerOptions = {}): TextChunk[] {
  if (!text || typeof text !== 'string') return [];

  const { chunkSize = 4000, overlap = 500 } = options;

  if (text.length <= chunkSize) {
    return [{ index: 0, text, startChar: 0, endChar: text.length }];
  }

  const chunks: TextChunk[] = [];
  let cursor = 0;
  let chunkIndex = 0;

  while (cursor < text.length) {
    const endTarget = Math.min(cursor + chunkSize, text.length);

    // Si on n'est pas à la fin du texte, on cherche un point de coupure naturel (saut de ligne, point)
    let actualEnd = endTarget;
    if (endTarget < text.length) {
      const searchWindow = text.slice(Math.max(cursor, endTarget - 300), endTarget);
      const lastParagraph = searchWindow.lastIndexOf('\n\n');
      const lastNewline = searchWindow.lastIndexOf('\n');
      const lastPeriod = searchWindow.lastIndexOf('. ');

      if (lastParagraph !== -1) {
        actualEnd = Math.max(cursor, endTarget - 300) + lastParagraph + 2;
      } else if (lastPeriod !== -1) {
        actualEnd = Math.max(cursor, endTarget - 300) + lastPeriod + 2;
      } else if (lastNewline !== -1) {
        actualEnd = Math.max(cursor, endTarget - 300) + lastNewline + 1;
      }
    }

    const chunkContent = text.slice(cursor, actualEnd).trim();
    if (chunkContent.length > 0) {
      chunks.push({
        index: chunkIndex++,
        text: chunkContent,
        startChar: cursor,
        endChar: actualEnd,
      });
    }

    if (actualEnd >= text.length) break;

    // Glissement avec overlap
    cursor = Math.max(cursor + 1, actualEnd - overlap);
  }

  return chunks;
}
