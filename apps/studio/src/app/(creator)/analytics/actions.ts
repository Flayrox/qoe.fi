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
  // Go primaire (GET /v1/analytics/audience/insights) — fallback Prisma dev
  try {
    const go = await goFetch<AudienceInsights>(
      `/v1/analytics/audience/insights?publicationId=${encodeURIComponent(publicationId)}`
    );
    if (go?.creator && go?.platform) {
      return go;
    }
  } catch {
    // fallback dev ci-dessous
  }

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

    // Provenance fine (le plus poussé) : breakdown par source + hostname/referrer — Go-only (ReadingSession)
    let provenance: ProvenanceBreakdown = { bySource: [], byHostname: [], byReferrer: [] };
    try {
      provenance = await goFetch<ProvenanceBreakdown>(
        `/v1/analytics/provenance?publicationId=${workspace.publicationId}&period=7d`
      );
    } catch {
      provenance = { bySource: [], byHostname: [], byReferrer: [] };
    }

    // Publication légère : seul umamiWebsiteId est nécessaire (les métriques viennent du Go),
    // + les abonnés pour le fallback Prisma dev.
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
      },
    });

    if (!creator) {
      return { error: 'Publication introuvable' };
    }

    // attribution = articles de la publication + co-signés (attributedArticles couvre les deux)
    const allCreatorArticles = attributedArticles;

    // 🧭 Carte slugs → titres (TopPagesBlock) — construite depuis tous les articles attribués
    const articleTitlesMap: Record<string, string> = {};
    allCreatorArticles.forEach((article) => {
      articleTitlesMap[`/articles/${article.slug}`] = article.title;
      articleTitlesMap[`/${article.slug}`] = article.title;
    });

    // 📦 productMetrics — Go primaire (GET /v1/analytics/product-metrics), fallback Prisma dev
    let productMetrics: ProductMetrics;
    try {
      const go = await goFetch<GoProductMetrics>(
        `/v1/analytics/product-metrics?publicationId=${workspace.publicationId}`
      );
      productMetrics = {
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
    } catch {
      // Fallback dev — même calcul que l'ancien chemin Prisma, depuis attributedArticles
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
          ? Math.round(
              (completionRates.reduce((s, v) => s + v, 0) / completionRates.length) * 100
            ) / 100
          : 0;

      const deepReadsRate =
        completionRates.length > 0
          ? Math.round(
              (completionRates.filter((r) => r >= 0.75).length / completionRates.length) * 100
            )
          : 0;
      const skimsRate =
        completionRates.length > 0
          ? Math.round(
              (completionRates.filter((r) => r < 0.5).length / completionRates.length) * 100
            )
          : 0;
      const bouncesRate =
        completionRates.length > 0 ? Math.max(0, 100 - deepReadsRate - skimsRate) : 0;

      productMetrics = {
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
    }

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
    } else if (period === 'all') {
      startAt = 0;
      unit = 'day';
    }

    // 🎯 Vues PLEIN : agrégation par articleId (canonique, pas slug) via ReadingSession — Go-only
    // → un co-auteur reçoit 100% des vues de l'article co-signé, et /maison/slug ne fragmente pas
    // Fallback Prisma si Go indisponible (dev)
    let perArticleViewsMap = new Map<string, number>();
    let creatorTotalViews = 0;
    let timeseries: UmamiTimeseriesPoint[] = [];
    let attributedTopPages: UmamiPageMetric[] = [];
    try {
      const goStats = await goFetch<{
        perArticle: Record<string, number>;
        totalViews: number;
        dailySeries: Array<{ day: string; count: number }>;
      }>(`/v1/analytics/creator?publicationId=${workspace.publicationId}&period=${period}`);
      perArticleViewsMap = new Map(Object.entries(goStats.perArticle || {}));
      creatorTotalViews = goStats.totalViews || 0;
      const seriesByDayGo = new Map(goStats.dailySeries.map((r) => [r.day, r.count]));
      // Timeseries Go : on reconstruit sur la même fenêtre que le front (startAt → now)
      for (let d = new Date(startAt); d.getTime() <= now; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().slice(0, 10);
        timeseries.push({ x: new Date(d).toISOString(), y: seriesByDayGo.get(key) || 0 });
      }
      const slugByIdGo = new Map(attributedArticles.map((a) => [a.id, `/articles/${a.slug}`]));
      attributedTopPages = Array.from(perArticleViewsMap.entries())
        .map(([articleId, y]) => ({ x: slugByIdGo.get(articleId) || articleId, y }))
        .sort((a, b) => b.y - a.y)
        .slice(0, 10);
    } catch {
      const attributedArticleIds = attributedArticles.map((a) => a.id);
      const perArticleDb = await prisma.readingSession.groupBy({
        by: ['articleId'],
        where:
          period === 'all'
            ? { articleId: { in: attributedArticleIds } }
            : { articleId: { in: attributedArticleIds }, createdAt: { gte: new Date(startAt) } },
        _count: { _all: true },
      });
      perArticleViewsMap = new Map(perArticleDb.map((r) => [r.articleId, r._count._all]));
      creatorTotalViews = perArticleViewsMap.size
        ? Array.from(perArticleViewsMap.values()).reduce((s, v) => s + v, 0)
        : 0;
      const slugById = new Map(attributedArticles.map((a) => [a.id, `/articles/${a.slug}`]));
      attributedTopPages = Array.from(perArticleViewsMap.entries())
        .map(([articleId, y]) => ({ x: slugById.get(articleId) || articleId, y }))
        .sort((a, b) => b.y - a.y)
        .slice(0, 10);
      void attributedSlugSet;
      const rawSeries = await prisma.$queryRawUnsafe<Array<{ day: string; cnt: number }>>(
        `SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') as day, COUNT(*)::int as cnt
         FROM "ReadingSession"
         WHERE "articleId" = ANY($1::text[]) AND "createdAt" >= to_timestamp($2/1000.0)
         GROUP BY date_trunc('day', "createdAt")
         ORDER BY day`,
        attributedArticleIds,
        startAt
      );
      const seriesByDay = new Map(rawSeries.map((r) => [r.day, r.cnt]));
      for (let d = new Date(startAt); d.getTime() <= now; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().slice(0, 10);
        timeseries.push({ x: new Date(d).toISOString(), y: seriesByDay.get(key) || 0 });
      }
    }

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

    // Résout l'article par slug (global) — articleId canonique, pas url_path
    const slug = urlPath.replace(/^\/articles\//, '').replace(/^\//, '');
    const matchedArticle = await prisma.article.findFirst({
      where: { slug },
      select: { id: true, title: true },
    });
    const title =
      matchedArticle?.title || creator.articles.find((a) => a.slug === slug)?.title || urlPath;

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
    } else if (period === 'all') {
      startAt = 0;
      unit = 'day';
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

    // VUES SUR L'ÉCRIT + Évolution : lectures réelles sur CET articleId (plein, peu importe le tenant/category)
    // Pour 'all', totalViews = tout l'historique, mais timeseries = 90j pour le graphique (évite 50 ans de points)
    const isAll = period === 'all';
    const seriesStartAt = isAll ? now - 90 * 24 * 60 * 60 * 1000 : startAt;
    const rawSeries = isAll
      ? await prisma.$queryRawUnsafe<Array<{ day: string; cnt: number }>>(
          `SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') as day, COUNT(*)::int as cnt
           FROM "ReadingSession"
           WHERE "articleId" = $1 AND "createdAt" >= to_timestamp($2/1000.0)
           GROUP BY date_trunc('day', "createdAt")
           ORDER BY day`,
          matchedArticle.id,
          seriesStartAt
        )
      : await prisma.$queryRawUnsafe<Array<{ day: string; cnt: number }>>(
          `SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') as day, COUNT(*)::int as cnt
           FROM "ReadingSession"
           WHERE "articleId" = $1 AND "createdAt" >= to_timestamp($2/1000.0)
           GROUP BY date_trunc('day', "createdAt")
           ORDER BY day`,
          matchedArticle.id,
          startAt
        );
    const seriesByDay = new Map(rawSeries.map((r) => [r.day, r.cnt]));
    const timeseries: UmamiTimeseriesPoint[] = [];
    for (let d = new Date(seriesStartAt); d.getTime() <= now; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      timeseries.push({ x: new Date(d).toISOString(), y: seriesByDay.get(key) || 0 });
    }
    const totalViews = isAll
      ? await prisma.readingSession.count({ where: { articleId: matchedArticle.id } })
      : timeseries.reduce((acc, p) => acc + (p.y || 0), 0);

    // Sources pour cet article (hostname/referrer) — provenance fine (toutes les données envoyées)
    const byHost = isAll
      ? await prisma.readingSession.groupBy({
          by: ['hostname'],
          where: { articleId: matchedArticle.id },
          _count: { _all: true },
        })
      : await prisma.readingSession.groupBy({
          by: ['hostname'],
          where: { articleId: matchedArticle.id, createdAt: { gte: new Date(startAt) } },
          _count: { _all: true },
        });
    const referrers: UmamiPageMetric[] = byHost
      .filter((h) => h.hostname)
      .map((h) => ({ x: h.hostname!, y: h._count._all }))
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
