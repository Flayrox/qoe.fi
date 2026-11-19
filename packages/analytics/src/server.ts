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

/** Délai maximal accordé à l'API Umami (login compris) : un Umami qui ne
 * répond pas ne doit pas retenir le rendu du dashboard. */
export const UMAMI_TIMEOUT_MS = 5_000;

/** Invalide le token caché s'il s'agit bien de celui qui vient d'échouer. */
function invalidateToken(stale: string | null): void {
  if (stale !== null && cachedToken === stale) {
    cachedToken = null;
    cachedAt = 0;
  }
}

/**
 * GET authentifié vers l'API Umami, avec un rejeu unique sur 401 : un token
 * révoqué/expiré laissait sinon tout le dashboard vide pendant 4 h.
 * Renvoie `null` quand aucune authentification n'est configurée.
 */
async function fetchWithToken(url: string): Promise<Response | null> {
  const token = await getUmamiToken();
  if (!token) {
    return null;
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(UMAMI_TIMEOUT_MS),
  });
  if (res.status !== 401) {
    return res;
  }
  invalidateToken(token);
  const fresh = await getUmamiToken();
  if (!fresh || fresh === token) {
    return res;
  }
  return fetch(url, {
    headers: { Authorization: `Bearer ${fresh}` },
    signal: AbortSignal.timeout(UMAMI_TIMEOUT_MS),
  });
}

function getApiUrl(): string {
  const url = process.env.UMAMI_API_URL || 'https://api.umami.is/v1';
  return url.replace(/\/+$/, '');
}

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
    const apiUrl = getApiUrl();
    const res = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass }),
      signal: AbortSignal.timeout(UMAMI_TIMEOUT_MS),
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
  const apiUrl = getApiUrl();

  if (!websiteId) {
    return {
      pageviews: 0,
      visitors: 0,
      visits: 0,
      bounces: 0,
      totaltime: 0,
    };
  }

  try {
    const res = await fetchWithToken(
      `${apiUrl}/websites/${websiteId}/stats?startAt=${startAt}&endAt=${endAt}`
    );

    if (!res) {
      // Aucune authentification configurée : zéro plutôt qu'une erreur.
      return { pageviews: 0, visitors: 0, visits: 0, bounces: 0, totaltime: 0 };
    }

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
  const apiUrl = getApiUrl();

  if (!websiteId) {
    return [];
  }

  try {
    let endpoint = `${apiUrl}/websites/${websiteId}/pageviews?startAt=${startAt}&endAt=${endAt}&unit=${unit}`;
    if (url) {
      endpoint += `&url=${encodeURIComponent(url)}`;
    }

    const res = await fetchWithToken(endpoint);

    if (!res) {
      return [];
    }

    if (!res.ok) {
      console.warn(`Umami pageviews ${res.status} for ${websiteId}`);
      return [];
    }
    const data: unknown = await res.json();
    const rows = Array.isArray(data)
      ? data
      : Array.isArray((data as { pageviews?: unknown })?.pageviews)
        ? (data as { pageviews: unknown[] }).pageviews
        : [];
    return rows as UmamiTimeseriesPoint[];
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
  const apiUrl = getApiUrl();

  if (!websiteId) {
    return [];
  }

  try {
    let endpoint = `${apiUrl}/websites/${websiteId}/metrics?startAt=${startAt}&endAt=${endAt}&type=${type}&limit=${limit}`;
    if (url) {
      endpoint += `&url=${encodeURIComponent(url)}`;
    }

    const res = await fetchWithToken(endpoint);

    if (!res) {
      return [];
    }

    if (!res.ok) {
      console.warn(`Umami metrics ${type} ${res.status} for ${websiteId}`);
      return [];
    }
    // Une réponse inattendue ({error: …}, quota, proxy) ne doit jamais
    // remonter telle quelle : le dashboard appellerait `.map` sur un objet.
    const data: unknown = await res.json();
    return Array.isArray(data) ? (data as UmamiPageMetric[]) : [];
  } catch (error) {
    console.error(`Failed to fetch Umami metrics for type ${type}:`, error);
    return [];
  }
}
