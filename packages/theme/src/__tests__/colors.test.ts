import { describe, it, expect } from 'vitest';
import {
  parseHexColor,
  normalizeHexColor,
  getRelativeLuminance,
  isColorDark,
  buildBackgroundVariables,
} from '../colors';
import { buildCreatorVars } from '../ThemeStyle';

describe('@qoe/theme colors', () => {
  describe('parseHexColor', () => {
    it('parses 3-char, 6-char hex codes with and without #', () => {
      expect(parseHexColor('#fff')).toEqual({ r: 255, g: 255, b: 255 });
      expect(parseHexColor('000')).toEqual({ r: 0, g: 0, b: 0 });
      expect(parseHexColor('#E0F2FE')).toEqual({ r: 224, g: 242, b: 254 });
      expect(parseHexColor('#0f1117')).toEqual({ r: 15, g: 17, b: 23 });
    });

    it('returns null for invalid inputs', () => {
      expect(parseHexColor('')).toBeNull();
      expect(parseHexColor('invalid')).toBeNull();
      expect(parseHexColor('#xyz')).toBeNull();
    });
  });

  describe('normalizeHexColor', () => {
    it('normalizes to standard lowercase 6-char hex with #', () => {
      expect(normalizeHexColor('#FFF')).toBe('#ffffff');
      expect(normalizeHexColor('e0f2fe')).toBe('#e0f2fe');
      expect(normalizeHexColor('#0F1117')).toBe('#0f1117');
    });
  });

  describe('luminance and contrast detection', () => {
    it('calculates standard relative luminance', () => {
      expect(getRelativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1.0);
      expect(getRelativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0.0);
    });

    it('accurately identifies light backgrounds (requiring dark text)', () => {
      // Pure white
      expect(isColorDark('#ffffff')).toBe(false);
      // Warm ivory/beige
      expect(isColorDark('#FAF8F5')).toBe(false);
      // Sky blue
      expect(isColorDark('#E0F2FE')).toBe(false);
      // Soft sage
      expect(isColorDark('#E8F5E9')).toBe(false);
    });

    it('accurately identifies dark backgrounds (requiring light text)', () => {
      // Deep night
      expect(isColorDark('#0F1117')).toBe(true);
      // Pure black
      expect(isColorDark('#000000')).toBe(true);
      // Navy
      expect(isColorDark('#0B192C')).toBe(true);
      // Dark slate
      expect(isColorDark('#1E293B')).toBe(true);
    });
  });

  describe('buildBackgroundVariables', () => {
    it('builds coherent CSS variables for a light background', () => {
      const vars = buildBackgroundVariables('#FAF8F5');
      expect(vars['--background']).toBe('#faf8f5');
      expect(vars['--foreground']).toBe('#09090b');
      expect(vars['--muted-foreground']).toBe('#71717a');
      expect(vars['--card']).toContain('color-mix(in oklab');
      expect(vars['color-scheme']).toBe('light');
    });

    it('builds coherent CSS variables for a dark background', () => {
      const vars = buildBackgroundVariables('#0F1117');
      expect(vars['--background']).toBe('#0f1117');
      expect(vars['--foreground']).toBe('#fafafa');
      expect(vars['--muted-foreground']).toBe('#a1a1aa');
      expect(vars['--card']).toContain('color-mix(in oklab');
      expect(vars['color-scheme']).toBe('dark');
    });

    it('returns empty object on invalid hex', () => {
      expect(buildBackgroundVariables('not-a-color')).toEqual({});
    });
  });

  describe('buildCreatorVars with backgroundColor', () => {
    it('integrates backgroundColor, accentColor, and fontFamily seamlessly', () => {
      const vars = buildCreatorVars({
        backgroundColor: '#E0F2FE',
        accentColor: '#0284C7',
        fontFamily: 'serif',
      });

      expect(vars['--background']).toBe('#e0f2fe');
      expect(vars['--foreground']).toBe('#09090b');
      expect(vars['--primary']).toBe('#0284C7');
      expect(vars['--font-active']).toBe('var(--font-serif)');
    });
  });
});
