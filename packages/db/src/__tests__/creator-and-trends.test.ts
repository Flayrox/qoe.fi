import { describe, it, expect } from 'vitest';
import type { SemanticTrendingTopic } from '../feed';

describe('👥 Creator Recommendation & Semantic Trends Math', () => {
  describe('Two-Tower Creator Scoring Formula', () => {
    function scoreCreator(simScore: number, subsCount: number, isCertified: boolean): number {
      const simWeight = 0.7 * simScore;
      const subsWeight = 0.2 * Math.min(1.0, subsCount / 50.0);
      const certWeight = 0.1 * (isCertified ? 1.0 : 0.0);
      return simWeight + subsWeight + certWeight;
    }

    it('ranks creators primarily by semantic similarity with the reader', () => {
      const highSimCreator = scoreCreator(0.92, 10, false); // High similarity (92%), small audience
      const lowSimPopularCreator = scoreCreator(0.3, 200, true); // Low similarity (30%), certified

      expect(highSimCreator).toBeGreaterThan(lowSimPopularCreator);
    });

    it('gives a fair boost to certified creators with active subscribers when similarity is close', () => {
      const authorA = scoreCreator(0.75, 5, false);
      const authorB = scoreCreator(0.75, 60, true);

      expect(authorB).toBeGreaterThan(authorA);
      expect(authorB - authorA).toBeCloseTo(0.2 * (1.0 - 0.1) + 0.1, 2);
    });

    it('caps subscriber count impact at 50 subscribers to prevent winner-take-all monopoly', () => {
      const score50Subs = scoreCreator(0.8, 50, false);
      const score5000Subs = scoreCreator(0.8, 5000, false);

      expect(score50Subs).toEqual(score5000Subs);
    });
  });

  describe('Cold-Start Creator Ranking Formula', () => {
    function scoreColdStart(subsCount: number, isCertified: boolean): number {
      return subsCount * 2 + (isCertified ? 5 : 0);
    }

    it('ranks popular and certified authors higher for first-time guest visitors', () => {
      const authorA = scoreColdStart(20, true);
      const authorB = scoreColdStart(2, false);

      expect(authorA).toBe(45);
      expect(authorB).toBe(4);
      expect(authorA).toBeGreaterThan(authorB);
    });
  });

  describe('Semantic Trending Topics Formatting (Beyond 2014 Hashtags)', () => {
    it('ensures topic names are natural language entities without hashtags', () => {
      const sampleTopics: SemanticTrendingTopic[] = [
        {
          id: '1',
          topicName: 'Épistémologie & Modèles d’IA',
          count: 48,
          growthRate: '+32% cette semaine',
          description: 'Discussions de fond',
        },
        {
          id: '2',
          topicName: 'Biorégionalisme & Terroirs',
          count: 36,
          growthRate: '+18% d’échanges',
          description: 'Essais sur le vivant',
        },
        {
          id: '3',
          topicName: 'Économie de l’Attention',
          count: 64,
          growthRate: '+45% de lectures',
          description: 'Philosophie numérique',
        },
      ];

      for (const topic of sampleTopics) {
        expect(topic.topicName.startsWith('#')).toBe(false);
        expect(topic.topicName.length).toBeGreaterThan(3);
        expect(topic.count).toBeGreaterThan(0);
        expect(topic.growthRate).toMatch(/\+\d+%/);
      }
    });
  });

  describe('Follow & Self Exclusion Filters', () => {
    function filterSuggestedCreators(
      candidates: Array<{ id: string; name: string }>,
      currentUserId: string | null,
      followedIds: string[]
    ) {
      const excludeSet = new Set<string>();
      if (currentUserId) excludeSet.add(currentUserId);
      followedIds.forEach((id) => excludeSet.add(id));

      return candidates.filter((c) => !excludeSet.has(c.id));
    }

    it('strictly excludes the user themselves and all authors already followed', () => {
      const currentUserId = 'user-123';
      const followedIds = ['creator-followed-1', 'creator-followed-2'];

      const candidates = [
        { id: 'user-123', name: 'Moi-même' },
        { id: 'creator-followed-1', name: 'Auteur déjà suivi' },
        { id: 'creator-new-1', name: 'Nouvel auteur A' },
        { id: 'creator-new-2', name: 'Nouvel auteur B' },
      ];

      const filtered = filterSuggestedCreators(candidates, currentUserId, followedIds);
      expect(filtered).toHaveLength(2);
      expect(filtered.map((c) => c.id)).toEqual(['creator-new-1', 'creator-new-2']);
    });
  });
});
