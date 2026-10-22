import type { Metadata } from 'next';
import { TenantCategoryRoute, generateTenantCategoryMetadata } from '@/lib/tenant-category-route';

interface PageProps {
  params: Promise<{ domain: string; categorySlug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domain, categorySlug } = await params;
  return generateTenantCategoryMetadata({ domain, categorySlug });
}

export default async function TenantCategoryPage({ params }: PageProps) {
  const { domain, categorySlug } = await params;
  return TenantCategoryRoute({ domain, categorySlug });
}
