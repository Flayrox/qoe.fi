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

/** Taille par défaut d'un chunk (≈ 1 000 tokens). */
export const DEFAULT_CHUNK_SIZE = 4000;
/** Chevauchement par défaut (≈ 120 tokens). */
export const DEFAULT_CHUNK_OVERLAP = 500;
/** En dessous, un chunk n'a plus de sens : on retombe sur la taille par défaut. */
const MIN_CHUNK_SIZE = 20;

/**
 * Normalise les options : une taille non finie ou absurde retombe sur le
 * défaut, et le chevauchement est borné à la moitié du chunk.
 *
 * Sans ces bornes, `chunkSize: 0` rendait **zéro chunk pour un texte non vide**
 * (perte silencieuse du contenu) et `overlap > chunkSize` faisait reculer le
 * curseur d'un seul caractère par itération (2 000 caractères → 1 901 chunks).
 */
function normalizeOptions(options: ChunkerOptions): { chunkSize: number; overlap: number } {
  const rawSize = options.chunkSize;
  const chunkSize =
    typeof rawSize === 'number' && Number.isFinite(rawSize) && rawSize >= MIN_CHUNK_SIZE
      ? Math.floor(rawSize)
      : DEFAULT_CHUNK_SIZE;

  const rawOverlap = options.overlap ?? DEFAULT_CHUNK_OVERLAP;
  const overlap =
    typeof rawOverlap === 'number' && Number.isFinite(rawOverlap) && rawOverlap > 0
      ? Math.min(Math.floor(rawOverlap), Math.floor(chunkSize / 2))
      : 0;

  return { chunkSize, overlap };
}

/**
 * ✂️ Découpe un texte long en fenêtres glissantes respectant les limites de paragraphes/phrases.
 */
export function chunkText(text: string, options: ChunkerOptions = {}): TextChunk[] {
  if (!text || typeof text !== 'string') return [];

  const { chunkSize, overlap } = normalizeOptions(options);

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

    // Une coupure naturelle ne doit jamais ramener la fenêtre avant le curseur.
    actualEnd = Math.max(actualEnd, Math.min(cursor + 1, text.length));

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

    // Glissement avec overlap (borné à la moitié du chunk : progression garantie)
    cursor = Math.max(cursor + 1, actualEnd - overlap);
  }

  return chunks;
}
