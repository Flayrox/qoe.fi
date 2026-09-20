import {
  MAX_SHARDS,
  siteBaseUrl,
  articleShardCount,
  renderIndex,
  xmlResponse,
} from '../sitemap-lib';

// Littéral exigé par Next (pas de constante importée).
export const revalidate = 3600;

// GET /sitemap.xml — index : statique + créateurs + un shard par tranche
// de 1000 articles (couverture totale du catalogue, même à des milliers).
export async function GET(): Promise<Response> {
  const base = siteBaseUrl();
  const shards = await articleShardCount();
  const locs = [`${base}/sitemaps/static.xml`, `${base}/sitemaps/creators.xml`];
  const n = Math.min(Math.max(shards, 1), MAX_SHARDS);
  for (let i = 0; i < n; i++) {
    locs.push(`${base}/sitemaps/articles-${i}.xml`);
  }
  return xmlResponse(renderIndex(locs));
}
