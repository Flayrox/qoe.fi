import { headers } from 'next/headers';
import { parseTenantHost } from '@qoe/config';
import { fetchPublicTenantPublication } from '@/lib/tenant-data';
import { buildPublicExcerpt } from '@qoe/utils';
import { ContentVisibility } from '@qoe/config';

export const revalidate = 3600;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function GET(): Promise<Response> {
  const headersList = await headers();
  const host = headersList.get('x-forwarded-host') || headersList.get('host') || '';
  const proto = headersList.get('x-forwarded-proto') || 'https';
  const baseUrl = `${proto}://${host}`;

  const { subdomain, isSystemDomain } = parseTenantHost(host);
  const targetDomain = !isSystemDomain && subdomain ? subdomain : host;
  if (!targetDomain) return new Response('Not found', { status: 404 });

  try {
    const pub = await fetchPublicTenantPublication(targetDomain);
    if (!pub || pub.allowIndexing === false) return new Response('Not found', { status: 404 });

    const items = (pub.articles || [])
      .filter((art) => art.published !== false && Boolean(art.slug))
      .slice(0, 30)
      .map((art) => {
        const description =
          buildPublicExcerpt(
            art.content || '',
            art.isPremium ? ContentVisibility.PAID_SUBSCRIBERS : ContentVisibility.PUBLIC,
            null,
            300
          ) || stripTags(art.content || '').slice(0, 300);
        return `    <item>
      <title>${escapeXml(art.title)}</title>
      <link>${baseUrl}/article/${encodeURIComponent(art.slug)}</link>
      <guid>${baseUrl}/article/${encodeURIComponent(art.slug)}</guid>
      <pubDate>${art.createdAt ? new Date(art.createdAt).toUTCString() : new Date().toUTCString()}</pubDate>
      <description>${escapeXml(description)}</description>
    </item>`;
      })
      .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(pub.name || targetDomain)}</title>
    <link>${baseUrl}/</link>
    <description>${escapeXml(pub.seoDescription || pub.bio || '')}</description>
${items}
  </channel>
</rss>`;

    return new Response(xml, {
      headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
    });
  } catch (err) {
    console.error('[tenants/rss] Error generating feed:', err);
    return new Response('Not found', { status: 404 });
  }
}
