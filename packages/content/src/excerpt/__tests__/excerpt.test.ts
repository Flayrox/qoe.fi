import { describe, it, expect } from 'vitest';
import { decodeHtmlEntities } from '../html-entities';
import { cleanArticleExcerpt } from '../clean-excerpt';

describe('excerpt & html-entities', () => {
  describe('decodeHtmlEntities', () => {
    it('decodes named entities', () => {
      expect(decodeHtmlEntities('Qoe &amp; co &lt;3')).toBe('Qoe & co <3');
      expect(decodeHtmlEntities('&ldquo;Citation&rdquo; &mdash; 2026')).toBe('“Citation” — 2026');
      expect(decodeHtmlEntities('&laquo;Bonjour&raquo;')).toBe('«Bonjour»');
    });

    it('decodes numerical decimal and hex entities', () => {
      // Decimal 128640 = 🚀
      expect(decodeHtmlEntities('Ready &#128640;')).toBe('Ready 🚀');
      // Hex 1F9E0 = 🧠
      expect(decodeHtmlEntities('Smart &#x1F9E0;')).toBe('Smart 🧠');
    });

    it('handles empty or unchanged strings and unknown entities', () => {
      expect(decodeHtmlEntities('')).toBe('');
      expect(decodeHtmlEntities('No entities here')).toBe('No entities here');
      expect(decodeHtmlEntities('&unknownentity;')).toBe('&unknownentity;');
      expect(decodeHtmlEntities('&#xZZZZ;')).toBe('&#xZZZZ;');
      expect(decodeHtmlEntities('&#99999999999999999999999999;')).toBe(
        '&#99999999999999999999999999;'
      );
    });
  });

  describe('cleanArticleExcerpt', () => {
    it('strips HTML tags and normalizes whitespace', () => {
      const raw =
        '<p>Premier paragraphe avec <strong>du gras</strong>.</p><br><div>Deuxième ligne.</div>';
      expect(cleanArticleExcerpt(raw, 100)).toBe(
        'Premier paragraphe avec du gras. Deuxième ligne.'
      );
    });

    it('truncates at clean word boundary with ellipsis', () => {
      const text =
        'Voici un extrait d’article assez long qui démontre la capacité du moteur à couper proprement.';
      const result = cleanArticleExcerpt(text, 35);

      expect(result.endsWith('…')).toBe(true);
      expect(result.length).toBeLessThanOrEqual(36);
    });

    it('truncates hard if no space exists in the last 30% of the excerpt', () => {
      const longWord = 'A'.repeat(50);
      const result = cleanArticleExcerpt(longWord, 30);
      expect(result).toBe(`${'A'.repeat(30)}…`);
    });

    it('handles null, undefined or empty strings', () => {
      expect(cleanArticleExcerpt(null)).toBe('');
      expect(cleanArticleExcerpt(undefined)).toBe('');
      expect(cleanArticleExcerpt('')).toBe('');
    });
  });
});
