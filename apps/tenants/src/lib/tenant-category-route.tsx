import React from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchTenantPublication, fetchTenantRecommendations } from '@/lib/tenant-data';
import { TenantPageRenderer } from '@/components/TenantPageRenderer';
import { getLanguage } from '@qoe/i18n/server';
import { findCategoryBySlug, filterArticlesByCategory } from '@qoe/ui/templates';
import { buildCategoryPath } from '@qoe/utils';

interface TenantCategoryRouteParams {
  domain: string;
  categorySlug: string;
  /** Chemin réellement demandé (pour les URLs à deux segments). */
  requestedPath?: string;
}

export async function generateTenantCategoryMetadata({
  domain,
  categorySlug,
}: TenantCategoryRouteParams): Promise<Metadata> {
  const lang = await getLanguage();
  const isFr = lang === 'fr';

  const decodedDomain = decodeURIComponent(domain);
  const decodedCategorySlug = decodeURIComponent(categorySlug);

  const publication = await fetchTenantPublication(decodedDomain);
  if (!publication) return {};

  const category = findCategoryBySlug(publication.categories || [], decodedCategorySlug);
  if (!category) return {};

  const title = `${category.name} | ${publication.name || decodedDomain}`;
  const description =
    category.description?.trim() ||
    (isFr
      ? `Découvrez tous les articles de la rubrique ${category.name} sur ${publication.name || decodedDomain}.`
      : `Explore articles from ${category.name} on ${publication.name || decodedDomain}.`);

  const canonicalUrl = `https://${decodedDomain}${buildCategoryPath(
    category,
    publication.categories
  )}`;

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
      images: publication.headerImageUrl ? [{ url: publication.headerImageUrl }] : [],
    },
  };
}

export async function TenantCategoryRoute({
  domain,
  categorySlug,
  requestedPath,
}: TenantCategoryRouteParams) {
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

  const canonicalPath = buildCategoryPath(category, publication.categories);
  if ((requestedPath ?? `/${decodedCategorySlug}`) !== canonicalPath) {
    permanentRedirect(canonicalPath);
  }

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

/** Détermine si /{parent}/{second} désigne une sous-catégorie. */
export async function isTenantSubcategory(
  domain: string,
  parentSlug: string,
  candidateSlug: string
): Promise<boolean> {
  const publication = await fetchTenantPublication(decodeURIComponent(domain));
  if (!publication) return false;
  const parent = findCategoryBySlug(publication.categories || [], decodeURIComponent(parentSlug));
  const candidate = findCategoryBySlug(
    publication.categories || [],
    decodeURIComponent(candidateSlug)
  );
  return Boolean(parent && candidate && candidate.parentId === parent.id);
}
