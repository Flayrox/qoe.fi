// =====================================================================
// 🔦 Deep-link citation → article (tranche 6-b) — SOURCE UNIQUE web + mobile
// =====================================================================
// La carte de citation ouvre l'article sur le passage cité via les query
// params hlStart / hlEnd / hlSha (offsets en code points dans le texte
// canonique + empreinte du contenu). Ce parseur est PUR (testable sans
// navigateur) : toute entrée invalide → null, jamais de crash. Partagé
// par le web (page /article/[slug]) et le mobile (route /article/[slug]).
// Déplacé depuis apps/core/src/lib/spotlight.ts en tranche 6-d.

export interface SpotlightRange {
  start: number;
  end: number;
  sha: string;
}

/** Taille maximale d'un sha d'empreinte (sha256 hex = 64 ; marge large). */
const MAX_SHA_LENGTH = 128;
/** Longueur maximale de passage tolérée (borne de sécurité anti-abus). */
const MAX_SPAN = 50_000;

/**
 * Valide et convertit les searchParams bruts en SpotlightRange.
 * Contraintes :
 *  - start/end : entiers ≥ 0, end > start, écart borné ;
 *  - sha : chaîne hex [0-9a-fA-F] de 8 à MAX_SHA_LENGTH caractères.
 * N'importe quelle déviation → null (le lecteur s'ouvre normalement).
 */
export function parseSpotlightParams(
  params: Record<string, string | string[] | undefined>
): SpotlightRange | null {
  const startRaw = params.hlStart;
  const endRaw = params.hlEnd;
  const shaRaw = params.hlSha;
  if (typeof startRaw !== 'string' || typeof endRaw !== 'string' || typeof shaRaw !== 'string') {
    return null;
  }
  if (!/^[0-9]+$/.test(startRaw) || !/^[0-9]+$/.test(endRaw)) return null;
  if (!new RegExp(`^[0-9a-fA-F]{8,${MAX_SHA_LENGTH}}$`).test(shaRaw)) return null;

  const start = Number(startRaw);
  const end = Number(endRaw);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null;
  // Rejette tout arrondi silencieux (ex. 9007199254740993 → …992).
  if (String(start) !== startRaw || String(end) !== endRaw) return null;
  if (start < 0 || end <= start) return null;
  if (end - start > MAX_SPAN) return null;

  return { start, end, sha: shaRaw };
}
