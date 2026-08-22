'use server';

import { createClient } from '@qoe/supabase/server';
import { prisma } from '@qoe/db/client';
import { getActiveWorkspace } from '@/lib/active-workspace';
import {
  fetchUmamiWebsiteStats,
  fetchUmamiTopPages,
  fetchUmamiReferrers,
  fetchUmamiPageviewsSeries,
  fetchUmamiMetrics,
  UmamiStats,
  UmamiPageMetric,
  UmamiTimeseriesPoint,
} from '@qoe/analytics/server';
import { goFetch } from '@qoe/api-client/actions/utils/go-client';

export type TimePeriod = '24h' | '7d' | '30d' | '90d';

export interface AnalyticsResponseData {
  configured: boolean;
  websiteId: string;
  period: TimePeriod;
  stats: UmamiStats | null;
  timeseries: UmamiTimeseriesPoint[];
  topPages: UmamiPageMetric[];
  referrers: UmamiPageMetric[];
  devices: UmamiPageMetric[];
  browsers: UmamiPageMetric[];
  countries: UmamiPageMetric[];
  articleTitlesMap: Record<string, string>;
  productMetrics: ProductMetrics;
  audience: AudienceInsights;
  umamiAdvanced: UmamiAdvancedInsights;
  provenance: ProvenanceBreakdown;
}

// 🧭 Provenance fine — d'où viennent les vues (le plus poussé)
export interface ProvenanceBucket {
  key: string; // "feed" | "victor.qoe.fi" | "@simone" | ...
  count: number;
}
export interface ProvenanceBreakdown {
  bySource: ProvenanceBucket[]; // feed | subdomain | public_profile | direct
  byHostname: ProvenanceBucket[]; // victor.qoe.fi, simone.qoe.fi...
  byReferrer: ProvenanceBucket[]; // @simone, @victor (profil référent)
}

export interface ArticleDetailData {
  url: string;
  title: string;
  timeseries: UmamiTimeseriesPoint[];
  referrers: UmamiPageMetric[];
  totalViews: number;
}

export interface ProductMetrics {
  subscriberCount: number;
  subscriberDelta7d: number;
  totalBookmarks: number;
  totalHighlights: number;
  totalInteractions: number;
  avgCompletionRate: number | null;
  readingQuality: {
    deepReadsRate: number;
    skimsRate: number;
    bouncesRate: number;
  };
  trafficSources: {
    feed: number;
    subdomain: number;
    publicProfile: number;
    direct: number;
  };
  topCategories: { name: string; count: number }[];
  topArticles: {
    slug: string;
    title: string;
    completionRate: number;
    bookmarks: number;
    comments: number;
    highlights: number;
    highlightsPublic: number;
    highlightsPrivate: number;
    annotations: number;
    interactions: number;
    publishedAt: Date | null;
  }[];
}

// ── Démographie d'audience (agrégée depuis le profil User, jamais individuelle) ──
export interface DemographicBucket {
  value: string;
  count: number;
}

export interface AudienceDemographics {
  declared: number; // nb d'utilisateurs ayant renseigné au moins un champ
  gender: DemographicBucket[];
  ageRange: DemographicBucket[];
  countries: DemographicBucket[];
  languages: DemographicBucket[];
}

export interface AudienceInsights {
  creator: AudienceDemographics;
  platform: AudienceDemographics;
}

// ── Insights Umami avancés (DB Umami via l'API Go) ─────────────────────
export interface ReturningVisitors {
  total: number;
  newVisitors: number;
  returningVisitors: number;
}

export interface HourVisit {
  hour: number;
  visits: number;
}

export interface UmamiAdvancedInsights {
  returning: ReturningVisitors | null;
  hours: HourVisit[];
}

// ── Labels démographiques (extraits dans demographic-labels.ts — voir Turbopack) ──

