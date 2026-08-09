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
  x: string; // URL path or title
  y: number; // View count
}

/**
 * 📊 Track un event depuis le serveur (s'écrit dans les logs).
 */
export async function trackServerEvent(
  event: string,
  data?: Record<string, unknown>
) {
  console.log(
    JSON.stringify({
      type: "analytics:event",
      event,
      data,
      timestamp: new Date().toISOString(),
    })
  );
}

/**
 * 📊 Récupère les métriques de trafic créateur depuis l'API Server Umami.
 */
export async function fetchUmamiWebsiteStats(
  websiteId: string,
  startAt: number,
  endAt: number
): Promise<UmamiStats | null> {
  const apiUrl = process.env.UMAMI_API_URL || "https://api.umami.is/v1";
  const apiKey = process.env.UMAMI_API_KEY;

  if (!websiteId || !apiKey) {
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
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    if (!res.ok) return null;
    return (await res.json()) as UmamiStats;
  } catch (error) {
    console.error("Failed to fetch Umami website stats:", error);
    return null;
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
  const apiUrl = process.env.UMAMI_API_URL || "https://api.umami.is/v1";
  const apiKey = process.env.UMAMI_API_KEY;

  if (!websiteId || !apiKey) {
    return [];
  }

  try {
    const res = await fetch(
      `${apiUrl}/websites/${websiteId}/metrics?startAt=${startAt}&endAt=${endAt}&type=url&limit=${limit}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    if (!res.ok) return [];
    return (await res.json()) as UmamiPageMetric[];
  } catch (error) {
    console.error("Failed to fetch Umami top pages:", error);
    return [];
  }
}
