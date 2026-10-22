import type { Metadata } from 'next';
import { TenantArticleRoute, generateTenantArticleMetadata } from '@/lib/tenant-article-route';
import {
  TenantCategoryRoute,
  generateTenantCategoryMetadata,
  isTenantSubcategory,
} from '@/lib/tenant-category-route';

interface PageProps {
  params: Promise<{ domain: string; categorySlug: string; articleSlug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domain, categorySlug, articleSlug } = await params;
  if (await isTenantSubcategory(domain, categorySlug, articleSlug)) {
    return generateTenantCategoryMetadata({
      domain,
      categorySlug: articleSlug,
      requestedPath: `/${categorySlug}/${articleSlug}`,
    });
  }
  return generateTenantArticleMetadata({ domain, categorySlug, articleSlug });
}

export default async function Page({ params }: PageProps) {
  const { domain, categorySlug, articleSlug } = await params;
  if (await isTenantSubcategory(domain, categorySlug, articleSlug)) {
    return TenantCategoryRoute({
      domain,
      categorySlug: articleSlug,
      requestedPath: `/${categorySlug}/${articleSlug}`,
    });
  }
  return TenantArticleRoute({ domain, categorySlug, articleSlug });
}
