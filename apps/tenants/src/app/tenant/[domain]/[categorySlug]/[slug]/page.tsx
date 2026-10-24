import type { Metadata } from 'next';
import { TenantArticleRoute, generateTenantArticleMetadata } from '@/lib/tenant-article-route';
import {
  TenantCategoryRoute,
  generateTenantCategoryMetadata,
  isTenantSubcategory,
} from '@/lib/tenant-category-route';

// ⚠️ Le nom du segment dynamique (`[slug]`) est imposé par Next.js : il doit
// être identique pour tous les frères de ce niveau, dont
// `/[categorySlug]/[slug]/[articleSlug]`. Ce segment porte deux cas :
// une sous-rubrique (`/rubrique/sous-rubrique`) ou un article
// (`/rubrique/mon-article`).
interface PageProps {
  params: Promise<{ domain: string; categorySlug: string; slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domain, categorySlug, slug } = await params;
  if (await isTenantSubcategory(domain, categorySlug, slug)) {
    return generateTenantCategoryMetadata({
      domain,
      categorySlug: slug,
      requestedPath: `/${categorySlug}/${slug}`,
    });
  }
  return generateTenantArticleMetadata({ domain, categorySlug, articleSlug: slug });
}

export default async function Page({ params }: PageProps) {
  const { domain, categorySlug, slug } = await params;
  if (await isTenantSubcategory(domain, categorySlug, slug)) {
    return TenantCategoryRoute({
      domain,
      categorySlug: slug,
      requestedPath: `/${categorySlug}/${slug}`,
    });
  }
  return TenantArticleRoute({ domain, categorySlug, articleSlug: slug });
}
