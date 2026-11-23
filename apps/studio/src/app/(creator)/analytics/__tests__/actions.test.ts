// =====================================================================
// 🧪 actions analytics — agrégation des vues et provenance
// =====================================================================
// La page analytics mélange trois sources (Go, Umami, signaux produit).
// Deux pièges vérifiés ici : une publication sans site Umami doit rester
// consultable (configuration signalée, pas d'erreur), et les parts de trafic
// doivent totaliser 100 % sur un échantillon significatif seulement.
// =====================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  goFetch: vi.fn(),
  getUser: vi.fn(),
  getActiveWorkspace: vi.fn(),
  websiteStats: vi.fn(),
  referrers: vi.fn(),
  metrics: vi.fn(),
}));

vi.mock('@qoe/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mocks.getUser } }),
}));

vi.mock('@/lib/active-workspace', () => ({
  getActiveWorkspace: mocks.getActiveWorkspace,
}));

vi.mock('@qoe/analytics/server', () => ({
  fetchUmamiWebsiteStats: mocks.websiteStats,
  fetchUmamiReferrers: mocks.referrers,
  fetchUmamiMetrics: mocks.metrics,
}));

vi.mock('@qoe/sdk/actions/utils/go-client', () => ({
  goFetch: mocks.goFetch,
}));

import { getArticleAnalyticsDetail, getCreatorAnalyticsData } from '../actions';

const productMetrics = {
  subscriberCount: 12,
  subscriberDelta7d: 2,
  totalArticles: 4,
  totalLikes: 8,
  totalBookmarks: 3,
  totalHighlights: 6,
  totalComments: 1,
  totalAnnotations: 0,
  totalReposts: 0,
  totalInteractions: 18,
  avgLikesPerArticle: 2,
  avgBookmarksPerArticle: 1,
  avgCommentsPerArticle: 0,
  avgHighlightsPerArticle: 1,
  avgInteractionsPerArticle: 4,
  avgCompletionRate: 0.6,
  readingQuality: { deepReadsRate: 0.5, skimsRate: 0.3, bouncesRate: 0.2 },
  topCategories: [{ name: 'Essais', count: 3 }],
  topArticles: [
    {
      id: 'art_1',
      slug: 'premier-article',
      title: 'Premier article',
      completionRate: 0.7,
      bookmarks: 2,
      comments: 1,
      highlights: 3,
      likes: 5,
      reposts: 0,
      interactions: 11,
      publishedAt: '2026-10-01T10:00:00.000Z',
    },
  ],
};

function router(overrides: Record<string, unknown> = {}) {
  return (url: string) => {
    const path = url.split('?')[0];
    if (path in overrides) {
      const value = overrides[path];
      return typeof value === 'function' ? (value as () => unknown)() : Promise.resolve(value);
    }
    if (path === '/v1/settings/publisher') {
      return Promise.resolve({
        id: 'pub_1',
        umamiWebsiteId: 'site_1',
        articles: [{ id: 'art_1', slug: 'premier-article', title: 'Premier article' }],
      });
    }
    if (path === '/v1/analytics/product-metrics') return Promise.resolve(productMetrics);
    if (path === '/v1/analytics/provenance') {
      return Promise.resolve({ bySource: [], byHostname: [], byReferrer: [] });
    }
    if (path === '/v1/analytics/audience/insights') {
      return Promise.reject(new Error('indisponible'));
    }
    if (path === '/v1/analytics/creator') {
      return Promise.resolve({
        perArticle: { art_1: 5 },
        totalViews: 5,
        avgDwellSeconds: 42,
        dailySeries: [],
      });
    }
    return Promise.reject(new Error(`route non mockée: ${url}`));
  };
}

