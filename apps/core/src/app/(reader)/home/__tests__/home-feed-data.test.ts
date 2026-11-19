/**
 * L20b2b2a — le chargement du foyer (`loadHomeFeedData`) ne doit pas tomber
 * quand Go hoquette : la home et la page article qui le réutilisent doivent
 * rendre un feed vide plutôt qu'un 500.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  goFetch: vi.fn(),
  createClient: vi.fn(),
  getRequestDbUser: vi.fn(),
  getCachedPromos: vi.fn(async () => []),
  buildVectorFeedPage: vi.fn(async () => ({ items: [], hasMore: false, nextOffset: 0 })),
}));

vi.mock('@qoe/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/cached-queries', () => ({
  getRequestDbUser: mocks.getRequestDbUser,
  getCachedPromos: mocks.getCachedPromos,
}));
vi.mock('@qoe/sdk/actions/utils/go-client', () => ({ goFetch: mocks.goFetch }));
vi.mock('@/lib/vector-feed', () => ({
  buildVectorFeedPage: mocks.buildVectorFeedPage,
  mapArticleToFeedItem: vi.fn(),
  mapPublisherToAuthor: vi.fn(),
  mapSliceToFeedItem: vi.fn(),
}));

import { loadHomeFeedData } from '@/lib/home-feed-data';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
  });
});

describe('loadHomeFeedData (L20b2b2a)', () => {
  it('rend un foyer vide quand tous les appels Go échouent', async () => {
    mocks.goFetch.mockRejectedValue(new Error('Go API 503'));

    const data = await loadHomeFeedData();

    expect(data.followingArticles).toEqual([]);
    expect(data.recommendationArticles).toEqual([]);
    expect(data.discoverArticles).toEqual([]);
    expect(data.bookmarks).toEqual([]);
    expect(data.onboardingCategories).toEqual([]);
    expect(data.onboardingSuggestedCreators).toEqual([]);
    expect(data.needsOnboarding).toBe(false);
  });

  it('conserve le bundle Go quand il répond', async () => {
    mocks.goFetch.mockImplementation(async (path: string) => {
      if (path === '/v1/home/feed') {
        return {
          followedCreators: [],
          followedUserIds: [],
          following: { articles: [], thoughts: [] },
          discover: { articles: [], thoughts: [] },
          recommended: { articles: [], thoughts: [] },
          bookmarks: [],
          highlightsCount: 3,
          activityData: [1, 2],
          mutedWords: ['Spoiler'],
          featuredArticle: null,
          followingHidden: [],
        };
      }
      if (path === '/v1/home/onboarding') {
        return { categories: [{ id: 'c1' }], suggestedCreators: [] };
      }
      return [];
    });

    const data = await loadHomeFeedData();

    expect(data.initialHighlightsCount).toBe(3);
    expect(data.activityData).toEqual([1, 2]);
    expect(data.mutedWords).toEqual(['spoiler']);
    expect(data.onboardingCategories).toHaveLength(1);
  });
});
