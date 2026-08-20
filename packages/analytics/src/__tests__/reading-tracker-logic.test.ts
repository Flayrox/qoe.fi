import { describe, it, expect } from 'vitest';
import type { ReadingStatus, ReadingSource } from '../useArticleReadingTracker';

describe('📊 Reading Tracker Logic & Tiers Classification', () => {
  function classifyReadingStatus(
    dwellSeconds: number,
    scrollDepthPercent: number,
    readingTimeMinutes: number = 5
  ): ReadingStatus {
    const expectedSeconds = readingTimeMinutes * 60;
    const minReadingTime = expectedSeconds * 0.35; // 35% of estimated reading time

    if (dwellSeconds < 10 && scrollDepthPercent < 25) {
      return 'BOUNCE';
    } else if (scrollDepthPercent >= 80 && dwellSeconds < minReadingTime) {
      return 'SKIM'; // Fast scroll without reading
    } else if (scrollDepthPercent >= 85 && dwellSeconds >= minReadingTime) {
      return 'READ_COMPLETE'; // Certified complete deep read
    } else if (scrollDepthPercent >= 25) {
      return 'READ_PARTIAL';
    }
    return 'BOUNCE';
  }

  describe('Classification Tiers', () => {
    it('classifies quick drop-offs (<10s, <25% scroll) as BOUNCE', () => {
      const status = classifyReadingStatus(5, 15, 5);
      expect(status).toBe('BOUNCE');
    });

    it('classifies fast full scroll with low dwell time as SKIM (Survol)', () => {
      // 5 min article = 300s -> minReadingTime = 105s
      // User scrolled 90% in only 20 seconds
      const status = classifyReadingStatus(20, 90, 5);
      expect(status).toBe('SKIM');
    });

    it('classifies deep read (>85% scroll, >=35% dwell time) as READ_COMPLETE', () => {
      // 5 min article -> 120s dwell time (> 105s), 95% scroll
      const status = classifyReadingStatus(120, 95, 5);
      expect(status).toBe('READ_COMPLETE');
    });

    it('classifies medium progression (50% scroll, 60s dwell time) as READ_PARTIAL', () => {
      const status = classifyReadingStatus(60, 50, 5);
      expect(status).toBe('READ_PARTIAL');
    });
  });

  describe('Scroll Milestones Detection', () => {
    function getTriggeredMilestones(
      previousMilestones: Set<number>,
      currentScroll: number
    ): number[] {
      const milestones = [25, 50, 75, 100];
      const newlyTriggered: number[] = [];

      for (const m of milestones) {
        if (currentScroll >= m && !previousMilestones.has(m)) {
          previousMilestones.add(m);
          newlyTriggered.push(m);
        }
      }
      return newlyTriggered;
    }

    it('triggers milestones sequentially as user scrolls down', () => {
      const tracked = new Set<number>();

      const firstBatch = getTriggeredMilestones(tracked, 30);
      expect(firstBatch).toEqual([25]);

      const secondBatch = getTriggeredMilestones(tracked, 80);
      expect(secondBatch).toEqual([50, 75]);

      const finalBatch = getTriggeredMilestones(tracked, 100);
      expect(finalBatch).toEqual([100]);

      // Re-scrolling up does not re-trigger
      const reScroll = getTriggeredMilestones(tracked, 50);
      expect(reScroll).toEqual([]);
    });
  });

  describe('Source Attribution Resolution', () => {
    function resolveReadingSource(
      initialSource?: ReadingSource,
      searchParams: string = '',
      pathname: string = '/',
      hostname: string = 'qoe.fi'
    ): ReadingSource {
      if (initialSource) return initialSource;

      const params = new URLSearchParams(searchParams);
      const refParam = params.get('ref') || params.get('source');

      if (refParam === 'feed' || pathname.startsWith('/home')) {
        return 'feed';
      }
      if (refParam === 'profile' || refParam === 'author') {
        return 'public_profile';
      }
      const isSubdomain =
        hostname.includes('.qoe.fi') &&
        !hostname.startsWith('core.') &&
        !hostname.startsWith('www.');
      if (isSubdomain) {
        return 'subdomain';
      }
      return 'direct';
    }

    it('identifies feed source when originating from /home or ?ref=feed', () => {
      expect(resolveReadingSource(undefined, '', '/home')).toBe('feed');
      expect(resolveReadingSource(undefined, '?ref=feed', '/article/philosophie')).toBe('feed');
    });

    it('identifies public_profile source when ref=profile', () => {
      expect(resolveReadingSource(undefined, '?source=profile', '/article/philosophie')).toBe(
        'public_profile'
      );
    });

    it('identifies creator subdomain when browsing creator.qoe.fi', () => {
      expect(resolveReadingSource(undefined, '', '/article/slug', 'theophile.qoe.fi')).toBe(
        'subdomain'
      );
    });

    it('defaults to direct when no specific referrer is present', () => {
      expect(resolveReadingSource(undefined, '', '/article/slug', 'qoe.fi')).toBe('direct');
    });
  });
});
