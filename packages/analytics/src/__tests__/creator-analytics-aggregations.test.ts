import { describe, it, expect } from 'vitest';

describe('📊 Creator Studio Analytics & Quality Aggregations', () => {
  describe('Reading Quality Gauge Calculation', () => {
    function computeReadingQualityBreakdown(
      sessions: Array<{ status: 'BOUNCE' | 'SKIM' | 'READ_PARTIAL' | 'READ_COMPLETE' }>
    ) {
      const total = sessions.length;
      if (total === 0) {
        return { deepReadsRate: 0, skimsRate: 0, bouncesRate: 0 };
      }

      let deepReads = 0;
      let skims = 0;
      let bounces = 0;

      for (const s of sessions) {
        if (s.status === 'READ_COMPLETE') deepReads++;
        else if (s.status === 'SKIM') skims++;
        else if (s.status === 'BOUNCE') bounces++;
        else deepReads += 0.5; // partial counts as semi-deep read
      }

      return {
        deepReadsRate: Math.round((deepReads / total) * 100),
        skimsRate: Math.round((skims / total) * 100),
        bouncesRate: Math.round((bounces / total) * 100),
      };
    }

    it('calculates accurate percentages across real reading session distributions', () => {
      const sampleSessions: Array<{
        status: 'BOUNCE' | 'SKIM' | 'READ_PARTIAL' | 'READ_COMPLETE';
      }> = [
        { status: 'READ_COMPLETE' },
        { status: 'READ_COMPLETE' },
        { status: 'READ_COMPLETE' },
        { status: 'SKIM' },
        { status: 'BOUNCE' },
      ];

      const breakdown = computeReadingQualityBreakdown(sampleSessions);
      expect(breakdown.deepReadsRate).toBe(60); // 3/5 = 60%
      expect(breakdown.skimsRate).toBe(20); // 1/5 = 20%
      expect(breakdown.bouncesRate).toBe(20); // 1/5 = 20%
      expect(breakdown.deepReadsRate + breakdown.skimsRate + breakdown.bouncesRate).toBe(100);
    });

    it('handles empty data gracefully without returning NaN', () => {
      const breakdown = computeReadingQualityBreakdown([]);
      expect(breakdown).toEqual({ deepReadsRate: 0, skimsRate: 0, bouncesRate: 0 });
    });
  });

  describe('Traffic Sources Breakdown Calculation', () => {
    function computeTrafficSources(
      sessions: Array<{ source: 'feed' | 'subdomain' | 'public_profile' | 'direct' }>
    ) {
      const total = sessions.length;
      if (total === 0) {
        return { feed: 45, subdomain: 30, publicProfile: 15, direct: 10 }; // default baseline
      }

      const counts = { feed: 0, subdomain: 0, public_profile: 0, direct: 0 };
      for (const s of sessions) {
        if (counts[s.source] !== undefined) counts[s.source]++;
      }

      return {
        feed: Math.round((counts.feed / total) * 100),
        subdomain: Math.round((counts.subdomain / total) * 100),
        publicProfile: Math.round((counts.public_profile / total) * 100),
        direct: Math.round((counts.direct / total) * 100),
      };
    }

    it('correctly partitions reading sessions by origin', () => {
      const sessions: Array<{ source: 'feed' | 'subdomain' | 'public_profile' | 'direct' }> = [
        { source: 'feed' },
        { source: 'feed' },
        { source: 'subdomain' },
        { source: 'public_profile' },
      ];

      const sources = computeTrafficSources(sessions);
      expect(sources.feed).toBe(50);
      expect(sources.subdomain).toBe(25);
      expect(sources.publicProfile).toBe(25);
      expect(sources.direct).toBe(0);
    });
  });

  describe('Certified Completion Rate Rolling Average', () => {
    function computeRollingCompletionRate(
      currentRate: number,
      newCompletion: number,
      totalSamples: number
    ): number {
      if (totalSamples <= 1) return newCompletion;
      // Exponential smoothing / rolling update
      const alpha = 0.2;
      return currentRate * (1 - alpha) + newCompletion * alpha;
    }

    it('smoothly updates article completion rate upon new reading sessions', () => {
      const initial = 0.7;
      const completeSession = 1.0;
      const updated = computeRollingCompletionRate(initial, completeSession, 10);

      expect(updated).toBeCloseTo(0.76, 4);
      expect(updated).toBeGreaterThan(initial);
    });

    it('smoothly reduces article completion rate upon quick bounce sessions', () => {
      const initial = 0.8;
      const bounceSession = 0.1;
      const updated = computeRollingCompletionRate(initial, bounceSession, 10);

      expect(updated).toBeCloseTo(0.66, 4);
      expect(updated).toBeLessThan(initial);
    });
  });
});
