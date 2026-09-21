// =====================================================================
// 🗺️ sitemap-lib — Index de sitemaps shardé (apps/core, qoefi)
// =====================================================================
// Couverture "catalogue complet" (chaque article publié est listé, même à
// des milliers, comme les tweets) : l'API Go expose un catalogue SEO slim
// (/v1/seo/sitemap-articles, sans contenu), découpé en shards de 1000 URLs.
//
// Les routes sont EXPLICITES (pas de generateSitemaps magique) :
//   /sitemap                     → index (statique + créateurs + shards)
//   /sitemaps/<name>.xml         → shard (static | creators | articles-N)
//
// (Pas d'extension sur l'index : les dossiers de route avec point sont
// refusés par Next. Google accepte n'importe quelle URL de sitemap.)
//
// Public, sans session : fetch direct SANS goFetch (cookies() interdit).
// Public, sans session : fetch direct SANS goFetch (cookies() interdit).
// =====================================================================

export const SITEMAP_REVALIDATE = 3600; // Cache d'une heure

// Taille d'un shard (limite protocole : 50 000 URLs / 50 Mo ; 1000 garde
// chaque shard léger et régénérable vite).
export const SHARD_SIZE = 1000;
// Plafond de shards (1M d'articles — sous la limite protocole de 50 000
// sitemaps par index).
export const MAX_SHARDS = 1000;

const GO_API_URL = (process.env.QOE_API_URL || 'http://localhost:8090').replace(/\/$/, '');

export function siteBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://qoe.fi').replace(/\/$/, '');
}

async function fetchPublic<T>(path: string): Promise<T | null> {
  try {
    // next.revalidate (pas no-store) : le prerender de build reste possible
    // (API injoignable au build → null gracieux), puis régénération horaire.
    const res = await fetch(`${GO_API_URL}${path}`, { next: { revalidate: SITEMAP_REVALIDATE } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch (err) {
    console.error(`[sitemap] GET ${path}:`, err);
    return null;
  }
}

interface SitemapCatalog {
  items: Array<{ slug: string; owner: string; updatedAt?: string }>;
  total: number;
}

interface SitemapThoughts {
  items: Array<{ id: string; authorUsername: string; updatedAt?: string }>;
  total: number;
}

interface SitemapLegal {
  items: Array<{ slug: string }>;
}

interface ApiSuggestedCreator {
  username?: string | null;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function articleShardCount(): Promise<number> {
  try {
    const res = await fetchPublic<SitemapCatalog>('/v1/seo/sitemap-articles?limit=1&offset=0');
    const total = res && typeof res.total === 'number' ? res.total : 0;
    return Math.min(Math.max(Math.ceil(total / SHARD_SIZE), 1), MAX_SHARDS);
  } catch {
    return 1;
  }
}

export async function thoughtShardCount(): Promise<number> {
  try {
    const res = await fetchPublic<SitemapThoughts>('/v1/seo/sitemap-thoughts?limit=1&offset=0');
    const total = res && typeof res.total === 'number' ? res.total : 0;
    return Math.min(Math.max(Math.ceil(total / SHARD_SIZE), 1), MAX_SHARDS);
  } catch {
    return 1;
  }
}

export async function legalUrls(): Promise<
  Array<{ loc: string; lastmod: string; changefreq: string; priority: string }>
> {
  const base = siteBaseUrl();
  const now = new Date().toISOString();
  const urls = [{ loc: `${base}/legal`, lastmod: now, changefreq: 'monthly', priority: '0.5' }];
  try {
    const res = await fetchPublic<SitemapLegal>('/v1/legal');
    if (res?.items && Array.isArray(res.items)) {
      for (const doc of res.items) {
        if (doc.slug) {
          urls.push({
            loc: `${base}/legal/${encodeURIComponent(doc.slug)}`,
            lastmod: now,
            changefreq: 'monthly',
            priority: '0.5',
          });
        }
      }
    }
  } catch (err) {
    console.error('[sitemap] legal:', err);
  }
  return urls;
}

export async function thoughtUrls(
  offset: number,
  limit: number
): Promise<Array<{ loc: string; lastmod: string; changefreq: string; priority: string }>> {
  const base = siteBaseUrl();
  try {
    const res = await fetchPublic<SitemapThoughts>(
      `/v1/seo/sitemap-thoughts?limit=${limit}&offset=${offset}`
    );
    if (!res?.items || !Array.isArray(res.items)) return [];
    return res.items
      .filter((t) => Boolean(t.id) && Boolean(t.authorUsername))
      .map((t) => ({
        loc: `${base}/${encodeURIComponent(t.authorUsername)}/thought/${encodeURIComponent(t.id)}`,
        lastmod: t.updatedAt || new Date().toISOString(),
        changefreq: 'weekly',
        priority: '0.6',
      }));
  } catch (err) {
    console.error('[sitemap] thoughts shard:', err);
    return [];
  }
}

export function staticUrls(): Array<{
  loc: string;
  lastmod: string;
  changefreq: string;
  priority: string;
}> {
  const base = siteBaseUrl();
  const now = new Date().toISOString();
  return [
    { loc: `${base}/home`, lastmod: now, changefreq: 'daily', priority: '1.0' },
    { loc: `${base}/search`, lastmod: now, changefreq: 'weekly', priority: '0.7' },
  ];
}

export async function creatorUrls(): Promise<
  Array<{ loc: string; lastmod: string; changefreq: string; priority: string }>
> {
  const base = siteBaseUrl();
  try {
    const creators = await fetchPublic<ApiSuggestedCreator[]>('/v1/home/suggested-creators');
    if (!Array.isArray(creators)) return [];
    const now = new Date().toISOString();
    return creators
      .filter((c) => Boolean(c.username))
      .map((c) => ({
        loc: `${base}/${encodeURIComponent(c.username!)}`,
        lastmod: now,
        changefreq: 'weekly',
        priority: '0.7',
      }));
  } catch (err) {
    console.error('[sitemap] creators:', err);
    return [];
  }
}

export async function articleUrls(
  offset: number,
  limit: number
): Promise<Array<{ loc: string; lastmod: string; changefreq: string; priority: string }>> {
  const base = siteBaseUrl();
  try {
    const res = await fetchPublic<SitemapCatalog>(
      `/v1/seo/sitemap-articles?limit=${limit}&offset=${offset}`
    );
    if (!res?.items || !Array.isArray(res.items)) return [];
    return res.items
      .filter((art) => Boolean(art.slug) && Boolean(art.owner))
      .map((art) => ({
        loc: `${base}/${encodeURIComponent(art.owner)}/${encodeURIComponent(art.slug)}`,
        lastmod: art.updatedAt || new Date().toISOString(),
        changefreq: 'weekly',
        priority: '0.8',
      }));
  } catch (err) {
    console.error('[sitemap] articles shard:', err);
    return [];
  }
}

export function renderUrlset(
  urls: Array<{ loc: string; lastmod: string; changefreq: string; priority: string }>
): string {
  const body = urls
    .map(
      (u) =>
        `<url><loc>${esc(u.loc)}</loc><lastmod>${esc(u.lastmod)}</lastmod>` +
        `<changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`;
}

export function renderIndex(locs: string[]): string {
  const now = new Date().toISOString();
  const body = locs
    .map((loc) => `<sitemap><loc>${esc(loc)}</loc><lastmod>${now}</lastmod></sitemap>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</sitemapindex>`;
}

export function xmlResponse(xml: string): Response {
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
