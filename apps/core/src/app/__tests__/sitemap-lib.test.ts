// =====================================================================
// 🧪 sitemap-lib — index shardé, URLs canoniques, XML valide
// =====================================================================
// Un sitemap faux n'échoue pas bruyamment : il fait indexer des 404, ou pire,
// il exclut des articles. On verrouille donc les bornes de shards, les URLs
// produites, et l'échappement XML (un slug avec « & » cassait le document).
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@qoe/config', () => ({
  getLandingAppUrl: () => 'https://landing.qoe.fi',
}));

import {
  articleShardCount,
  articleUrls,
  creatorUrls,
  legalUrls,
  MAX_SHARDS,
  renderIndex,
  renderUrlset,
  SHARD_SIZE,
  siteBaseUrl,
  staticUrls,
  thoughtShardCount,
  thoughtUrls,
  xmlResponse,
} from '../sitemap-lib';

function jsonOnce(payload: unknown, ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    json: async () => payload,
  });
}

describe('sitemap-lib', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://qoe.fi/');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('déduit un shard unique quand le catalogue est vide ou illisible', async () => {
    vi.stubGlobal('fetch', jsonOnce({ items: [], total: 0 }));
    expect(await articleShardCount()).toBe(1);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('API injoignable')));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await articleShardCount()).toBe(1);
    expect(await thoughtShardCount()).toBe(1);
  });

  it('découpe le catalogue en shards de la taille annoncée, plafonnés', async () => {
    vi.stubGlobal('fetch', jsonOnce({ items: [], total: SHARD_SIZE * 3 + 1 }));
    expect(await articleShardCount()).toBe(4);

    vi.stubGlobal('fetch', jsonOnce({ items: [], total: SHARD_SIZE * (MAX_SHARDS + 50) }));
    expect(await articleShardCount()).toBe(MAX_SHARDS);
  });

  it('construit des URLs d’articles encodées et ignore les entrées incomplètes', async () => {
    vi.stubGlobal(
      'fetch',
      jsonOnce({
        items: [
          { slug: 'le-silence', owner: 'ada', updatedAt: '2026-10-01T00:00:00.000Z' },
          { slug: '', owner: 'ada' },
          { slug: 'orphelin', owner: '' },
        ],
        total: 3,
      })
    );

    const urls = await articleUrls(0, 10);

    expect(urls).toEqual([
      {
        loc: 'https://qoe.fi/ada/le-silence',
        lastmod: '2026-10-01T00:00:00.000Z',
        changefreq: 'weekly',
        priority: '0.8',
      },
    ]);
  });

  it('rend une liste vide plutôt qu’un sitemap partiel quand l’API échoue', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));

    expect(await articleUrls(0, 10)).toEqual([]);
    expect(await thoughtUrls(0, 10)).toEqual([]);
    expect(await creatorUrls()).toEqual([]);
  });

  it('encode les identifiants de pensées et de créateurs', async () => {
    vi.stubGlobal(
      'fetch',
      jsonOnce({
        items: [{ id: 'th 1', authorUsername: 'ada l', updatedAt: '2026-10-02T00:00:00.000Z' }],
      })
    );
    const thoughts = await thoughtUrls(0, 100);
    expect(thoughts[0].loc).toBe('https://qoe.fi/ada%20l/thought/th%201');

    vi.stubGlobal('fetch', jsonOnce([{ username: 'ada' }, { username: null }, {}]));
    expect(await creatorUrls()).toEqual([
      {
        loc: 'https://qoe.fi/ada',
        lastmod: expect.any(String),
        changefreq: 'weekly',
        priority: '0.7',
      },
    ]);
  });

  it('pointe les pages légales vers la vitrine, pas vers l’app lecteur', async () => {
    vi.stubGlobal(
      'fetch',
      jsonOnce({ items: [{ slug: 'mentions' }, { slug: 'confidentialite' }] })
    );

    const urls = await legalUrls();

    expect(urls.map((u) => u.loc)).toEqual([
      'https://landing.qoe.fi/legal',
      'https://landing.qoe.fi/legal/mentions',
      'https://landing.qoe.fi/legal/confidentialite',
    ]);
  });

  it('expose les pages fixes sur la base publique sans double slash', () => {
    expect(siteBaseUrl()).toBe('https://qoe.fi');
    expect(staticUrls().map((u) => u.loc)).toEqual([
      'https://qoe.fi/home',
      'https://qoe.fi/search',
    ]);
  });

  it('échappe le XML : un slug avec « & » ne casse pas le document', () => {
    const xml = renderUrlset([
      {
        loc: 'https://qoe.fi/ada/a&b<c>',
        lastmod: '2026-10-01T00:00:00.000Z',
        changefreq: 'weekly',
        priority: '0.8',
      },
    ]);

    expect(xml).toContain('<loc>https://qoe.fi/ada/a&amp;b&lt;c&gt;</loc>');
    expect(xml).not.toMatch(/a&b/);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  it('rend un index de sitemaps valide', () => {
    const xml = renderIndex(['https://qoe.fi/sitemaps/static.xml']);

    expect(xml).toContain('<sitemapindex');
    expect(xml).toContain('<loc>https://qoe.fi/sitemaps/static.xml</loc>');
  });

  it('sert le XML avec le bon type de contenu', () => {
    const response = xmlResponse('<urlset/>');

    expect(response.headers.get('Content-Type')).toBe('application/xml; charset=utf-8');
    expect(response.status).toBe(200);
  });
});
