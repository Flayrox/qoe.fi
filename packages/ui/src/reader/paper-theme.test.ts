import { describe, it, expect } from 'vitest';
import { PREMIUM_PAPER_THEMES, isPremiumPaperTheme } from './types';
import { getPaperThemeClasses } from './ReadingPreferencesContext';

// Papiers (fiche Plus P1) : gratuits vs premium verrouillés, classes
// non vides pour chaque option (jamais de thème qui rend du vide).

describe('paper themes', () => {
  it('gratuits : default, sepia, slate, oled', () => {
    for (const t of ['default', 'sepia', 'slate', 'oled'] as const) {
      expect(isPremiumPaperTheme(t)).toBe(false);
    }
  });

  it('premium : warm, paper (et rien d’autre)', () => {
    expect([...PREMIUM_PAPER_THEMES].sort()).toEqual(['paper', 'warm']);
    for (const t of PREMIUM_PAPER_THEMES) {
      expect(isPremiumPaperTheme(t)).toBe(true);
    }
  });

  it('chaque option rend des classes non vides', () => {
    const all = ['default', 'sepia', 'slate', 'oled', ...PREMIUM_PAPER_THEMES] as const;
    for (const t of all) {
      const classes = getPaperThemeClasses(t);
      expect(classes.length).toBeGreaterThan(10);
    }
  });

  it('premium visuellement distincts des gratuits', () => {
    const free = new Set(
      (['default', 'sepia', 'slate', 'oled'] as const).map((t) => getPaperThemeClasses(t))
    );
    for (const t of PREMIUM_PAPER_THEMES) {
      expect(free.has(getPaperThemeClasses(t))).toBe(false);
    }
  });
});
