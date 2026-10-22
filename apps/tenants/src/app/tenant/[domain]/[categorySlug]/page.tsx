import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchTenantPublication, fetchTenantRecommendations } from '@/lib/tenant-data';
import { TenantPageRenderer } from '@/components/TenantPageRenderer';
import { getLanguage } from '@qoe/i18n/server';
import { findCategoryBySlug, filterArticlesByCategory } from '@qoe/ui/templates';

interface PageProps {
  params: Promise<{ domain: string; categorySlug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const lang = await getLanguage();
  const isFr = lang === 'fr';

  const { domain, categorySlug } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const decodedCategorySlug = decodeURIComponent(categorySlug);

  const publication = await fetchTenantPublication(decodedDomain);
  if (!publication) return {};

  const category = findCategoryBySlug(publication.categories || [], decodedCategorySlug);
  if (!category) return {};

  const title = `${category.name} | ${publication.name || decodedDomain}`;
  const description = isFr
    ? `Découvrez tous les articles de la rubrique ${category.name} sur ${publication.name || decodedDomain}.`
    : `Explore articles from ${category.name} on ${publication.name || decodedDomain}.`;

  const canonicalUrl = `https://${decodedDomain}/${encodeURIComponent(category.slug)}`;

  return {
    title,
    description,
    robots: {
      index: publication.allowIndexing,
      follow: publication.allowIndexing,
    },
    alternates: {
      canonical: canonicalUrl,
    },
    icons: publication.logoUrl ? { icon: publication.logoUrl } : undefined,
    openGraph: {
      title,
      description,
      url: canonicalUrl,
    },
  };
}

export default async function TenantCategoryFilterPage({ params }: PageProps) {
  const { domain, categorySlug } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const decodedCategorySlug = decodeURIComponent(categorySlug);

  const [publication, recommendations] = await Promise.all([
    fetchTenantPublication(decodedDomain),
    fetchTenantRecommendations(decodedDomain),
  ]);

  if (!publication) {
    return notFound();
  }

  const category = findCategoryBySlug(publication.categories || [], decodedCategorySlug);
  if (!category) {
    return notFound();
  }

  // Filtrage souverain et déterministe via le moteur de taxonomie partagé
  const filteredArticles = filterArticlesByCategory(
    publication.articles || [],
    category,
    publication.categories || []
  );

  return (
    <TenantPageRenderer
      scope="home"
      publication={publication}
      recommendations={recommendations}
      decodedDomain={decodedDomain}
      activeCategory={category}
      filteredArticles={filteredArticles}
    />
  );
}
