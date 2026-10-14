import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { fetchTenantPublication, fetchTenantRecommendations } from '@/lib/tenant-data';
import { TenantPageRenderer } from '@/components/TenantPageRenderer';
import { getLanguage } from '@qoe/i18n/server';

interface PageProps {
  params: Promise<{ domain: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const lang = await getLanguage();
  const isFr = lang === 'fr';

  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);

  // Go-first : GET /v1/publications/by-domain/{domain}.
  const publication = await fetchTenantPublication(decodedDomain);

  if (!publication) return {};

  const defaultDesc = isFr
    ? `Découvrez les écrits et analyses de ${publication.name || decodedDomain}.`
    : `Explore the articles and insights of ${publication.name || decodedDomain}.`;

  const title = publication.seoTitle || `${publication.name} | ${decodedDomain}`;
  const description = publication.seoDescription || publication.heroText || defaultDesc;
  const canonicalUrl = `https://${decodedDomain}`;

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
      locale: isFr ? 'fr_FR' : 'en_US',
      title: publication.seoTitle || publication.name || decodedDomain,
      description,
      url: canonicalUrl,
      images: publication.headerImageUrl ? [{ url: publication.headerImageUrl }] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: publication.seoTitle || publication.name || decodedDomain,
      description,
      images: publication.headerImageUrl ? [publication.headerImageUrl] : [],
    },
  };
}

export default async function TenantHomepage({ params }: PageProps) {
  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);

  // Go-first : GET /v1/publications/by-domain/{domain} — publication avec
  // navigation, réseaux sociaux, catégories, articles et recommandations.
  const [publication, recommendations] = await Promise.all([
    fetchTenantPublication(decodedDomain),
    fetchTenantRecommendations(decodedDomain),
  ]);

  if (!publication) {
    return notFound();
  }

  return (
    <TenantPageRenderer
      scope="home"
      publication={publication}
      recommendations={recommendations}
      decodedDomain={decodedDomain}
    />
  );
}
