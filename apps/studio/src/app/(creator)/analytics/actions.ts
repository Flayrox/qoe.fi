'use server';

import { createClient } from '@qoe/supabase/server';
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
import { goFetch } from '@qoe/sdk/actions/utils/go-client';

export type TimePeriod = '24h' | '7d' | '30d' | '90d' | 'all';

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

// Contrat Go GET /v1/analytics/product-metrics (source primaire de productMetrics)
export interface GoProductMetrics {
  subscriberCount: number;
  subscriberDelta7d: number;
  totalBookmarks: number;
  totalHighlights: number;
  totalInteractions: number;
  avgCompletionRate: number;
  readingQuality: {
    deepReadsRate: number;
    skimsRate: number;
    bouncesRate: number;
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
    publishedAt: string | null;
  }[];
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

function emptyDemographics(): AudienceDemographics {
  return { declared: 0, gender: [], ageRange: [], countries: [], languages: [] };
}

async function getAudienceInsights(publicationId: string): Promise<AudienceInsights> {
  // Go : GET /v1/analytics/audience/insights.
  try {
    const go = await goFetch<AudienceInsights>(
      `/v1/analytics/audience/insights?publicationId=${encodeURIComponent(publicationId)}`
    );
    if (go?.creator && go?.platform) {
      return go;
    }
  } catch {
    // API indisponible → démographie vide (best-effort).
  }
  return { creator: emptyDemographics(), platform: emptyDemographics() };
}

// Contrat Go GET /v1/settings/publication (umamiWebsiteId + articles pour les titres).
interface SettingsPublicationLite {
  id: string;
  umamiWebsiteId: string | null;
  articles: { id: string; slug: string; title: string }[];
}

async function fetchPublicationLite(publicationId: string): Promise<SettingsPublicationLite> {
  return goFetch<SettingsPublicationLite>(
    `/v1/settings/publication?publicationId=${encodeURIComponent(publicationId)}`
  );
}

// Contrat Go GET /v1/analytics/creator.
interface CreatorReadingStats {
  perArticle: Record<string, number>;
  totalViews: number;
  dailySeries: { day: string; count: number }[];
}

// Contrat Go GET /v1/analytics/reading-sessions.
interface ArticleReadingStats {
  articleId: string;
  totalViews: number;
  timeseries: { day: string; count: number }[];
  byHostname: { key: string; count: number }[];
  bySource: { key: string; count: number }[];
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

    // Publication légère (umamiWebsiteId + articles pour le map slug → titre).
    const pubLite = await fetchPublicationLite(workspace.publicationId);

    // Provenance fine (le plus poussé) : breakdown par source + hostname/referrer — Go-only
    let provenance: ProvenanceBreakdown = { bySource: [], byHostname: [], byReferrer: [] };
    try {
      provenance = await goFetch<ProvenanceBreakdown>(
        `/v1/analytics/provenance?publicationId=${workspace.publicationId}&period=7d`
      );
    } catch {
      provenance = { bySource: [], byHostname: [], byReferrer: [] };
    }

    // 🧭 Carte slugs → titres (TopPagesBlock) — depuis les articles de la publication.
    const articleTitlesMap: Record<string, string> = {};
    pubLite.articles.forEach((article) => {
      articleTitlesMap[`/articles/${article.slug}`] = article.title;
      articleTitlesMap[`/${article.slug}`] = article.title;
    });

    // 📦 productMetrics — Go (GET /v1/analytics/product-metrics).
    const go = await goFetch<GoProductMetrics>(
      `/v1/analytics/product-metrics?publicationId=${workspace.publicationId}`
    );
    const productMetrics: ProductMetrics = {
      subscriberCount: go.subscriberCount,
      subscriberDelta7d: go.subscriberDelta7d,
      totalBookmarks: go.totalBookmarks,
      totalHighlights: go.totalHighlights,
      totalInteractions: go.totalInteractions,
      avgCompletionRate: go.avgCompletionRate,
      readingQuality: go.readingQuality,
      trafficSources: {
        feed: 0,
        subdomain: 0,
        publicProfile: 0,
        direct: 0,
      },
      topCategories: go.topCategories,
      topArticles: go.topArticles.map((a) => ({
        slug: a.slug,
        title: a.title,
        completionRate: a.completionRate,
        bookmarks: a.bookmarks,
        comments: a.comments,
        highlights: a.highlights,
        highlightsPublic: a.highlightsPublic,
        highlightsPrivate: a.highlightsPrivate,
        annotations: a.annotations,
        interactions: a.interactions,
        publishedAt: a.publishedAt ? new Date(a.publishedAt) : null,
      })),
    };

    const audience = await getAudienceInsights(pubLite.id);

