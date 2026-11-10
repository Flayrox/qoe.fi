import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { fetchTenantPublisher, fetchTenantRecommendations } from '@/lib/tenant-data';
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

  // Go-first : GET /v1/publishers/by-domain/{domain}.
  const publisher = await fetchTenantPublisher(decodedDomain);

  if (!publisher) return {};

  const defaultDesc = isFr
    ? `Découvrez les écrits et analyses de ${publisher.name || decodedDomain}.`
    : `Explore the articles and insights of ${publisher.name || decodedDomain}.`;

  const title = publisher.seoTitle || `${publisher.name} | ${decodedDomain}`;
  const description = publisher.seoDescription || publisher.heroText || defaultDesc;
  const canonicalUrl = `https://${decodedDomain}`;

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
      locale: isFr ? 'fr_FR' : 'en_US',
      title: publisher.seoTitle || publisher.name || decodedDomain,
      description,
      url: canonicalUrl,
      images: publisher.headerImageUrl ? [{ url: publisher.headerImageUrl }] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: publisher.seoTitle || publisher.name || decodedDomain,
      description,
      images: publisher.headerImageUrl ? [publisher.headerImageUrl] : [],
    },
  };
}

export default async function TenantHomepage({ params }: PageProps) {
  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);

  // Go-first : GET /v1/publishers/by-domain/{domain} — publication avec
  // navigation, réseaux sociaux, catégories, articles et recommandations.
  const [publisher, recommendations] = await Promise.all([
    fetchTenantPublisher(decodedDomain),
    fetchTenantRecommendations(decodedDomain),
  ]);

  if (!publisher) {
    return notFound();
  }

  return (
    <TenantPageRenderer
      scope="home"
      publisher={publisher}
      recommendations={recommendations}
      decodedDomain={decodedDomain}
    />
  );
}
