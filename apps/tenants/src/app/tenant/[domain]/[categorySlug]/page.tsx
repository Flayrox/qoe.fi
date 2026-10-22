import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchTenantPublication, fetchTenantRecommendations } from '@/lib/tenant-data';
import { TenantPageRenderer } from '@/components/TenantPageRenderer';
import { getLanguage } from '@qoe/i18n/server';

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

  const category = (publication.categories || []).find((c) => c.slug === decodedCategorySlug);
  if (!category) return {};

  const title = `${category.name} | ${publication.name || decodedDomain}`;
  const description = isFr
    ? `Découvrez tous les articles de la rubrique ${category.name} sur ${publication.name || decodedDomain}.`
    : `Explore articles from ${category.name} on ${publication.name || decodedDomain}.`;

  const canonicalUrl = `https://${decodedDomain}/${encodeURIComponent(decodedCategorySlug)}`;

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

  const category = (publication.categories || []).find((c) => c.slug === decodedCategorySlug);
  if (!category) {
    return notFound();
  }

  // Si c'est une catégorie parente, on inclut aussi les articles de ses sous-catégories
  const subcategoryIds = new Set(
    (publication.categories || []).filter((c) => c.parentId === category.id).map((c) => c.id)
  );

  const subcategorySlugs = new Set(
    (publication.categories || []).filter((c) => c.parentId === category.id).map((c) => c.slug)
  );

  // Filtrer les articles de la publication pour cette catégorie ou ses sous-catégories
  const filteredArticles = (publication.articles || []).filter((art) => {
    if (art.published === false) return false;
    const catId = art.categoryId || (art.category as { id?: string } | undefined)?.id;
    const catSlug = art.category?.slug;

    // Correspondance directe de catégorie
    if (catSlug === decodedCategorySlug || catId === category.id) {
      return true;
    }

    // Si c'est une catégorie parente, inclure aussi les articles de ses sous-catégories
    if (catId && subcategoryIds.has(catId)) {
      return true;
    }
    if (catSlug && subcategorySlugs.has(catSlug)) {
      return true;
    }

    return false;
  });

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
