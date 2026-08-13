'use server';

import { createClient } from '@qoe/supabase/server';
import { prisma } from '@qoe/db/client';
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
}

export interface ArticleDetailData {
  url: string;
  title: string;
  timeseries: UmamiTimeseriesPoint[];
  referrers: UmamiPageMetric[];
  totalViews: number;
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

    const creator = await prisma.user.findUnique({
      where: { id: user.id },
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

    if (!creator) {
      return { error: 'Profil créateur introuvable' };
    }

    const articleTitlesMap: Record<string, string> = {};
    creator.articles.forEach((article) => {
      articleTitlesMap[`/articles/${article.slug}`] = article.title;
      articleTitlesMap[`/${article.slug}`] = article.title;
    });

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

    const creator = await prisma.user.findUnique({
      where: { id: user.id },
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

    if (!creator) return { error: 'Profil créateur introuvable' };

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
