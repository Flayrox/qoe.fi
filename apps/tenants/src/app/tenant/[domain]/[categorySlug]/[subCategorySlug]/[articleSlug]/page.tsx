import type { Metadata } from 'next';
import { TenantArticleRoute, generateTenantArticleMetadata } from '@/lib/tenant-article-route';

interface PageProps {
  params: Promise<{
    domain: string;
    categorySlug: string;
    subCategorySlug: string;
    articleSlug: string;
  }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domain, categorySlug, subCategorySlug, articleSlug } = await params;
  return generateTenantArticleMetadata({ domain, categorySlug, subCategorySlug, articleSlug });
}

export default async function Page({ params }: PageProps) {
  const { domain, categorySlug, subCategorySlug, articleSlug } = await params;
  return TenantArticleRoute({ domain, categorySlug, subCategorySlug, articleSlug });
}
