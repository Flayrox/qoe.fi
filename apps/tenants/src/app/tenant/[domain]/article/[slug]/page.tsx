import { permanentRedirect } from 'next/navigation';
import { fetchTenantArticle } from '@/lib/tenant-data';
import { buildArticlePath } from '@qoe/utils';

interface PageProps {
  params: Promise<{ domain: string; slug: string }>;
}

/** Ancienne URL /article/{slug} → URL canonique /{categorie}/{slug}. */
export default async function LegacyArticlePage({ params }: PageProps) {
  const { domain, slug } = await params;
  const decodedDomain = decodeURIComponent(domain).toLowerCase();
  const decodedSlug = decodeURIComponent(slug);
  const bundle = await fetchTenantArticle(decodedDomain, decodedSlug);
  if (!bundle) permanentRedirect('/');
  permanentRedirect(buildArticlePath(bundle.article, bundle.publication.categories));
}
