// =====================================================================
// 🎨 Contraste WCAG 2.1 — ::selection et --article-selection-ink
// =====================================================================
// 📖 Règle produit : la sélection dans un article (.article-prose) applique :
//    background-color: color-mix(in oklch, var(--article-accent) 38%, transparent);
//    color: var(--article-selection-ink, var(--foreground));
//
// 🎯 Ce test valide mathématiquement que pour CHAQUE thème (Light, Dark,
//    et les 5 thèmes papier sépia, paper, slate, oled, warm), le ratio de
//    contraste de l'encre sur le fond de sélection composite respecte le
//    standard WCAG AA (ratio >= 4.5:1).
// =====================================================================

import { describe, expect, it } from 'vitest';
import { getContrastRatio, parseHexColor } from '@qoe/theme';

/**
 * Calcule la couleur sRGB résultant de la composition alpha d'une couleur d'accent
 * semi-transparente (38%) sur une couleur de fond opaque.
 */
function compositeColor(accentHex: string, bgHex: string, alpha: number = 0.38): string {
  const fg = parseHexColor(accentHex);
  const bg = parseHexColor(bgHex);
  if (!fg || !bg) throw new Error(`Invalid color: ${accentHex} or ${bgHex}`);

  const r = Math.round(alpha * fg.r + (1 - alpha) * bg.r);
  const g = Math.round(alpha * fg.g + (1 - alpha) * bg.g);
  const b = Math.round(alpha * fg.b + (1 - alpha) * bg.b);

  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

interface ThemeSelectionSpec {
  name: string;
  bg: string;
  ink: string;
  accent?: string;
}

// Accent vermillon par défaut (--vermillion-500)
const DEFAULT_ACCENT = '#EE4B2B';

const THEME_SPECS: ThemeSelectionSpec[] = [
  {
    name: 'Light (White)',
    bg: '#FFFFFF',
    ink: '#09090B', // --foreground / zinc-950
  },
  {
    name: 'Light (Apple Soft Gray #f5f5f7)',
    bg: '#F5F5F7',
    ink: '#09090B',
  },
  {
    name: 'Dark',
    bg: '#0A0A0C', // --background dark
    ink: '#FAFAFA', // --foreground dark
  },
  {
    name: 'Sepia',
    bg: '#FBF0D9',
    ink: '#3D2E1E', // --article-selection-ink
  },
  {
    name: 'Paper (crème chaud)',
    bg: '#F7F3EA',
    ink: '#2A2620', // --article-selection-ink
  },
  {
    name: 'Slate',
    bg: '#1E2024',
    ink: '#E2E4E8', // --article-selection-ink
  },
  {
    name: 'OLED (noir absolu)',
    bg: '#000000',
    ink: '#FFFFFF', // --article-selection-ink
  },
  {
    name: 'Warm (nuit chaude)',
    bg: '#1A1410',
    ink: '#E8DCC8', // --article-selection-ink
  },
];

describe('WCAG 2.1 — contraste de sélection (::selection / --article-selection-ink)', () => {
  THEME_SPECS.forEach(({ name, bg, ink, accent = DEFAULT_ACCENT }) => {
    it(`garantit un contraste WCAG AA >= 4.5:1 pour le thème ${name}`, () => {
      const compositedBg = compositeColor(accent, bg, 0.38);
      const ratio = getContrastRatio(ink, compositedBg);

      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('valide que tous les thèmes papier sont couverts', () => {
    const coveredPaperThemes = THEME_SPECS.map((s) => s.name.toLowerCase());
    expect(coveredPaperThemes.some((t) => t.includes('sepia'))).toBe(true);
    expect(coveredPaperThemes.some((t) => t.includes('paper'))).toBe(true);
    expect(coveredPaperThemes.some((t) => t.includes('slate'))).toBe(true);
    expect(coveredPaperThemes.some((t) => t.includes('oled'))).toBe(true);
    expect(coveredPaperThemes.some((t) => t.includes('warm'))).toBe(true);
  });
});
