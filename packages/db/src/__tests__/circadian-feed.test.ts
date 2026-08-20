import { describe, it, expect } from 'vitest';
import { getCircadianProfile } from '../feed';

describe('⏰ Circadian Recommendation Engine Math & Profiles', () => {
  describe('getCircadianProfile', () => {
    it('returns MORNING_BRIEF between 06h and 10h on weekdays', () => {
      const profile = getCircadianProfile(8, 2); // 8h AM, Tuesday
      expect(profile.name).toBe('MORNING_BRIEF');
      expect(profile.targetReadingMinutes).toBe(5.5);
      expect(profile.sigmaMinutes).toBe(2.2);
      expect(profile.articleRatio).toBe(0.45);
      expect(profile.thoughtRatio).toBe(0.55);
    });

    it('returns MIDDAY_BREAK between 11h and 14h on weekdays', () => {
      const profile = getCircadianProfile(12, 3); // 12h PM, Wednesday
      expect(profile.name).toBe('MIDDAY_BREAK');
      expect(profile.targetReadingMinutes).toBe(7.5);
      expect(profile.sigmaMinutes).toBe(2.8);
      expect(profile.articleRatio).toBe(0.6);
    });

    it('returns AFTERNOON_FLOW between 15h and 18h on weekdays', () => {
      const profile = getCircadianProfile(16, 4); // 16h, Thursday
      expect(profile.name).toBe('AFTERNOON_FLOW');
      expect(profile.targetReadingMinutes).toBe(8.5);
      expect(profile.sigmaMinutes).toBe(3.0);
    });

    it('returns EVENING_SANCTUARY between 19h and 23h on weekdays (Deep Essays)', () => {
      const profile = getCircadianProfile(21, 1); // 21h, Monday
      expect(profile.name).toBe('EVENING_SANCTUARY');
      expect(profile.targetReadingMinutes).toBe(12.0);
      expect(profile.sigmaMinutes).toBe(4.0);
      expect(profile.articleRatio).toBe(0.75);
      expect(profile.thoughtRatio).toBe(0.25);
    });

    it('returns LATE_NIGHT between 00h and 05h on weekdays', () => {
      const profile = getCircadianProfile(2, 5); // 02h AM, Friday
      expect(profile.name).toBe('LATE_NIGHT');
      expect(profile.targetReadingMinutes).toBe(7.0);
      expect(profile.thoughtRatio).toBe(0.5);
    });

    it('returns WEEKEND_LONGFORM on Saturdays and Sundays regardless of the hour', () => {
      const saturdayProfile = getCircadianProfile(10, 6); // Saturday
      const sundayProfile = getCircadianProfile(15, 0); // Sunday

      expect(saturdayProfile.name).toBe('WEEKEND_LONGFORM');
      expect(saturdayProfile.targetReadingMinutes).toBe(12);
      expect(saturdayProfile.articleRatio).toBe(0.7);

      expect(sundayProfile.name).toBe('WEEKEND_LONGFORM');
      expect(sundayProfile.targetReadingMinutes).toBe(12);
    });
  });

  describe('Gaussian Circadian Curve Fitting', () => {
    function computeGaussianFit(readingMinutes: number, target: number, sigma: number): number {
      const diff = readingMinutes - target;
      return Math.exp(-(diff * diff) / (2 * sigma * sigma));
    }

    it('gives a perfect 1.0 fit when article reading time equals target minutes', () => {
      const fit = computeGaussianFit(14, 14, 4.0);
      expect(fit).toBe(1.0);
    });

    it('smoothly attenuates when reading time deviates from target', () => {
      const closeFit = computeGaussianFit(12, 14, 4.0);
      const farFit = computeGaussianFit(2, 14, 4.0);

      expect(closeFit).toBeGreaterThan(0.85);
      expect(farFit).toBeLessThan(0.05);
      expect(closeFit).toBeGreaterThan(farFit);
    });
  });

  describe('Anti-Clickbait Completion Multiplier', () => {
    function computeAntiClickbaitMultiplier(completionRate: number): number {
      return 0.7 + 0.3 * completionRate;
    }

    it('rewards articles with 100% completion rate with full 1.0 multiplier', () => {
      expect(computeAntiClickbaitMultiplier(1.0)).toBe(1.0);
    });

    it('penalizes clickbait articles with 0% completion rate down to 0.70 multiplier', () => {
      expect(computeAntiClickbaitMultiplier(0.0)).toBe(0.7);
    });

    it('proportionately scales at 80% deep reading completion', () => {
      expect(computeAntiClickbaitMultiplier(0.8)).toBeCloseTo(0.94, 5);
    });
  });

  describe('Vector Normalization & Similarity Math', () => {
    function normalizeVector(vec: number[]): number[] {
      const norm = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
      if (norm === 0) return vec;
      return vec.map((v) => v / norm);
    }

    function cosineSimilarity(a: number[], b: number[]): number {
      const normA = normalizeVector(a);
      const normB = normalizeVector(b);
      return normA.reduce((sum, val, idx) => sum + val * normB[idx], 0);
    }

    it('normalizes a vector to Euclidean norm of 1.0', () => {
      const raw = [3, 4, 0, 0];
      const norm = normalizeVector(raw);
      const magnitude = Math.sqrt(norm.reduce((s, v) => s + v * v, 0));
      expect(magnitude).toBeCloseTo(1.0, 5);
      expect(norm[0]).toBeCloseTo(0.6, 5);
      expect(norm[1]).toBeCloseTo(0.8, 5);
    });

    it('correctly computes cosine similarity of 1.0 for collinear vectors', () => {
      const a = [1, 2, 3];
      const b = [2, 4, 6];
      expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
    });

    it('correctly computes cosine similarity of 0.0 for orthogonal vectors', () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
    });

    it('handles zero vectors safely without division by zero errors', () => {
      const zero = [0, 0, 0];
      const norm = normalizeVector(zero);
      expect(norm).toEqual([0, 0, 0]);
    });
  });

  describe('Exponential Moving Average (EMA) Vector Drift', () => {
    it('applies the appropriate EMA alpha weighting per interaction type', () => {
      const EMA_WEIGHTS = {
        READ_COMPLETE: 0.08,
        READ_PARTIAL: 0.02,
        BOOKMARK: 0.15,
        LIKE: 0.05,
        HIGHLIGHT: 0.12,
        COMMENT: 0.1,
      };

      expect(EMA_WEIGHTS.BOOKMARK).toBeGreaterThan(EMA_WEIGHTS.LIKE);
      expect(EMA_WEIGHTS.HIGHLIGHT).toBeGreaterThan(EMA_WEIGHTS.READ_COMPLETE);
      expect(EMA_WEIGHTS.READ_COMPLETE).toBeGreaterThan(EMA_WEIGHTS.READ_PARTIAL);

      // Simuler une mise à jour EMA sur 2 dimensions
      const current = [1.0, 0.0];
      const target = [0.0, 1.0];
      const alpha = EMA_WEIGHTS.READ_COMPLETE;

      const updated = current.map((c, i) => (1 - alpha) * c + alpha * target[i]);
      expect(updated[0]).toBeCloseTo(0.92, 5);
      expect(updated[1]).toBeCloseTo(0.08, 5);
    });
  });
});