describe('getCreatorAnalyticsData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u_1' } }, error: null });
    mocks.getActiveWorkspace.mockResolvedValue({ publisherId: 'pub_1' });
    mocks.websiteStats.mockResolvedValue({
      pageviews: 999,
      visitors: 10,
      visits: 12,
      bounces: 3,
      totaltime: 500,
    });
    mocks.referrers.mockResolvedValue([{ x: 'qoe.fi', y: 4 }]);
    mocks.metrics.mockResolvedValue([]);
    mocks.goFetch.mockImplementation(router());
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('refuse l’accès sans session', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error('no session') });

    const res = await getCreatorAnalyticsData();

    expect(res).toEqual({ error: 'Non autorisé', errorCode: 'unauthorized' });
    expect(mocks.goFetch).not.toHaveBeenCalled();
  });

  it('reste consultable sans site Umami : configuration signalée, produit intact', async () => {
    mocks.goFetch.mockImplementation(
      router({
        '/v1/settings/publisher': {
          id: 'pub_1',
          umamiWebsiteId: null,
          articles: [{ id: 'art_1', slug: 'premier-article', title: 'Premier article' }],
        },
      })
    );
    delete process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;

    const res = await getCreatorAnalyticsData('7d');

    expect(res.error).toBeUndefined();
    expect(res.data).toMatchObject({
      configured: false,
      websiteId: '',
      stats: null,
      timeseries: [],
      topPages: [],
    });
    expect(res.data?.productMetrics.subscriberCount).toBe(12);
    expect(res.data?.productMetrics.topArticles[0].publishedAt).toBeInstanceOf(Date);
    expect(mocks.websiteStats).not.toHaveBeenCalled();
  });

  it('attribue les vues aux slugs d’articles et garde le total réel', async () => {
    const res = await getCreatorAnalyticsData('7d');

    expect(res.data?.configured).toBe(true);
    expect(res.data?.stats?.pageviews).toBe(5);
    expect(res.data?.topPages).toEqual([{ x: '/articles/premier-article', y: 5 }]);
    expect(res.data?.avgDwellSeconds).toBe(42);
    expect(res.data?.articleTitlesMap['/premier-article']).toBe('Premier article');
    // Une série journalière continue, sans trou : la courbe ne doit pas mentir.
    expect((res.data?.timeseries.length ?? 0) >= 7).toBe(true);
    expect(res.data?.timeseries.every((point) => typeof point.y === 'number')).toBe(true);
  });

  it('corrige l’arrondi des parts de trafic sur un échantillon significatif', async () => {
    mocks.goFetch.mockImplementation(
      router({
        '/v1/analytics/provenance': {
          bySource: [
            { key: 'feed', count: 3 },
            { key: 'subdomain', count: 3 },
            { key: 'direct', count: 2 },
          ],
          byHostname: [],
          byReferrer: [],
        },
      })
    );

    const res = await getCreatorAnalyticsData('30d');
    const sources = res.data!.productMetrics.trafficSources;

    expect(sources).toEqual({ feed: 38, subdomain: 38, publicProfile: 0, direct: 24 });
    expect(sources.feed + sources.subdomain + sources.publicProfile + sources.direct).toBe(100);
  });

  it('ne prétend pas corriger un échantillon trop petit', async () => {
    mocks.goFetch.mockImplementation(
      router({
        '/v1/analytics/provenance': {
          bySource: [
            { key: 'feed', count: 1 },
            { key: 'subdomain', count: 1 },
          ],
          byHostname: [],
          byReferrer: [],
        },
      })
    );

    const res = await getCreatorAnalyticsData('30d');

    expect(res.data!.productMetrics.trafficSources).toEqual({
      feed: 50,
      subdomain: 50,
      publicProfile: 0,
      direct: 0,
    });
  });
});

describe('getArticleAnalyticsDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'u_1' } }, error: null });
    mocks.getActiveWorkspace.mockResolvedValue({ publisherId: 'pub_1' });
    mocks.goFetch.mockImplementation(
      router({
        '/v1/analytics/reading-sessions': {
          articleId: 'art_1',
          totalViews: 120,
          timeseries: [{ day: new Date().toISOString().slice(0, 10), count: 4 }],
          byHostname: [
            { key: 'qoe.fi', count: 3 },
            { key: '', count: 99 },
          ],
          bySource: [],
          likes: 2,
          completionRate: 0.5,
        },
      })
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('résout un slug préfixé et une URL avec paramètres de campagne', async () => {
    const res = await getArticleAnalyticsDetail(
      '/articles/premier-article?utm_source=newsletter',
      '30d'
    );

    expect(res.error).toBeUndefined();
    expect(res.data?.articleId).toBe('art_1');
    expect(res.data?.totalViews).toBe(4);
    // La série va jusqu'au jour courant, même quand la période traverse un
    // changement d'heure (jours UTC, bornes incluses).
    expect(res.data?.timeseries.at(-1)?.x.slice(0, 10)).toBe(new Date().toISOString().slice(0, 10));
    // Un hôte vide n'est pas une source : il ne doit pas apparaître.
    expect(res.data?.referrers).toEqual([{ x: 'qoe.fi', y: 3 }]);
  });

  it('renvoie un détail vide plutôt qu’une erreur pour un article inconnu', async () => {
    mocks.goFetch.mockImplementation(
      router({
        '/v1/articles/by-id/inconnu': () => Promise.reject(new Error('404')),
      })
    );

    const res = await getArticleAnalyticsDetail('inconnu', '7d');

    expect(res.error).toBeUndefined();
    expect(res.data).toMatchObject({ totalViews: 0, timeseries: [], title: 'inconnu' });
  });

  it('prend le total historique en période « all »', async () => {
    const res = await getArticleAnalyticsDetail('/articles/premier-article', 'all');

    expect(res.data?.totalViews).toBe(120);
  });

  it('borne la série à la période demandée, pas à un mois glissant', async () => {
    const week = await getArticleAnalyticsDetail('/articles/premier-article', '7d');
    const quarter = await getArticleAnalyticsDetail('/articles/premier-article', '90d');

    // Bornes incluses : 7 jours → 8 points, 90 jours → 91 points. Une série
    // de 31 points pour les deux périodes annoncerait une fenêtre qui n'est
    // pas celle du sélecteur.
    expect(week.data?.timeseries).toHaveLength(8);
    expect(quarter.data?.timeseries).toHaveLength(91);
  });
});
