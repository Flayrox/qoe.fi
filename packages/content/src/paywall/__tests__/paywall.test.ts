import { describe, it, expect } from 'vitest';
import { countWords, calculateReadingTimeMinutes } from '../metrics';
import { createSemanticTeaser } from '../semantic-cut';

describe('paywall & metrics', () => {
  describe('countWords & calculateReadingTimeMinutes', () => {
    it('accurately counts Latin words', () => {
      expect(countWords('')).toBe(0);
      expect(countWords('   ')).toBe(0);
      expect(countWords('Bonjour à tous les lecteurs')).toBe(5);
    });

    it('accurately counts CJK characters and mixed text', () => {
      // 4 CJK characters
      expect(countWords('人工智能')).toBe(4);
      // Mixed: 2 Latin words ('Hello', 'world') + 2 CJK
      expect(countWords('Hello 人工 world')).toBe(4);
    });

    it('estimates reading time in minutes with minimum of 1 min', () => {
      expect(calculateReadingTimeMinutes('')).toBe(0);
      expect(calculateReadingTimeMinutes('Court texte')).toBe(1);

      // 450 words at 200 wpm -> Math.ceil(450 / 200) = 3 min
      const longText = Array.from({ length: 450 }, () => 'mot').join(' ');
      expect(calculateReadingTimeMinutes(longText)).toBe(3);
    });
  });

  describe('createSemanticTeaser', () => {
    it('returns original HTML if word count is below target', () => {
      const shortHtml = '<p>Un court paragraphe.</p>';
      const result = createSemanticTeaser(shortHtml, { targetWords: 50 });

      expect(result.isTruncated).toBe(false);
      expect(result.teaserHtml).toBe(shortHtml);
    });

    it('truncates at sentence boundary and properly closes open HTML tags', () => {
      const longHtml =
        '<p>Première phrase de présentation. <strong>Deuxième phrase très importante.</strong> Troisième phrase qui sera coupée ici.</p><p>Paragraphe suivant non visible.</p>';

      const result = createSemanticTeaser(longHtml, { targetWords: 6 });

      expect(result.isTruncated).toBe(true);
      // Must close tags properly
      expect(
        result.teaserHtml.endsWith('</p>') || result.teaserHtml.endsWith('</strong></p>')
      ).toBe(true);
      // Should not contain the last paragraph
      expect(result.teaserHtml).not.toContain('Paragraphe suivant');
    });

    it('handles nested lists and blockquotes gracefully', () => {
      const structuredHtml =
        '<blockquote><p>Citation d’introduction remarquable sur le monde contemporain.</p></blockquote><p>Analyse détaillée qui suit.</p>';

      const result = createSemanticTeaser(structuredHtml, { targetWords: 4 });

      expect(result.isTruncated).toBe(true);
      // Even if cut, all opened tags are balanced
      const openPs = (result.teaserHtml.match(/<p>/g) || []).length;
      const closePs = (result.teaserHtml.match(/<\/p>/g) || []).length;
      expect(openPs).toBe(closePs);
    });

    it('supports preserveParagraphs: true and handles void tags like img and hr', () => {
      const htmlWithVoidTags =
        '<p>Premier paragraphe avec image <img src="test.jpg" alt="test" /> et séparateur.</p><hr><p>Deuxième paragraphe après le séparateur qui contient plus de texte.</p>';

      const result = createSemanticTeaser(htmlWithVoidTags, {
        targetWords: 5,
        preserveParagraphs: true,
      });

      expect(result.isTruncated).toBe(true);
      expect(result.teaserHtml).toContain('<img src="test.jpg" alt="test" />');
      expect(result.teaserHtml).toContain('</p>');
    });
  });
});
