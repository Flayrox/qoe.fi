// ═══════════════════════════════════════════════════════════════════
// 🎨 @qoe/theme — colors.ts
// Fonctions utilitaires de calcul colorimétrique & contraste (OKLCH / WCAG).
// Zéro dépendance externe, 100% pur TypeScript / mathématiques natives.
// ═══════════════════════════════════════════════════════════════════

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

/**
 * Parse une couleur HEX (formats : #RGB, #RGBA, #RRGGBB, #RRGGBBAA ou sans #).
 * Retourne null si la chaîne n'est pas un code HEX valide.
 */
export function parseHexColor(hex: string): RgbColor | null {
  if (!hex || typeof hex !== 'string') return null;

  const cleanHex = hex.trim().replace(/^#/, '');

  if (cleanHex.length === 3 || cleanHex.length === 4) {
    const r = parseInt(cleanHex[0] + cleanHex[0], 16);
    const g = parseInt(cleanHex[1] + cleanHex[1], 16);
    const b = parseInt(cleanHex[2] + cleanHex[2], 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return { r, g, b };
  }

  if (cleanHex.length === 6 || cleanHex.length === 8) {
    const r = parseInt(cleanHex.slice(0, 2), 16);
    const g = parseInt(cleanHex.slice(2, 4), 16);
    const b = parseInt(cleanHex.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
    return { r, g, b };
  }

  return null;
}

/**
 * Normalise une chaîne HEX au format #rrggbb minuscule standard.
 * Retourne null si invalide.
 */
export function normalizeHexColor(hex: string): string | null {
  const rgb = parseHexColor(hex);
  if (!rgb) return null;

  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`.toLowerCase();
}

/**
 * Calcule la luminance relative standard WCAG 2.1 (de 0.0 pour le noir à 1.0 pour le blanc).
 * Formule standard CIE : L = 0.2126 * Rlin + 0.7152 * Glin + 0.0722 * Blin
 */
export function getRelativeLuminance(rgb: RgbColor): number {
  const toLinear = (val: number): number => {
    const c = val / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };

  const rLin = toLinear(rgb.r);
  const gLin = toLinear(rgb.g);
  const bLin = toLinear(rgb.b);

  return 0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin;
}

/**
 * Indique si une couleur est sombre (luminance relative < 0.45).
 * Permet d'adapter automatiquement le texte et les contrastes.
 */
export function isColorDark(hex: string): boolean {
  const rgb = parseHexColor(hex);
  if (!rgb) return false;
  return getRelativeLuminance(rgb) < 0.45;
}

/**
 * Construit les variables CSS dérivées dynamiquement d'une couleur de fond créateur.
 * Utilise CSS color-mix(in oklab, ...) natif pour garantir un rendu harmonieux
 * et perceptuellement uniforme des cartes, bordures et surfaces.
 */
export function buildBackgroundVariables(rawHex: string): Record<string, string> {
  const normalizedHex = normalizeHexColor(rawHex);
  if (!normalizedHex) return {};

  const dark = isColorDark(normalizedHex);

  if (dark) {
    return {
      '--background': normalizedHex,
      '--tenant-bg': normalizedHex,
      '--foreground': '#fafafa',
      '--muted-foreground': '#a1a1aa',
      '--card': `color-mix(in oklab, ${normalizedHex} 88%, white 12%)`,
      '--card-foreground': '#fafafa',
      '--popover': `color-mix(in oklab, ${normalizedHex} 90%, white 10%)`,
      '--popover-foreground': '#fafafa',
      '--muted': `color-mix(in oklab, ${normalizedHex} 85%, white 15%)`,
      '--border': `color-mix(in oklab, ${normalizedHex} 82%, white 18%)`,
      '--input': `color-mix(in oklab, ${normalizedHex} 80%, white 20%)`,
      '--ring': '#fafafa',
      'color-scheme': 'dark',
    };
  }

  return {
    '--background': normalizedHex,
    '--tenant-bg': normalizedHex,
    '--foreground': '#09090b',
    '--muted-foreground': '#71717a',
    '--card': `color-mix(in oklab, ${normalizedHex} 92%, white 8%)`,
    '--card-foreground': '#09090b',
    '--popover': `color-mix(in oklab, ${normalizedHex} 96%, white 4%)`,
    '--popover-foreground': '#09090b',
    '--muted': `color-mix(in oklab, ${normalizedHex} 90%, black 10%)`,
    '--border': `color-mix(in oklab, ${normalizedHex} 86%, black 14%)`,
    '--input': `color-mix(in oklab, ${normalizedHex} 84%, black 16%)`,
    '--ring': '#09090b',
    'color-scheme': 'light',
  };
}
