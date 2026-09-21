import {
  MAX_SHARDS,
  siteBaseUrl,
  articleShardCount,
  thoughtShardCount,
  renderIndex,
  xmlResponse,
} from '../sitemap-lib';

// Littéral exigé par Next (pas de constante importée).
export const revalidate = 3600;

// GET /sitemap — index : statique + créateurs + légal + un shard par
// tranche de 1000 articles et 1000 pensées (couverture totale des
// catalogues, même à des milliers).
export async function GET(): Promise<Response> {
  const base = siteBaseUrl();
  const [articles, thoughts] = await Promise.all([articleShardCount(), thoughtShardCount()]);
  const locs = [
    `${base}/sitemaps/static.xml`,
    `${base}/sitemaps/creators.xml`,
    `${base}/sitemaps/legal.xml`,
  ];
  const pushShards = (prefix: string, count: number) => {
    const n = Math.min(Math.max(count, 1), MAX_SHARDS);
    for (let i = 0; i < n; i++) {
      locs.push(`${base}/sitemaps/${prefix}-${i}.xml`);
    }
  };
  pushShards('articles', articles);
  pushShards('thoughts', thoughts);
  return xmlResponse(renderIndex(locs));
}
