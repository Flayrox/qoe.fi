// =====================================================================
// 🛡️ sanitize-inline-svg — SVG inline injecté dans une page authentifiée
// =====================================================================
// Le QR code d'enrôlement TOTP arrive déjà rendu en SVG par le fournisseur, et
// on l'injecte tel quel : un QR légitime n'a besoin que de `<svg>`, de tracés
// et de rectangles. Tout ce qui permet d'exécuter du code ou de charger une
// ressource distante est refusé en bloc (on préfère ne pas afficher le QR que
// l'afficher dangereusement : le secret et le lien `otpauth://` restent
// disponibles en repli).
//
// Module partagé studio/admin : deux copies de cette liste auraient fini par
// diverger, et la plus faible aurait été la porte d'entrée.
// =====================================================================

const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /<\s*script\b/i, reason: 'script' },
  { pattern: /<\s*foreignObject\b/i, reason: 'foreignObject' },
  { pattern: /<\s*(iframe|object|embed|frame|image|use)\b/i, reason: 'ressource externe' },
  { pattern: /<\s*style\b/i, reason: 'feuille de style' },
  { pattern: /\son[a-z]+\s*=/i, reason: 'gestionnaire inline' },
  { pattern: /javascript\s*:/i, reason: 'URL javascript' },
  { pattern: /<\s*!?\s*(ENTITY|DOCTYPE)\b/i, reason: 'déclaration XML' },
  { pattern: /xlink:href\s*=\s*["']?\s*(https?:)?\/\//i, reason: 'référence distante' },
  { pattern: /(href|src)\s*=\s*["']?\s*data:/i, reason: 'URI data' },
];

/**
 * Renvoie le SVG nettoyé, ou `null` s'il contient un contenu actif.
 * Fonction pure : aucun DOM, donc testable en environnement node.
 */
export function sanitizeInlineSvg(svg: string | null | undefined): string | null {
  if (typeof svg !== 'string') return null;
  const trimmed = svg.trim();
  if (trimmed.length === 0) return null;
  // On n'accepte qu'un fragment SVG, jamais une page HTML complète.
  if (!/^<\s*svg\b/i.test(trimmed)) return null;

  for (const { pattern } of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) return null;
  }

  return trimmed;
}

/** Vrai si le fragment peut être injecté sans risque. */
export function isSafeInlineSvg(svg: string | null | undefined): boolean {
  return sanitizeInlineSvg(svg) !== null;
}
