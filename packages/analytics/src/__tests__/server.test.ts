import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchUmamiWebsiteStats, fetchUmamiPageviewsSeries, fetchUmamiMetrics } from '../server';

const originalFetch = globalThis.fetch;

function mockFetch(handler: (url: string, init?: RequestInit) => Promise<unknown>) {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const body = await handler(url, init);
    return {
      ok: true,
      status: 200,
      json: async () => body,
    } as Response;
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.resetModules();
  delete process.env.UMAMI_API_KEY;
  delete process.env.UMAMI_USERNAME;
  delete process.env.UMAMI_PASSWORD;
  process.env.UMAMI_API_URL = 'https://umami.test';
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('fetchUmamiWebsiteStats', () => {
  it('utilise l’API key en Bearer quand elle est définie (mode cloud)', async () => {
    let authHeader: string | undefined;
    mockFetch(async (_url, init) => {
      authHeader = (init?.headers as Record<string, string> | undefined)?.Authorization;
      return { pageviews: 10, visitors: 5, visits: 6, bounces: 1, totaltime: 9000 };
    });
    process.env.UMAMI_API_KEY = 'cloud-key';

    const stats = await fetchUmamiWebsiteStats('web-1', 1000, 2000);
    expect(stats?.pageviews).toBe(10);
    expect(authHeader).toBe('Bearer cloud-key');
  });

  it('fait un login self-hosted et réutilise le token en cache', async () => {
    const calls: string[] = [];
    mockFetch(async (url) => {
      calls.push(url);
      if (url.includes('/auth/login')) {
        return { token: 'tok-123' };
      }
      return { pageviews: 42, visitors: 7, visits: 8, bounces: 2, totaltime: 12000 };
    });
    process.env.UMAMI_USERNAME = 'admin';
    process.env.UMAMI_PASSWORD = 'secret';

    const first = await fetchUmamiWebsiteStats('web-1', 1000, 2000);
    const second = await fetchUmamiWebsiteStats('web-1', 1000, 2000);

    expect(first?.pageviews).toBe(42);
    expect(second?.pageviews).toBe(42);
    expect(calls.filter((u) => u.includes('/auth/login')).length).toBe(1);
    expect(calls.filter((u) => u.includes('/websites/web-1/stats')).length).toBe(2);
  });

  it('retourne des zéros quand aucune auth n’est configurée (hors dev)', async () => {
    const stats = await fetchUmamiWebsiteStats('web-1', 1000, 2000);
    expect(stats).toEqual({ pageviews: 0, visitors: 0, visits: 0, bounces: 0, totaltime: 0 });
  });
});

describe('fetchUmamiPageviewsSeries', () => {
  it('parse la réponse { pageviews: [...] }', async () => {
    mockFetch(async () => ({
      pageviews: [
        { x: '2026-08-19T00:00:00.000Z', y: 3 },
        { x: '2026-08-18T00:00:00.000Z', y: 5 },
      ],
    }));
    process.env.UMAMI_API_KEY = 'cloud-key';

    const series = await fetchUmamiPageviewsSeries('web-1', 1000, 2000, 'day');
    expect(series).toHaveLength(2);
    expect(series[0]).toEqual({ x: '2026-08-19T00:00:00.000Z', y: 3 });
  });
});

describe('fetchUmamiMetrics', () => {
  it('construit le bon endpoint et parse la liste', async () => {
    let calledUrl = '';
    mockFetch(async (url) => {
      calledUrl = url;
      return [
        { x: 'FR', y: 12 },
        { x: 'BE', y: 4 },
      ];
    });
    process.env.UMAMI_API_KEY = 'cloud-key';

    const metrics = await fetchUmamiMetrics('web-1', 1000, 2000, 'country', 5);
    expect(calledUrl).toContain('/websites/web-1/metrics');
    expect(calledUrl).toContain('type=country');
    expect(calledUrl).toContain('limit=5');
    expect(metrics).toHaveLength(2);
    expect(metrics[0].x).toBe('FR');
  });
});
