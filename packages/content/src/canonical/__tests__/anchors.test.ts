import { describe, it, expect } from 'vitest';
import { computeLocalAnchors, makeLocalId, normalizeCanonical } from '../anchors';

describe('canonical/anchors', () => {
  const doc = {
    text: 'Ceci est un premier paragraphe de test avec un mot répété mot.\n\nDeuxième paragraphe avec un emoji 🚀 et encore le mot.',
  };

  describe('makeLocalId', () => {
    it('generates an id starting with local- and with reasonable length', () => {
      const id1 = makeLocalId();
      const id2 = makeLocalId();
      expect(id1.startsWith('local-')).toBe(true);
      expect(id2.startsWith('local-')).toBe(true);
      expect(id1).not.toBe(id2);
    });
  });

  describe('normalizeCanonical', () => {
    it('trims leading and trailing spaces and condenses whitespace runs', () => {
      expect(normalizeCanonical('   hello    world  \n\t  ')).toBe('hello world');
      expect(normalizeCanonical('')).toBe('');
      expect(normalizeCanonical('   ')).toBe('');
    });
  });

  describe('computeLocalAnchors', () => {
    it('returns null for empty target or not found target', () => {
      expect(computeLocalAnchors(doc, '')).toBeNull();
      expect(computeLocalAnchors(doc, 'inexistant-dans-le-texte')).toBeNull();
    });

    it('finds the first occurrence (quoteOrdinal 0)', () => {
      const target = 'mot';
      const anchors = computeLocalAnchors(doc, target, 0);
      expect(anchors).not.toBeNull();
      // First occurrence of "mot"
      const cpText = Array.from(doc.text);
      expect(cpText.slice(anchors!.start, anchors!.end).join('')).toBe('mot');
      expect(anchors?.start).toBe(47);
      expect(anchors?.end).toBe(50);
    });

    it('finds subsequent non-overlapping occurrences (quoteOrdinal 1, 2)', () => {
      const target = 'mot';
      const anchors1 = computeLocalAnchors(doc, target, 1);
      expect(anchors1).not.toBeNull();
      const cpText = Array.from(doc.text);
      expect(cpText.slice(anchors1!.start, anchors1!.end).join('')).toBe('mot');
      expect(anchors1?.start).toBe(58);
      expect(anchors1?.end).toBe(61);

      const anchors2 = computeLocalAnchors(doc, target, 2);
      expect(anchors2).not.toBeNull();
      expect(cpText.slice(anchors2!.start, anchors2!.end).join('')).toBe('mot');
      // After emoji 🚀
      expect(anchors2?.start).toBe(113);
      expect(anchors2?.end).toBe(116);
    });

    it('falls back to the first occurrence if quoteOrdinal exceeds count', () => {
      const target = 'mot';
      const fallback = computeLocalAnchors(doc, target, 999);
      expect(fallback).not.toBeNull();
      expect(fallback?.start).toBe(47);
    });

    it('normalizes target with multiple spaces and matches exact content', () => {
      const target = 'premier   paragraphe \n de test';
      const anchors = computeLocalAnchors(doc, target);
      expect(anchors).not.toBeNull();
      const cpText = Array.from(doc.text);
      expect(cpText.slice(anchors!.start, anchors!.end).join('')).toBe(
        'premier paragraphe de test'
      );
    });
  });
});
