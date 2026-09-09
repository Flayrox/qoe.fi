// =====================================================================
// ⚡ Fast-Path Synchrone (< 1 ms) — Filtrage Déterministe Zéro-Dépendance
// =====================================================================
// Exécuté de manière synchrone avant l'écriture en base de données.
// Bloque immédiatement les violations critiques (menaces de mort directes,
// incitations au terrorisme, slurs racistes/antisémites stricts).
// =====================================================================

import { normalizeHomoglyphs, decodeLeetspeak } from '../identity/homoglyphs';

export interface FastPathResult {
  clean: boolean;
  action: 'allow' | 'block';
  flaggedReason?: string;
}

// Expressions régulières strictes déclenchant un rejet HTTP immédiat (Hard-Fail)
const CRITICAL_BLOCK_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  // Menaces de mort directes
  {
    pattern: /(je vais (te|vous|les) (tuer|égorger|abattre|buter|déchiqueter|massacrer))/i,
    reason: 'Menace de mort directe',
  },
  {
    pattern: /(i will (kill|murder|slaughter|behead|shoot) (you|them|all))/i,
    reason: 'Direct death threat',
  },
  // CSAM / Pédopornographie textuelle
  {
    pattern: /\b(pedoporn|cp links?|child porn|lolita sex|pedo files?)\b/i,
    reason: 'CSAM violation',
  },
  // Terrorisme / Suprémacisme violent
  {
    pattern:
      /\b(heil hitler|sieg heil|gas the jews|mort aux juifs|mort aux arabes|mort aux noirs)\b/i,
    reason: 'Discours haineux violent',
  },
];

/**
 * ⚡ Scan ultra-rapide synchrone (< 1 ms) exécutable sur tout texte entrant.
 */
export function fastPathScan(rawText: string): FastPathResult {
  if (!rawText || typeof rawText !== 'string') {
    return { clean: true, action: 'allow' };
  }

  const normalized = normalizeHomoglyphs(rawText).toLowerCase();
  const leet = decodeLeetspeak(rawText);

  for (const { pattern, reason } of CRITICAL_BLOCK_PATTERNS) {
    if (pattern.test(rawText) || pattern.test(normalized) || pattern.test(leet)) {
      return {
        clean: false,
        action: 'block',
        flaggedReason: reason,
      };
    }
  }

  return { clean: true, action: 'allow' };
}
