import { notFound, permanentRedirect } from 'next/navigation';
import { buildArticlePath } from '@qoe/utils';
import { fetchArticleByShortCode, fetchTenantPublisher } from '@/lib/tenant-data';
import { decodeUrlSegment } from '@qoe/config/article-url';
import { normalizeTenantDomain } from '@/lib/tenant-domain';

interface PageProps {
  params: Promise<{ domain: string; code: string }>;
}

export default async function TenantShortArticlePage({ params }: PageProps) {
  const { domain, code } = await params;
  const decodedDomain = normalizeTenantDomain(domain);
  const decodedCode = decodeUrlSegment(code);

  const [article, publisher] = await Promise.all([
    fetchArticleByShortCode(decodedCode),
    fetchTenantPublisher(decodedDomain),
  ]);

  if (!article) {
    notFound();
  }

  const canonicalPath = buildArticlePath(article, publisher?.categories || []);
  permanentRedirect(canonicalPath);
}
