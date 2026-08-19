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
}

export interface ArticleDetailData {
  url: string;
  title: string;
  timeseries: UmamiTimeseriesPoint[];
  referrers: UmamiPageMetric[];
  totalViews: number;
}

// Métriques produit (issues de la DB qoe.fi, pas d'Umami) : ce que Umami
// ne peut pas mesurer (abonnés, engagement, contenu).
export interface ProductMetrics {
  subscriberCount: number;
  subscriberDelta7d: number;
  totalBookmarks: number;
  totalHighlights: number;
  totalInteractions: number;
  topArticles: {
    slug: string;
    title: string;
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

const GENDER_LABELS: Record<string, string> = {
  FEMALE: 'Femme',
  MALE: 'Homme',
  NON_BINARY: 'Non-binaire',
  OTHER: 'Autre',
  PREFER_NOT_TO_SAY: 'Préfère ne pas dire',
};

const AGE_RANGE_LABELS: Record<string, string> = {
  UNDER_18: 'Moins de 18 ans',
  AGE_18_24: '18-24 ans',
  AGE_25_34: '25-34 ans',
  AGE_35_44: '35-44 ans',
  AGE_45_54: '45-54 ans',
  AGE_55_64: '55-64 ans',
  AGE_65_PLUS: '65 ans et +',
  PREFER_NOT_TO_SAY: 'Préfère ne pas dire',
};

export function labelDemographic(key: 'gender' | 'ageRange', value: string): string {
  if (key === 'gender') return GENDER_LABELS[value] ?? value;
  return AGE_RANGE_LABELS[value] ?? value;
}

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
            slug: true,
            title: true,
            createdAt: true,
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

    const articleTitlesMap: Record<string, string> = {};
    const topArticles = creator.articles
      .map((a) => {
        const highlightsPublic = a.highlights.filter((h) => h.isPublic).length;
        const highlightsPrivate = a.highlights.length - highlightsPublic;
        const annotations = a.highlights.reduce((s, h) => s + h._count.comments, 0);
        const interactions =
          a._count.bookmarks + a._count.comments + a._count.highlights + annotations;
        return {
          slug: a.slug,
          title: a.title,
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
    creator.articles.forEach((article) => {
      articleTitlesMap[`/articles/${article.slug}`] = article.title;
      articleTitlesMap[`/${article.slug}`] = article.title;
    });

    const productMetrics: ProductMetrics = {
      subscriberCount: creator._count.subscribers,
      subscriberDelta7d: creator.subscribers.length,
      totalBookmarks: topArticles.reduce((s, a) => s + a.bookmarks, 0),
      totalHighlights: topArticles.reduce((s, a) => s + a.highlights, 0),
      totalInteractions: topArticles.reduce((s, a) => s + a.interactions, 0),
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

    const [stats, timeseries, topPages, referrers, devices, browsers, countries] =
      await Promise.all([
        fetchUmamiWebsiteStats(targetWebsiteId, startAt, now),
        fetchUmamiPageviewsSeries(targetWebsiteId, startAt, now, unit),
        fetchUmamiTopPages(targetWebsiteId, startAt, now, 10),
        fetchUmamiReferrers(targetWebsiteId, startAt, now, 10),
        fetchUmamiMetrics(targetWebsiteId, startAt, now, 'device', 5),
        fetchUmamiMetrics(targetWebsiteId, startAt, now, 'browser', 5),
        fetchUmamiMetrics(targetWebsiteId, startAt, now, 'country', 5),
      ]);

    return {
      data: {
        configured: true,
        websiteId: targetWebsiteId,
        period,
        stats,
        timeseries,
        topPages,
        referrers,
        devices,
        browsers,
        countries,
        articleTitlesMap,
        productMetrics,
        audience,
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
