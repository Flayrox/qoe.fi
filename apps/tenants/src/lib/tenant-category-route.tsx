import React from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchTenantPublisher, fetchTenantRecommendations } from '@/lib/tenant-data';
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

  const publisher = await fetchTenantPublisher(decodedDomain);
  if (!publisher) return {};

  const category = findCategoryBySlug(publisher.categories || [], decodedCategorySlug);
  if (!category) return {};

  const title = `${category.name} | ${publisher.name || decodedDomain}`;
  const description =
    category.description?.trim() ||
    (isFr
      ? `Découvrez tous les articles de la rubrique ${category.name} sur ${publisher.name || decodedDomain}.`
      : `Explore articles from ${category.name} on ${publisher.name || decodedDomain}.`);

  const canonicalUrl = `https://${decodedDomain}${buildCategoryPath(
    category,
    publisher.categories
  )}`;

  return {
    title,
    description,
    robots: {
      index: publisher.allowIndexing,
      follow: publisher.allowIndexing,
    },
    alternates: {
      canonical: canonicalUrl,
    },
    icons: publisher.logoUrl ? { icon: publisher.logoUrl } : undefined,
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      images: publisher.headerImageUrl ? [{ url: publisher.headerImageUrl }] : [],
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

  const [publisher, recommendations] = await Promise.all([
    fetchTenantPublisher(decodedDomain),
    fetchTenantRecommendations(decodedDomain),
  ]);

  if (!publisher) {
    return notFound();
  }

  const category = findCategoryBySlug(publisher.categories || [], decodedCategorySlug);
  if (!category) {
    return notFound();
  }

  const canonicalPath = buildCategoryPath(category, publisher.categories);
  if ((requestedPath ?? `/${decodedCategorySlug}`) !== canonicalPath) {
    permanentRedirect(canonicalPath);
  }

  const filteredArticles = filterArticlesByCategory(
    publisher.articles || [],
    category,
    publisher.categories || []
  );

  return (
    <TenantPageRenderer
      scope="home"
      publisher={publisher}
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
  const publisher = await fetchTenantPublisher(decodeURIComponent(domain));
  if (!publisher) return false;
  const parent = findCategoryBySlug(publisher.categories || [], decodeURIComponent(parentSlug));
  const candidate = findCategoryBySlug(
    publisher.categories || [],
    decodeURIComponent(candidateSlug)
  );
  return Boolean(parent && candidate && candidate.parentId === parent.id);
}
