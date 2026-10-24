import type { Metadata } from 'next';
import { TenantArticleRoute, generateTenantArticleMetadata } from '@/lib/tenant-article-route';

// `[slug]` correspond à la sous-rubrique : `/rubrique/sous-rubrique/article`.
interface PageProps {
  params: Promise<{
    domain: string;
    categorySlug: string;
    slug: string;
    articleSlug: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domain, categorySlug, slug, articleSlug } = await params;
  return generateTenantArticleMetadata({
    domain,
    categorySlug,
    subCategorySlug: slug,
    articleSlug,
  });
}

export default async function Page({ params }: PageProps) {
  const { domain, categorySlug, slug, articleSlug } = await params;
  return TenantArticleRoute({ domain, categorySlug, subCategorySlug: slug, articleSlug });
}
