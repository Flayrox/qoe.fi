import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getReferrerLabel } from '../referrers';

const originalFetch = globalThis.fetch;

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response;
}

describe('@qoe/analytics — referrers par hôte (L15)', () => {
  it("n'attribue pas un réseau social à une URL qui contient juste « t.co »", () => {
    expect(getReferrerLabel('https://example.com/t.co/article').category).toBe('Web Referrer');
    expect(getReferrerLabel('https://example.com/article?ref=linkedin').name).not.toBe('LinkedIn');
  });

  it("n'attribue pas un moteur de recherche à un chemin qui contient « google »", () => {
    expect(getReferrerLabel('https://myblog.com/google-analytics-guide').category).toBe(
      'Web Referrer'
    );
  });

  it('reconnaît quand même les vrais hôtes', () => {
    expect(getReferrerLabel('https://www.google.fr/search?q=qoe').name).toBe('Google Search');
    expect(getReferrerLabel('https://t.co/abc').name).toBe('X / Twitter');
    expect(getReferrerLabel('google.com').name).toBe('Google Search');
  });
});

describe('@qoe/analytics — client HTTP Umami (L15)', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.UMAMI_API_URL;
    process.env.UMAMI_API_KEY = 'cloud-key';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.UMAMI_API_KEY;
    delete process.env.UMAMI_USERNAME;
    delete process.env.UMAMI_PASSWORD;
    vi.restoreAllMocks();
  });

  it('borne chaque appel Umami par un AbortSignal', async () => {
    const calls: Array<RequestInit | undefined> = [];
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init);
      return jsonResponse({ pageviews: 1, visitors: 1, visits: 1, bounces: 0, totaltime: 1 });
    }) as unknown as typeof fetch;

    const { fetchUmamiWebsiteStats } = await import('../server');
    await fetchUmamiWebsiteStats('web-1', 1000, 2000);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('renouvelle le token et rejoue la requête après un 401', async () => {
    let logins = 0;
    let statsCalls = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/auth/login')) {
        logins += 1;
        return jsonResponse({ token: `tok-${logins}` });
      }
      statsCalls += 1;
      // Le premier token est révoqué côté Umami.
      if (statsCalls === 1) return jsonResponse({ error: 'unauthorized' }, 401);
      return jsonResponse({ pageviews: 7, visitors: 3, visits: 3, bounces: 1, totaltime: 42 });
    }) as unknown as typeof fetch;

    delete process.env.UMAMI_API_KEY;
    process.env.UMAMI_USERNAME = 'admin';
    process.env.UMAMI_PASSWORD = 'secret';

    const { fetchUmamiWebsiteStats } = await import('../server');
    const stats = await fetchUmamiWebsiteStats('web-1', 1000, 2000);

    expect(logins).toBe(2);
    expect(stats?.pageviews).toBe(7);
  });

  it('rend null sur erreur HTTP et aucun token sur login refusé', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes('/auth/login')
        ? jsonResponse({ error: 'bad credentials' }, 401)
        : jsonResponse({ error: 'boom' }, 500)
    ) as unknown as typeof fetch;

    delete process.env.UMAMI_API_KEY;
    process.env.UMAMI_USERNAME = 'admin';
    process.env.UMAMI_PASSWORD = 'wrong';

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { fetchUmamiWebsiteStats } = await import('../server');
    // Login refusé → aucune authentification → zéros (pas d'exception).
    await expect(fetchUmamiWebsiteStats('web-1', 1, 2)).resolves.toEqual({
      pageviews: 0,
      visitors: 0,
      visits: 0,
      bounces: 0,
      totaltime: 0,
    });

    // Avec une clé (HTTP 500), l'erreur remonte comme `null`.
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      jsonResponse({ error: 'boom' }, 500)
    );
    process.env.UMAMI_API_KEY = 'cloud-key';
    await expect(fetchUmamiWebsiteStats('web-1', 1, 2)).resolves.toBeNull();
    errorSpy.mockRestore();
    warn.mockRestore();
  });

  it('rend des valeurs vides sans websiteId, sans appeler le réseau', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { fetchUmamiMetrics, fetchUmamiPageviewsSeries, fetchUmamiWebsiteStats } =
      await import('../server');

    await expect(fetchUmamiMetrics('', 1, 2, 'url')).resolves.toEqual([]);
    await expect(fetchUmamiPageviewsSeries('', 1, 2)).resolves.toEqual([]);
    await expect(fetchUmamiWebsiteStats('', 1, 2)).resolves.toMatchObject({ pageviews: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rend des listes vides sur erreur HTTP', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ error: 'down' }, 503)
    ) as unknown as typeof fetch;
    const { fetchUmamiMetrics, fetchUmamiPageviewsSeries } = await import('../server');

    await expect(fetchUmamiMetrics('web-1', 1, 2, 'device')).resolves.toEqual([]);
    await expect(fetchUmamiPageviewsSeries('web-1', 1, 2)).resolves.toEqual([]);
    warn.mockRestore();
  });

  it('rend des listes vides quand le réseau lève', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    globalThis.fetch = vi.fn(async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch;
    const { fetchUmamiMetrics, fetchUmamiPageviewsSeries, fetchUmamiWebsiteStats } =
      await import('../server');

    await expect(fetchUmamiMetrics('web-1', 1, 2, 'os')).resolves.toEqual([]);
    await expect(fetchUmamiPageviewsSeries('web-1', 1, 2)).resolves.toEqual([]);
    await expect(fetchUmamiWebsiteStats('web-1', 1, 2)).resolves.toBeNull();
    errorSpy.mockRestore();
  });

  it('transmet le type, la limite et l’URL aux endpoints dérivés', async () => {
    const urls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return jsonResponse([{ x: 'a', y: 1 }]);
    }) as unknown as typeof fetch;

    const { fetchUmamiReferrers, fetchUmamiTopPages, fetchUmamiPageviewsSeries } =
      await import('../server');
    await fetchUmamiTopPages('web-1', 1, 2, 3);
    await fetchUmamiReferrers('web-1', 1, 2, 4, '/a b');
    await fetchUmamiPageviewsSeries('web-1', 1, 2, 'hour', '/a b');

    expect(urls[0]).toContain('type=url');
    expect(urls[0]).toContain('limit=3');
    expect(urls[1]).toContain('type=referrer');
    expect(urls[1]).toContain('limit=4');
    expect(urls[1]).toContain('url=%2Fa%20b');
    expect(urls[2]).toContain('unit=hour');
    expect(urls[2]).toContain('url=%2Fa%20b');
  });

  it('journalise un event serveur en JSON structuré', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { trackServerEvent } = await import('../server');

    await trackServerEvent('article_published', { articleId: 'a-1' });

    const payload = JSON.parse(String(logSpy.mock.calls[0]?.[0])) as {
      type: string;
      event: string;
      data: { articleId: string };
    };
    expect(payload.type).toBe('analytics:event');
    expect(payload.event).toBe('article_published');
    expect(payload.data.articleId).toBe('a-1');
    logSpy.mockRestore();
  });

  it("rend une liste vide quand l'API répond un objet inattendu", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ error: 'quota exceeded' })
    ) as unknown as typeof fetch;

    const { fetchUmamiMetrics, fetchUmamiPageviewsSeries } = await import('../server');
    await expect(fetchUmamiMetrics('web-1', 1000, 2000, 'country')).resolves.toEqual([]);
    await expect(fetchUmamiPageviewsSeries('web-1', 1000, 2000)).resolves.toEqual([]);
  });
});

