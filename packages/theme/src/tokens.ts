// ═══════════════════════════════════════════════════════════════════
// 🔧 @qoe/theme — tokens.ts
// Helpers runtime pour lire les tokens CSS résolus (utile pour charts/canvas).
// ═══════════════════════════════════════════════════════════════════

/**
 * Lit la valeur résolue d'un token sémantique au runtime.
 * @param name Nom complet du token (ex: "--primary", "--background").
 * @returns La valeur calculée (ex: "#09090b" en light, "#fafafa" en dark), ou "" si indispo.
 *
 * @example
 * token("--primary");            // → "#09090b"
 * token("--chart-1");            // → "oklch(0.62 0.14 25)"
 *
 * SSR-safe : retourne "" côté serveur (pas de document).
 */
export function token(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Lit plusieurs tokens d'un coup. Pratique pour alimenter un palette de charts.
 * @example
 * const palette = tokens(["--chart-1", "--chart-2", "--chart-3"]);
 */
export function tokens(names: string[]): Record<string, string> {
  if (typeof window === 'undefined') {
    return Object.fromEntries(names.map((n) => [n, '']));
  }
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  return Object.fromEntries(names.map((n) => [n, cs.getPropertyValue(n).trim()]));
}