async function aggregateDemographics(userIds?: string[]): Promise<AudienceDemographics> {
  const where = userIds ? { id: { in: userIds } } : {};

  const [gender, ageRange, countries, languages] = await Promise.all([
    prisma.user.groupBy({
      by: ['gender'],
      where: { ...where, gender: { not: null } },
      _count: { _all: true },
    }),
    prisma.user.groupBy({
      by: ['ageRange'],
      where: { ...where, ageRange: { not: null } },
      _count: { _all: true },
    }),
    prisma.user.groupBy({
      by: ['countryCode'],
      where: { ...where, countryCode: { not: null } },
      _count: { _all: true },
    }),
    prisma.user.groupBy({
      by: ['languageCode'],
      where: { ...where, languageCode: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const toBuckets = (
    rows: Array<Record<string, unknown> & { _count: { _all: number } }>,
    key: string
  ): DemographicBucket[] =>
    rows
      .map((row) => ({ value: String(row[key] ?? ''), count: row._count._all }))
      .filter((b) => b.value !== '')
      .sort((a, b) => b.count - a.count);

  const declared = Math.max(gender.length, ageRange.length, countries.length, languages.length);

  return {
    declared,
    gender: toBuckets(gender, 'gender'),
    ageRange: toBuckets(ageRange, 'ageRange'),
    countries: toBuckets(countries, 'countryCode'),
    languages: toBuckets(languages, 'languageCode'),
  };
}

async function getAudienceInsights(publicationId: string): Promise<AudienceInsights> {
  const [followers, platform] = await Promise.all([
    prisma.follows.findMany({
      where: { publicationId },
      select: { readerId: true },
    }),
    aggregateDemographics(),
  ]);

  const readerIds = [...new Set(followers.map((f) => f.readerId))];
  const creator =
    readerIds.length > 0 ? await aggregateDemographics(readerIds) : emptyDemographics();

  return { creator, platform };
}

function emptyDemographics(): AudienceDemographics {
  return { declared: 0, gender: [], ageRange: [], countries: [], languages: [] };
}

export async function getCreatorAnalyticsData(
  period: TimePeriod = '30d'
): Promise<{ data?: AnalyticsResponseData; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { error: 'Non autorisé' };
    }

    const workspace = await getActiveWorkspace(user.id);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // 🎯 Vues PLEIN par attribution : articles de la publication + articles co-signés
    // (ArticleAttribution ACCEPTED) — chaque co-auteur reçoit 100% des stats de l'article.
    const attributedArticles = await prisma.article.findMany({
      where: {
        published: true,
        OR: [
          { publicationId: workspace.publicationId },
          {
            attributions: {
              some: { userId: user.id, consentStatus: 'ACCEPTED', isVisible: true },
            },
          },
        ],
      },
      select: {
        id: true,
        slug: true,
        title: true,
        createdAt: true,
        completionRate: true,
        category: { select: { name: true } },
        _count: { select: { bookmarks: true, comments: true, highlights: true } },
        highlights: {
          select: {
            isPublic: true,
            _count: { select: { comments: true } },
          },
        },
      },
    });

    const attributedSlugs = attributedArticles.map((a) => `/articles/${a.slug}`);
    const attributedSlugSet = new Set(attributedSlugs);

    // Provenance fine (le plus poussé) : breakdown par source + hostname/referrer
    const [bySource, byHostname, byReferrer] = await Promise.all([
      prisma.readingSession.groupBy({
        by: ['source'],
        where: {
          articleId: { in: attributedArticles.map((a) => a.id) },
          createdAt: { gte: sevenDaysAgo },
        },
        _count: { _all: true },
      }),
      prisma.readingSession.groupBy({
        by: ['hostname'],
        where: {
          articleId: { in: attributedArticles.map((a) => a.id) },
          hostname: { not: null },
          createdAt: { gte: sevenDaysAgo },
        },
        _count: { _all: true },
      }),
      prisma.readingSession.groupBy({
        by: ['referrerUsername'],
        where: {
          articleId: { in: attributedArticles.map((a) => a.id) },
          referrerUsername: { not: null },
          createdAt: { gte: sevenDaysAgo },
        },
        _count: { _all: true },
      }),
    ]);

    const provenance = {
      bySource: bySource.map((s) => ({ key: s.source, count: s._count._all })),
      byHostname: byHostname.map((s) => ({ key: s.hostname || 'inconnu', count: s._count._all })),
      byReferrer: byReferrer.map((s) => ({ key: `@${s.referrerUsername}`, count: s._count._all })),
    };

    const creator = await prisma.publication.findUnique({
      where: { id: workspace.publicationId },
      select: {
        id: true,
        umamiWebsiteId: true,
        _count: { select: { subscribers: true } },
        subscribers: {
          where: { createdAt: { gte: sevenDaysAgo } },
          select: { id: true },
        },
        articles: {
          select: {
            id: true,
            slug: true,
            title: true,
            createdAt: true,
            completionRate: true,
            category: { select: { name: true } },
            _count: { select: { bookmarks: true, comments: true, highlights: true } },
            highlights: {
              select: {
                isPublic: true,
                _count: { select: { comments: true } },
              },
            },
          },
        },
      },
    });

    if (!creator) {
      return { error: 'Publication introuvable' };
    }

    // Union publication + attributions pour les métriques produit
    const ownedSlugs = new Set(creator.articles.map((a) => a.slug));
    const mergedArticlesMap = new Map<string, (typeof attributedArticles)[number]>();
    for (const art of attributedArticles) mergedArticlesMap.set(art.id, art);
    for (const art of creator.articles) {
      if (!mergedArticlesMap.has(art.id)) {
        // creator.articles n'a pas les mêmes champs exacts — on mappe manuellement
        mergedArticlesMap.set(art.id, art as unknown as (typeof attributedArticles)[number]);
      }
    }
    const allCreatorArticles = Array.from(mergedArticlesMap.values());

    const articleTitlesMap: Record<string, string> = {};
    const topArticles = allCreatorArticles
      .map((a) => {
        const highlightsPublic = a.highlights.filter((h) => h.isPublic).length;
        const highlightsPrivate = a.highlights.length - highlightsPublic;
        const annotations = a.highlights.reduce((s, h) => s + h._count.comments, 0);
        const interactions =
          a._count.bookmarks + a._count.comments + a._count.highlights + annotations;
        return {
          slug: a.slug,
          title: a.title,
          completionRate: typeof a.completionRate === 'number' ? a.completionRate : 0,
          bookmarks: a._count.bookmarks,
          comments: a._count.comments,
          highlights: a._count.highlights,
          highlightsPublic,
          highlightsPrivate,
          annotations,
          interactions,
          publishedAt: a.createdAt,
        };
      })
      .sort((a, b) => b.interactions - a.interactions)
      .slice(0, 5);
    allCreatorArticles.forEach((article) => {
      articleTitlesMap[`/articles/${article.slug}`] = article.title;
      articleTitlesMap[`/${article.slug}`] = article.title;
    });

    // Top catégories + complétion moyenne & qualité de lecture — réaliste (pas de 0.8 / 72 magiques)
    const categoryCounts = new Map<string, number>();
    const completionRates: number[] = [];
    allCreatorArticles.forEach((a) => {
      if (a.category?.name) {
        categoryCounts.set(a.category.name, (categoryCounts.get(a.category.name) ?? 0) + 1);
      }
      if (typeof a.completionRate === 'number') {
        completionRates.push(a.completionRate);
      }
    });
    const topCategories = [...categoryCounts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
    const avgCompletionRate =
      completionRates.length > 0
        ? Math.round((completionRates.reduce((s, v) => s + v, 0) / completionRates.length) * 100) /
          100
        : 0;

    // Qualité de lecture dérivée des completionRates réels (0 si pas de données)
    const deepReadsRate =
      completionRates.length > 0
        ? Math.round(
            (completionRates.filter((r) => r >= 0.75).length / completionRates.length) * 100
          )
        : 0;
    const skimsRate =
      completionRates.length > 0
        ? Math.round((completionRates.filter((r) => r < 0.5).length / completionRates.length) * 100)
        : 0;
    const bouncesRate =
      completionRates.length > 0 ? Math.max(0, 100 - deepReadsRate - skimsRate) : 0;

    // trafficSources sera dérivé des referrers Umami après fetch (sinon 0 par défaut)
    const productMetrics: ProductMetrics = {
      subscriberCount: creator._count.subscribers,
      subscriberDelta7d: creator.subscribers.length,
      totalBookmarks: topArticles.reduce((s, a) => s + a.bookmarks, 0),
      totalHighlights: topArticles.reduce((s, a) => s + a.highlights, 0),
      totalInteractions: topArticles.reduce((s, a) => s + a.interactions, 0),
      avgCompletionRate,
      readingQuality: {
        deepReadsRate,
        skimsRate,
        bouncesRate,
      },
      trafficSources: {
        feed: 0,
        subdomain: 0,
        publicProfile: 0,
        direct: 0,
      },
      topCategories,
      topArticles,
    };

    const audience = await getAudienceInsights(creator.id);

    const targetWebsiteId =
      creator.umamiWebsiteId || process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || '';

    if (!targetWebsiteId) {
      return {
        data: {
          configured: false,
          websiteId: '',
          period,
          stats: null,
          timeseries: [],
          topPages: [],
          referrers: [],
          devices: [],
          browsers: [],
          countries: [],
          articleTitlesMap,
          productMetrics,
          audience,
          umamiAdvanced: { returning: null, hours: [] },
          provenance,
        },
      };
    }

    const now = Date.now();
    let startAt = now - 30 * 24 * 60 * 60 * 1000;
    let unit: 'hour' | 'day' = 'day';

    if (period === '24h') {
      startAt = now - 24 * 60 * 60 * 1000;
      unit = 'hour';
    } else if (period === '7d') {
      startAt = now - 7 * 24 * 60 * 60 * 1000;
      unit = 'day';
    } else if (period === '90d') {
      startAt = now - 90 * 24 * 60 * 60 * 1000;
      unit = 'day';
    }

    // 🎯 Vues PLEIN : agrégation par article attribué (pas global).
    // Pour chaque slug attribué, on somme les pageviews Umami filtrés par &url=
    // → un co-auteur reçoit 100% des vues de l'article co-signé.
    const perArticleViews = await Promise.all(
      attributedSlugs.slice(0, 50).map(async (url) => {
        const series = await fetchUmamiPageviewsSeries(targetWebsiteId, startAt, now, unit, url);
        const total = series.reduce((s, p) => s + (p.y || 0), 0);
        return { url, total };
      })
    );
    const creatorTotalViews = perArticleViews.reduce((s, a) => s + a.total, 0);

    // stats "plein" pour ce créateur : pageviews = somme de SES articles attribués
    // (visiteurs/visites restent des estimations globales, pageviews = attribution exacte)
    const globalStats = await fetchUmamiWebsiteStats(targetWebsiteId, startAt, now);
    const creatorStats: UmamiStats | null = globalStats
      ? {
          ...globalStats,
          pageviews: creatorTotalViews,
        }
      : null;

    // topPages filtré sur les slugs attribués seulement (plus le top global)
    const attributedTopPages: UmamiPageMetric[] = perArticleViews
      .filter((a) => a.total > 0)
      .map((a) => ({ x: a.url, y: a.total }))
      .sort((x, y) => y.y - x.y)
      .slice(0, 10);
    void attributedSlugSet;

    const [timeseries, referrers, devices, browsers, countries] = await Promise.all([
      fetchUmamiPageviewsSeries(targetWebsiteId, startAt, now, unit),
      fetchUmamiReferrers(targetWebsiteId, startAt, now, 10),
      fetchUmamiMetrics(targetWebsiteId, startAt, now, 'device', 5),
      fetchUmamiMetrics(targetWebsiteId, startAt, now, 'browser', 5),
      fetchUmamiMetrics(targetWebsiteId, startAt, now, 'country', 5),
    ]);
    const topPages = attributedTopPages;

    // Dérive trafficSources réels depuis la PROVENANCE DB (ReadingSession) — plus précis qu'Umami
    const totalProv = provenance.bySource.reduce((s, p) => s + p.count, 0);
    if (totalProv > 0) {
      const pct = (n: number) => Math.round((n / totalProv) * 100);
      productMetrics.trafficSources = {
        feed: pct(provenance.bySource.find((p) => p.key === 'feed')?.count || 0),
        subdomain: pct(provenance.bySource.find((p) => p.key === 'subdomain')?.count || 0),
        publicProfile: pct(provenance.bySource.find((p) => p.key === 'public_profile')?.count || 0),
        direct: pct(provenance.bySource.find((p) => p.key === 'direct')?.count || 0),
      };
      const sum =
        productMetrics.trafficSources.feed +
        productMetrics.trafficSources.subdomain +
        productMetrics.trafficSources.publicProfile +
        productMetrics.trafficSources.direct;
      if (sum !== 100 && sum > 0 && totalProv >= 5) {
        productMetrics.trafficSources.direct += 100 - sum;
      }
    }

    // Insights avancés (DB Umami via l'API Go) : visiteurs récurrents vs
    // nouveaux + heatmap horaire. Best-effort : silencieux si indisponible.
    const umamiAdvanced: UmamiAdvancedInsights = await fetchUmamiAdvancedInsights(
      creator.id,
      startAt,
      now
    );

    return {
      data: {
        configured: true,
        websiteId: targetWebsiteId,
        period,
        stats: creatorStats,
        timeseries,
        topPages,
        referrers,
        devices,
        browsers,
        countries,
        articleTitlesMap,
        productMetrics,
        audience,
        umamiAdvanced,
        provenance,
      },
    };
  } catch (err: unknown) {
    console.error('Error in getCreatorAnalyticsData server action:', err);
    return {
      error:
        err instanceof Error ? err.message : 'Erreur lors de la récupération des données analytics',
    };
  }
}

/**
 * 📊 Inspecter les métriques détaillées d'un article en particulier (Modal Inspection)
 */
async function fetchUmamiAdvancedInsights(
  publicationId: string,
  startAt: number,
  endAt: number
): Promise<UmamiAdvancedInsights> {
  try {
    const params = `publicationId=${encodeURIComponent(publicationId)}&startAt=${startAt}&endAt=${endAt}`;
    const [returning, hours] = await Promise.all([
      goFetch<ReturningVisitors>(`/v1/analytics/umami/returning?${params}`).catch(() => null),
      goFetch<HourVisit[]>(`/v1/analytics/umami/hours?${params}`).catch(() => []),
    ]);
    return { returning, hours };
  } catch {
    return { returning: null, hours: [] };
  }
}

export async function getArticleAnalyticsDetail(
  urlPath: string,
  period: TimePeriod = '30d'
): Promise<{ data?: ArticleDetailData; error?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { error: 'Non autorisé' };
    }

    const workspace = await getActiveWorkspace(user.id);
    const creator = await prisma.publication.findUnique({
      where: { id: workspace.publicationId },
      select: {
        id: true,
        umamiWebsiteId: true,
        articles: {
          select: {
            slug: true,
            title: true,
          },
        },
      },
    });

    if (!creator) return { error: 'Publication introuvable' };

    const targetWebsiteId =
      creator.umamiWebsiteId || process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || '';
    const matchedArticle = creator.articles.find(
      (a) => `/articles/${a.slug}` === urlPath || `/${a.slug}` === urlPath
    );
    const title = matchedArticle ? matchedArticle.title : urlPath;

    const now = Date.now();
    let startAt = now - 30 * 24 * 60 * 60 * 1000;
    let unit: 'hour' | 'day' = 'day';

    if (period === '24h') {
      startAt = now - 24 * 60 * 60 * 1000;
      unit = 'hour';
    } else if (period === '7d') {
      startAt = now - 7 * 24 * 60 * 60 * 1000;
    } else if (period === '90d') {
      startAt = now - 90 * 24 * 60 * 60 * 1000;
    }

    const [timeseries, referrers] = await Promise.all([
      fetchUmamiPageviewsSeries(targetWebsiteId, startAt, now, unit, urlPath),
      fetchUmamiReferrers(targetWebsiteId, startAt, now, 10, urlPath),
    ]);

    const totalViews = timeseries.reduce((acc, point) => acc + (point.y || 0), 0);

    return {
      data: {
        url: urlPath,
        title,
        timeseries,
        referrers,
        totalViews,
      },
    };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Erreur d'inspection" };
  }
}
