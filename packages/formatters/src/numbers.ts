// =====================================================================
// 🔢 numbers.ts — Formatage compact des nombres (port Bluesky & analytics)
// =====================================================================

export interface FormatCountOptions {
  locale?: 'fr' | 'en';
  /** Séparateur entre le chiffre et le symbole d'unité (défaut: espace insécable ou espace) */
  space?: boolean;
}

/**
 * Notation compacte localisée (1.2k, 3.4M, 1.5Md…) — tronquée, pas arrondie.
 * Supporte le français ('k', 'M', 'Md') et l'anglais ('k', 'M', 'B').
 */
export function formatCount(num: number, options: FormatCountOptions = {}): string {
  if (typeof num !== 'number' || Number.isNaN(num)) {
    return '0';
  }

  const isNegative = num < 0;
  const abs = Math.abs(num);

  if (abs < 1000) {
    return String(num);
  }

  const { locale = 'fr', space = true } = options;
  const sep = space ? ' ' : '';

  const units =
    locale === 'fr'
      ? [
          { value: 1e9, symbol: 'Md' },
          { value: 1e6, symbol: 'M' },
          { value: 1e3, symbol: 'k' },
        ]
      : [
          { value: 1e9, symbol: 'B' },
          { value: 1e6, symbol: 'M' },
          { value: 1e3, symbol: 'k' },
        ];

  for (const unit of units) {
    if (abs >= unit.value) {
      const truncated = Math.trunc((abs / unit.value) * 10) / 10;
      // Supprime le « .0 » superflu : 1.0k → 1k
      const str = truncated.toFixed(1).replace(/\.0$/, '');
      const prefix = isNegative ? '-' : '';
      return `${prefix}${str}${sep}${unit.symbol}`;
    }
  }

  return String(num);
}

/**
 * Calcule et arrondit un pourcentage de manière sécurisée (évite division par zéro).
 */
export function formatPercentage(
  value: number,
  total: number,
  options: { decimals?: number } = {}
): number {
  if (
    typeof value !== 'number' ||
    typeof total !== 'number' ||
    Number.isNaN(value) ||
    Number.isNaN(total) ||
    total <= 0
  ) {
    return 0;
  }

  const { decimals = 0 } = options;
  const ratio = (value / total) * 100;
  const factor = 10 ** decimals;
  return Math.round(ratio * factor) / factor;
}