describe('@qoe/analytics — lecture : logique réelle du paquet (L15)', () => {
  it('classe les sessions depuis la fonction réellement utilisée par le hook', async () => {
    const { classifyReadingStatus } = await import('../reading');
    expect(classifyReadingStatus(5, 15, 5)).toBe('BOUNCE');
    expect(classifyReadingStatus(20, 90, 5)).toBe('SKIM');
    expect(classifyReadingStatus(120, 95, 5)).toBe('READ_COMPLETE');
    expect(classifyReadingStatus(60, 50, 5)).toBe('READ_PARTIAL');
  });

  it('résout la source depuis la fonction réellement utilisée par le hook', async () => {
    const { resolveReadingSource } = await import('../reading');
    expect(resolveReadingSource({ search: '?ref=feed', pathname: '/a', hostname: 'qoe.fi' })).toBe(
      'feed'
    );
    expect(
      resolveReadingSource({ search: '?ref=profile', pathname: '/a', hostname: 'qoe.fi' })
    ).toBe('public_profile');
    expect(resolveReadingSource({ pathname: '/a', hostname: 'theophile.qoe.fi' })).toBe(
      'subdomain'
    );
    expect(resolveReadingSource({ pathname: '/a', hostname: 'qoe.fi' })).toBe('direct');
    expect(resolveReadingSource({ pathname: '/a', hostname: 'studio.qoe.fi' })).toBe('direct');
  });

  it('ne prend pas les hôtes produit pour des tenants', async () => {
    const { resolveReadingProvenanceFrom } = await import('../reading');
    expect(resolveReadingProvenanceFrom({ pathname: '/a', hostname: 'theophile.qoe.fi' })).toEqual({
      hostname: 'theophile.qoe.fi',
      referrerUsername: null,
    });
    expect(
      resolveReadingProvenanceFrom({ pathname: '/a', hostname: 'studio.qoe.fi' }).hostname
    ).toBeNull();
    expect(
      resolveReadingProvenanceFrom({ pathname: '/a', hostname: 'api.qoe.fi' }).hostname
    ).toBeNull();
    expect(
      resolveReadingProvenanceFrom({ pathname: '/a', hostname: 'studio.qoe.test' }).hostname
    ).toBeNull();
    expect(
      resolveReadingProvenanceFrom({ pathname: '/a', hostname: 'qoe.fi' }).hostname
    ).toBeNull();
  });

  it('gère les cas limites d’hôte et de source', async () => {
    const { tenantHostname, resolveReadingSource, classifyReadingStatus } =
      await import('../reading');
    expect(tenantHostname('')).toBeNull();
    expect(tenantHostname('QOE.FI')).toBeNull();
    expect(tenantHostname('a.b.qoe.fi')).toBe('a.b.qoe.fi');
    expect(tenantHostname('evilqoe.fi')).toBeNull();
    expect(resolveReadingSource({ pathname: '/home', hostname: 'qoe.fi' })).toBe('feed');
    expect(
      resolveReadingSource({ pathname: '/x', hostname: 'qoe.fi', search: '?source=author' })
    ).toBe('public_profile');
    // Temps de lecture nul/absurde : le seuil est borné à 1 min (21 s à 35 %),
    // donc 10 s à 90 % reste un survol et non une lecture complète.
    expect(classifyReadingStatus(10, 90, 0)).toBe('SKIM');
  });

  it('extrait le username référent des formats supportés', async () => {
    const { resolveReadingProvenanceFrom } = await import('../reading');
    expect(
      resolveReadingProvenanceFrom({
        pathname: '/a',
        hostname: 'qoe.fi',
        search: '?ref=profile:simone',
      }).referrerUsername
    ).toBe('simone');
    expect(
      resolveReadingProvenanceFrom({ pathname: '/@simone', hostname: 'qoe.fi' }).referrerUsername
    ).toBe('simone');
  });
});
