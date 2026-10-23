'use server';

import { createClient } from '@qoe/supabase/server';
import { getActiveWorkspace } from '@/lib/active-workspace';
import {
  fetchUmamiWebsiteStats,
  fetchUmamiReferrers,
  fetchUmamiMetrics,
  UmamiStats,
  UmamiPageMetric,
  UmamiTimeseriesPoint,
} from '@qoe/analytics/server';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import type { FeatureSignalSummary } from '@/features/upcoming/actions';

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
  /** Intérêt porté aux fonctionnalités à venir / Pro (90 j, espace actif). */
  featureInterest: FeatureSignalSummary[];
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
  likes: number;
  bookmarks: number;
  comments: number;
  highlights: number;
  highlightsPublic: number;
  highlightsPrivate: number;
  annotations: number;
  reposts: number;
  totalInteractions: number;
  completionRate: number;
}

// Contrat Go GET /v1/analytics/product-metrics (source primaire de productMetrics)
export interface GoProductMetrics {
  subscriberCount: number;
  subscriberDelta7d: number;
  totalArticles: number;
  totalLikes: number;
  totalBookmarks: number;
  totalHighlights: number;
  totalHighlightsPublic: number;
  totalHighlightsPrivate: number;
  totalComments: number;
  totalAnnotations: number;
  totalReposts: number;
  totalInteractions: number;
  avgLikesPerArticle: number;
  avgBookmarksPerArticle: number;
  avgCommentsPerArticle: number;
  avgHighlightsPerArticle: number;
  avgInteractionsPerArticle: number;
  avgCompletionRate: number;
  readingQuality: {
    deepReadsRate: number;
    skimsRate: number;
    bouncesRate: number;
  };
  topCategories: { name: string; count: number }[];
  topArticles: {
    id?: string;
    slug: string;
    title: string;
    completionRate: number;
    bookmarks: number;
    comments: number;
    highlights: number;
    highlightsPublic: number;
    highlightsPrivate: number;
    annotations: number;
    likes: number;
    reposts: number;
    interactions: number;
    publishedAt: string | null;
  }[];
}

export interface ProductMetrics {
  subscriberCount: number;
  subscriberDelta7d: number;
  totalArticles: number;
  totalLikes: number;
  totalBookmarks: number;
  totalHighlights: number;
  totalHighlightsPublic: number;
  totalHighlightsPrivate: number;
  totalComments: number;
  totalAnnotations: number;
  totalReposts: number;
  totalInteractions: number;
  avgLikesPerArticle: number;
  avgBookmarksPerArticle: number;
  avgCommentsPerArticle: number;
  avgHighlightsPerArticle: number;
  avgInteractionsPerArticle: number;
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
    id?: string;
    slug: string;
    title: string;
    completionRate: number;
    bookmarks: number;
    comments: number;
    highlights: number;
    highlightsPublic: number;
    highlightsPrivate: number;
    annotations: number;
    likes: number;
    reposts: number;
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

/**
 * Intérêt pour les fonctionnalités à venir (interstitiel @qoe/ui).
 * Statistique secondaire : l'API peut être indisponible sans casser la page.
 */
async function fetchFeatureInterest(publicationId: string): Promise<FeatureSignalSummary[]> {
  try {
    const res = await goFetch<{ signals: FeatureSignalSummary[] }>(
      `/v1/features/signals/summary?publicationId=${encodeURIComponent(publicationId)}`
    );
    return res.signals ?? [];
  } catch {
    return [];
  }
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
  likes?: number;
  bookmarks?: number;
  comments?: number;
  highlights?: number;
  highlightsPublic?: number;
  highlightsPrivate?: number;
  annotations?: number;
  reposts?: number;
  totalInteractions?: number;
  completionRate?: number;
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
      totalArticles: go.totalArticles ?? 0,
      totalLikes: go.totalLikes ?? 0,
      totalBookmarks: go.totalBookmarks,
      totalHighlights: go.totalHighlights,
      totalHighlightsPublic: go.totalHighlightsPublic ?? 0,
      totalHighlightsPrivate: go.totalHighlightsPrivate ?? 0,
      totalComments: go.totalComments ?? 0,
      totalAnnotations: go.totalAnnotations ?? 0,
      totalReposts: go.totalReposts ?? 0,
      totalInteractions: go.totalInteractions,
      avgLikesPerArticle: go.avgLikesPerArticle ?? 0,
      avgBookmarksPerArticle: go.avgBookmarksPerArticle ?? 0,
      avgCommentsPerArticle: go.avgCommentsPerArticle ?? 0,
      avgHighlightsPerArticle: go.avgHighlightsPerArticle ?? 0,
      avgInteractionsPerArticle: go.avgInteractionsPerArticle ?? 0,
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
        id: a.id,
        slug: a.slug,
        title: a.title,
        completionRate: a.completionRate,
        bookmarks: a.bookmarks,
        comments: a.comments,
        highlights: a.highlights,
        highlightsPublic: a.highlightsPublic,
        highlightsPrivate: a.highlightsPrivate,
        annotations: a.annotations,
        likes: a.likes ?? 0,
        reposts: a.reposts ?? 0,
        interactions: a.interactions,
        publishedAt: a.publishedAt ? new Date(a.publishedAt) : null,
      })),
    };

    const audience = await getAudienceInsights(pubLite.id);
    const featureInterest = await fetchFeatureInterest(workspace.publicationId);

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
          featureInterest,
        },
      };
    }

    const now = Date.now();
    let startAt = now - 30 * 24 * 60 * 60 * 1000;

    if (period === '24h') {
      startAt = now - 24 * 60 * 60 * 1000;
    } else if (period === '7d') {
      startAt = now - 7 * 24 * 60 * 60 * 1000;
    } else if (period === '90d') {
      startAt = now - 90 * 24 * 60 * 60 * 1000;
    } else if (period === 'all') {
      // Pour l'historique complet ('all'), on garde les 90 derniers jours sur le graphique
      // temporel afin d'éviter d'itérer sur un demi-siècle, tout en conservant le total réel.
      startAt = now - 90 * 24 * 60 * 60 * 1000;
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
        featureInterest,
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
    const slug = urlPath
      .replace(/^\/(articles?)\//i, '')
      .replace(/^\/+/, '')
      .split(/[?#]/)[0];
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
          likes: 0,
          bookmarks: 0,
          comments: 0,
          highlights: 0,
          highlightsPublic: 0,
          highlightsPrivate: 0,
          annotations: 0,
          reposts: 0,
          totalInteractions: 0,
          completionRate: 0,
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
        likes: stats.likes ?? 0,
        bookmarks: stats.bookmarks ?? 0,
        comments: stats.comments ?? 0,
        highlights: stats.highlights ?? 0,
        highlightsPublic: stats.highlightsPublic ?? 0,
        highlightsPrivate: stats.highlightsPrivate ?? 0,
        annotations: stats.annotations ?? 0,
        reposts: stats.reposts ?? 0,
        totalInteractions: stats.totalInteractions ?? 0,
        completionRate: stats.completionRate ?? 0,
      },
    };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Erreur d'inspection" };
  }
}