    const targetWebsiteId =
      pubLite.umamiWebsiteId || process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID || '';

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
    } else if (period === 'all') {
      startAt = 0;
      unit = 'day';
    }

    // 🎯 Vues PLEIN : agrégation par articleId (canonique) via ReadingSession — Go-only
    const goStats = await goFetch<CreatorReadingStats>(
      `/v1/analytics/creator?publicationId=${workspace.publicationId}&period=${period}`
    );
    const perArticleViewsMap = new Map(Object.entries(goStats.perArticle || {}));
    const creatorTotalViews = goStats.totalViews || 0;
    const seriesByDayGo = new Map(goStats.dailySeries.map((r) => [r.day, r.count]));
    const timeseries: UmamiTimeseriesPoint[] = [];
    for (let d = new Date(startAt); d.getTime() <= now; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      timeseries.push({ x: new Date(d).toISOString(), y: seriesByDayGo.get(key) || 0 });
    }
    const slugByIdGo = new Map(pubLite.articles.map((a) => [a.id, `/articles/${a.slug}`]));
    const attributedTopPages: UmamiPageMetric[] = Array.from(perArticleViewsMap.entries())
      .map(([articleId, y]) => ({ x: slugByIdGo.get(articleId) || articleId, y }))
      .sort((a, b) => b.y - a.y)
      .slice(0, 10);

    // Pour compat Umami, garde aussi le global pour visiteurs/visites, mais pageviews = DB plein
    const globalStats = await fetchUmamiWebsiteStats(targetWebsiteId, startAt, now);
    const creatorStats: UmamiStats | null = globalStats
      ? { ...globalStats, pageviews: creatorTotalViews }
      : { pageviews: creatorTotalViews, visitors: 0, visits: 0, bounces: 0, totaltime: 0 };
    // Referrers/devices restent Umami global (device/browser/country non stockés en DB)
    const [referrers, devices, browsers, countries] = await Promise.all([
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
      pubLite.id,
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
    const pubLite = await fetchPublicationLite(workspace.publicationId);

    // Résout l'article par slug dans la publication (articleId canonique).
    const slug = urlPath.replace(/^\/articles\//, '').replace(/^\//, '');
    let matchedArticle: { id: string; title: string } | null =
      pubLite.articles.find((a) => a.slug.toLowerCase() === slug.toLowerCase()) ?? null;
    let title =
      matchedArticle?.title || pubLite.articles.find((a) => a.slug === slug)?.title || urlPath;

    // Fallback : article co-signé (attribution) — GET /v1/articles/{slug}?publicationId=.
    if (!matchedArticle) {
      try {
        const article = await goFetch<{ id: string; title: string }>(
          `/v1/articles/${encodeURIComponent(slug)}?publicationId=${encodeURIComponent(
            workspace.publicationId
          )}`
        );
        matchedArticle = { id: article.id, title: article.title };
        title = article.title;
      } catch {
        matchedArticle = null;
      }
    }

    if (!matchedArticle) {
      return {
        data: {
          url: urlPath,
          title,
          timeseries: [],
          referrers: [],
          totalViews: 0,
        },
      };
    }

    // VUES SUR L'ÉCRIT + Évolution : lectures réelles sur CET articleId — Go-only
    // (GET /v1/analytics/reading-sessions). Pour 'all', totalViews = tout
    // l'historique, mais timeseries = 90j pour le graphique.
    const isAll = period === 'all';
    const now = Date.now();
    const seriesStartAt = isAll ? now - 90 * 24 * 60 * 60 * 1000 : undefined;
    const stats = await goFetch<ArticleReadingStats>(
      `/v1/analytics/reading-sessions?articleId=${encodeURIComponent(matchedArticle.id)}&period=${period}`
    );

    const seriesByDay = new Map(stats.timeseries.map((r) => [r.day, r.count]));
    const timeseries: UmamiTimeseriesPoint[] = [];
    for (
      let d = new Date(
        seriesStartAt ?? now - (period === '24h' ? 24 * 3600 * 1000 : 30 * 24 * 3600 * 1000)
      );
      d.getTime() <= now;
      d.setDate(d.getDate() + 1)
    ) {
      const key = d.toISOString().slice(0, 10);
      timeseries.push({ x: new Date(d).toISOString(), y: seriesByDay.get(key) || 0 });
    }
    const totalViews = isAll
      ? stats.totalViews
      : timeseries.reduce((acc, p) => acc + (p.y || 0), 0);

    // Sources pour cet article (hostname) — provenance fine côté Go.
    const referrers: UmamiPageMetric[] = (stats.byHostname || [])
      .filter((h) => h.key)
      .map((h) => ({ x: h.key, y: h.count }))
      .sort((a, b) => b.y - a.y)
      .slice(0, 10);

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
