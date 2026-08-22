// =====================================================================
// 📊 Server Analytics — Pour Server Actions & Dashboard Telemetry
// =====================================================================

export interface UmamiStats {
  pageviews: number;
  visitors: number;
  visits: number;
  bounces: number;
  totaltime: number;
}

export interface UmamiPageMetric {
  x: string; // URL path, referrer, device, browser, country, etc.
  y: number; // View count or metric value
}

export interface UmamiTimeseriesPoint {
  x: string; // Date / Time label (ISO string)
  y: number; // Pageviews count
}

// ── Auth self-hosted (Umami v2+) ────────────────────────────────────────────
// Umami Cloud utilise une API key statique (UMAMI_API_KEY) ; le self-hosted
// s'authentifie par login (UMAMI_USERNAME / UMAMI_PASSWORD) → token Bearer
// caché ~4h (même stratégie que le client Go apps/api/internal/umami).
let cachedToken: string | null = null;
let cachedAt = 0;

async function getUmamiToken(): Promise<string | null> {
  const apiKey = process.env.UMAMI_API_KEY;
  if (apiKey) return apiKey;

  const user = process.env.UMAMI_USERNAME;
  const pass = process.env.UMAMI_PASSWORD;
  if (!user || !pass) return null;

  if (cachedToken && Date.now() - cachedAt < 4 * 60 * 60 * 1000) {
    return cachedToken;
  }
  try {
    const apiUrl = process.env.UMAMI_API_URL || 'https://api.umami.is/v1';
    const res = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass }),
    });
    if (!res.ok) {
      console.error(`Umami login failed (${res.status})`);
      return null;
    }
    const data = (await res.json()) as { token?: string };
    cachedToken = data.token ?? null;
    cachedAt = Date.now();
    return cachedToken;
  } catch (error) {
    console.error('Failed to authenticate to Umami:', error);
    return null;
  }
}

/**
 * 📊 Track un event depuis le serveur (s'écrit dans les logs).
 */
export async function trackServerEvent(event: string, data?: Record<string, unknown>) {
  console.log(
    JSON.stringify({
      type: 'analytics:event',
      event,
      data,
      timestamp: new Date().toISOString(),
    })
  );
}

/**
 * 📊 Récupère les métriques globales de trafic créateur depuis l'API Server Umami.
 */
export async function fetchUmamiWebsiteStats(
  websiteId: string,
  startAt: number,
  endAt: number
): Promise<UmamiStats | null> {
  const apiUrl = process.env.UMAMI_API_URL || 'https://api.umami.is/v1';
  const token = await getUmamiToken();

  if (!websiteId || !token) {
    return {
      pageviews: 0,
      visitors: 0,
      visits: 0,
      bounces: 0,
      totaltime: 0,
    };
  }

  try {
    const res = await fetch(
      `${apiUrl}/websites/${websiteId}/stats?startAt=${startAt}&endAt=${endAt}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!res.ok) {
      console.warn(`Umami stats ${res.status} for ${websiteId}`);
      return null;
    }
    return (await res.json()) as UmamiStats;
  } catch (error) {
    console.error('Failed to fetch Umami website stats:', error);
    return null;
  }
}

/**
 * 📊 Récupère la série temporelle d'évolution des vues de pages (Timeseries).
 */
export async function fetchUmamiPageviewsSeries(
  websiteId: string,
  startAt: number,
  endAt: number,
  unit: 'hour' | 'day' = 'day',
  url?: string
): Promise<UmamiTimeseriesPoint[]> {
  const apiUrl = process.env.UMAMI_API_URL || 'https://api.umami.is/v1';
  const token = await getUmamiToken();

  if (!websiteId || !token) {
    return [];
  }

  try {
    let endpoint = `${apiUrl}/websites/${websiteId}/pageviews?startAt=${startAt}&endAt=${endAt}&unit=${unit}`;
    if (url) {
      endpoint += `&url=${encodeURIComponent(url)}`;
    }

    const res = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      console.warn(`Umami pageviews ${res.status} for ${websiteId}`);
      return [];
    }
    const data = (await res.json()) as { pageviews?: unknown[] } | unknown[];
    const rows = Array.isArray(data) ? data : data?.pageviews;
    return (rows || []) as UmamiTimeseriesPoint[];
  } catch (error) {
    console.error('Failed to fetch Umami pageviews series:', error);
    return [];
  }
}

/**
 * 📊 Récupère le top des pages/articles les plus vus d'un créateur.
 */
export async function fetchUmamiTopPages(
  websiteId: string,
  startAt: number,
  endAt: number,
  limit: number = 10
): Promise<UmamiPageMetric[]> {
  return fetchUmamiMetrics(websiteId, startAt, endAt, 'url', limit);
}

/**
 * 📊 Récupère les sources de trafic (Referrers) d'un créateur.
 */
export async function fetchUmamiReferrers(
  websiteId: string,
  startAt: number,
  endAt: number,
  limit: number = 10,
  url?: string
): Promise<UmamiPageMetric[]> {
  return fetchUmamiMetrics(websiteId, startAt, endAt, 'referrer', limit, url);
}

/**
 * 📊 Fonction générique pour récupérer les métriques d'audience (device, os, browser, country, url, referrer).
 */
export async function fetchUmamiMetrics(
  websiteId: string,
  startAt: number,
  endAt: number,
  type: 'url' | 'referrer' | 'device' | 'os' | 'browser' | 'country',
  limit: number = 10,
  url?: string
): Promise<UmamiPageMetric[]> {
  const apiUrl = process.env.UMAMI_API_URL || 'https://api.umami.is/v1';
  const token = await getUmamiToken();

  if (!websiteId || !token) {
    return [];
  }

  try {
    let endpoint = `${apiUrl}/websites/${websiteId}/metrics?startAt=${startAt}&endAt=${endAt}&type=${type}&limit=${limit}`;
    if (url) {
      endpoint += `&url=${encodeURIComponent(url)}`;
    }

    const res = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      console.warn(`Umami metrics ${type} ${res.status} for ${websiteId}`);
      return [];
    }
    return (await res.json()) as UmamiPageMetric[];
  } catch (error) {
    console.error(`Failed to fetch Umami metrics for type ${type}:`, error);
    return [];
  }
}
