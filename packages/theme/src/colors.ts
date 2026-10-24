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
 * Indique si une couleur est sombre selon le standard WCAG 2.1.
 * Le point d'équilibre exact où le texte noir (#000000) offre un meilleur contraste
 * que le texte blanc (#ffffff) est L ≈ 0.179 :
 * (1 + 0.05)/(L + 0.05) = (L + 0.05)/(0 + 0.05) => L = sqrt(1.05 * 0.05) - 0.05 ≈ 0.1791
 */
export function isColorDark(hex: string): boolean {
  const rgb = parseHexColor(hex);
  if (!rgb) return false;
  return getRelativeLuminance(rgb) <= 0.1791;
}

/**
 * Calcule le ratio de contraste standard WCAG 2.1 entre deux couleurs HEX (entre 1.0 et 21.0).
 */
export function getContrastRatio(hex1: string, hex2: string): number {
  const rgb1 = parseHexColor(hex1);
  const rgb2 = parseHexColor(hex2);
  if (!rgb1 || !rgb2) return 1;
  const l1 = getRelativeLuminance(rgb1);
  const l2 = getRelativeLuminance(rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Construit les variables CSS dérivées dynamiquement d'une couleur de fond créateur.
 * Utilise CSS color-mix(in oklab, ...) natif pour garantir un rendu harmonieux,
 * perceptuellement uniforme et doté d'une hiérarchie d'élévation nette (surfaces/cartes/bordures).
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
      // En fond sombre, les cartes sont surélevées par un mix lumineux discret
      '--card': `color-mix(in oklab, ${normalizedHex} 82%, white 18%)`,
      '--card-foreground': '#fafafa',
      '--popover': `color-mix(in oklab, ${normalizedHex} 86%, white 14%)`,
      '--popover-foreground': '#fafafa',
      '--muted': `color-mix(in oklab, ${normalizedHex} 76%, white 24%)`,
      '--border': `color-mix(in oklab, ${normalizedHex} 68%, white 32%)`,
      '--input': `color-mix(in oklab, ${normalizedHex} 82%, white 18%)`,
      '--ring': '#fafafa',
      colorScheme: 'dark',
    };
  }

  // En fond clair ou moyennement saturé (beige, ciel, lime, pêche, pastel) :
  // Le texte DOIT être encre sombre (#09090b) pour respecter WCAG AAA (> 7:1).
  // Les cartes deviennent des surfaces de papier nettes et surélevées (88% blanc + 12% teinte),
  // éliminant la sensation "bouillie monochrome" et rendant les articles ultra lisibles.
  return {
    '--background': normalizedHex,
    '--tenant-bg': normalizedHex,
    '--foreground': '#09090b',
    '--muted-foreground': '#3f3f46',
    '--card': `color-mix(in oklab, white 88%, ${normalizedHex} 12%)`,
    '--card-foreground': '#09090b',
    '--popover': `color-mix(in oklab, white 94%, ${normalizedHex} 6%)`,
    '--popover-foreground': '#09090b',
    '--muted': `color-mix(in oklab, white 72%, ${normalizedHex} 28%)`,
    '--border': `color-mix(in oklab, ${normalizedHex} 68%, black 32%)`,
    '--input': `color-mix(in oklab, white 94%, ${normalizedHex} 6%)`,
    '--ring': '#09090b',
    colorScheme: 'light',
  };
}
