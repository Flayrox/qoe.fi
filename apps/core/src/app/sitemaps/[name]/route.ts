import {
  SHARD_SIZE,
  MAX_SHARDS,
  staticUrls,
  creatorUrls,
  legalUrls,
  articleUrls,
  thoughtUrls,
  renderUrlset,
  xmlResponse,
} from '../../sitemap-lib';

// Littéral exigé par Next (pas de constante importée).
export const revalidate = 3600;

// GET /sitemaps/<name>.xml — un shard du catalogue :
// static | creators | legal | articles-{n} | thoughts-{n} (1000 URLs/shard).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> }
): Promise<Response> {
  const { name } = await params;
  if (name === 'static.xml') {
    return xmlResponse(renderUrlset(staticUrls()));
  }
  if (name === 'creators.xml') {
    return xmlResponse(renderUrlset(await creatorUrls()));
  }
  if (name === 'legal.xml') {
    return xmlResponse(renderUrlset(await legalUrls()));
  }
  const articles = /^articles-(\d+)\.xml$/.exec(name);
  if (articles) {
    const n = Number.parseInt(articles[1], 10);
    if (Number.isInteger(n) && n >= 0 && n < MAX_SHARDS) {
      return xmlResponse(renderUrlset(await articleUrls(n * SHARD_SIZE, SHARD_SIZE)));
    }
  }
  const thoughts = /^thoughts-(\d+)\.xml$/.exec(name);
  if (thoughts) {
    const n = Number.parseInt(thoughts[1], 10);
    if (Number.isInteger(n) && n >= 0 && n < MAX_SHARDS) {
      return xmlResponse(renderUrlset(await thoughtUrls(n * SHARD_SIZE, SHARD_SIZE)));
    }
  }
  return new Response('Not Found', { status: 404 });
}
