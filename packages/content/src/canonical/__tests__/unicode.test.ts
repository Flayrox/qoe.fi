import { describe, it, expect } from 'vitest';
import { cpToUtf16, cpLength, utf16ToCp, cpSubstring } from '../unicode';

describe('canonical/unicode', () => {
  const plainText = 'Bonjour le monde';
  // 🧠 (U+1F9E0) = 2 code units UTF-16, 🚀 (U+1F680) = 2 code units UTF-16
  const emojiText = 'Hello 🧠 world 🚀!';

  describe('cpLength', () => {
    it('returns exact character length for ASCII text', () => {
      expect(cpLength(plainText)).toBe(16);
      expect(plainText.length).toBe(16);
    });

    it('counts emojis as 1 code point, whereas string.length is 2', () => {
      expect(cpLength('🧠')).toBe(1);
      expect('🧠'.length).toBe(2);

      expect(cpLength('🚀')).toBe(1);
      expect('🚀'.length).toBe(2);

      // 'Hello ' (6) + '🧠' (1) + ' world ' (7) + '🚀' (1) + '!' (1) = 16 code points
      // UTF-16 length is 18
      expect(cpLength(emojiText)).toBe(16);
      expect(emojiText.length).toBe(18);
    });

    it('returns 0 for empty string', () => {
      expect(cpLength('')).toBe(0);
    });
  });

  describe('cpToUtf16', () => {
    it('returns 0 for negative or zero cp', () => {
      expect(cpToUtf16(emojiText, 0)).toBe(0);
      expect(cpToUtf16(emojiText, -5)).toBe(0);
    });

    it('translates code point offsets across surrogate pairs', () => {
      // 'Hello ' ends at cp 6 / u16 6
      expect(cpToUtf16(emojiText, 6)).toBe(6);

      // After '🧠' (cp 7), UTF-16 index is 6 + 2 = 8
      expect(cpToUtf16(emojiText, 7)).toBe(8);

      // End of string (cp 16) corresponds to UTF-16 length 18
      expect(cpToUtf16(emojiText, 16)).toBe(18);
      expect(cpToUtf16(emojiText, 999)).toBe(18);
    });
  });

  describe('utf16ToCp', () => {
    it('returns 0 for zero or negative u', () => {
      expect(utf16ToCp(emojiText, 0)).toBe(0);
      expect(utf16ToCp(emojiText, -10)).toBe(0);
    });

    it('converts UTF-16 offsets back to code points', () => {
      expect(utf16ToCp(emojiText, 6)).toBe(6);
      // Index 7 is inside the low surrogate of 🧠 -> snaps to cp 6
      expect(utf16ToCp(emojiText, 7)).toBe(6);
      // Index 8 is right after 🧠 -> cp 7
      expect(utf16ToCp(emojiText, 8)).toBe(7);
      // Index 18 is end -> cp 16
      expect(utf16ToCp(emojiText, 18)).toBe(16);
    });
  });

  describe('cpSubstring', () => {
    it('slices text based on code point boundaries without corrupting surrogates', () => {
      // Slicing '🧠' at cp [6, 7)
      expect(cpSubstring(emojiText, 6, 7)).toBe('🧠');
      // Slicing from 'world' to '🚀' at cp [8, 15)
      expect(cpSubstring(emojiText, 8, 15)).toBe('world 🚀');
      // Slicing with no end specified goes to end
      expect(cpSubstring(emojiText, 14)).toBe('🚀!');
    });
  });
});
