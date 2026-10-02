import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Metadata } from 'next';
import { JsonLd, buildWebSiteSchema } from '@qoe/ui';
import {
  TemplateRenderer,
  parseLayoutConfig,
  type TemplatePublicationContext,
  type TemplateArticleItem,
} from '@qoe/ui/templates';
import { t } from '@lingui/core/macro';
import { fetchTenantPublication, fetchTenantRecommendations } from '@/lib/tenant-data';
import { RecommendedSection } from '@/components/RecommendedSection';
import { buildPublicDescription, sliceContentAtPaywall } from '@qoe/utils';
import { ContentVisibility } from '@qoe/config';
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

  const {
    name,
    heroText,
    accentColor,
    fontFamily,
    logoUrl,
    articles = [],
    headerImageUrl,
    footerText,
    layoutStyle,
    themeMode,
    navigation,
    socialLinks,
    stripeAccountId,
    supportUrl,
  } = publication;

  // 🔒 Zéro-fuite : les extraits des cartes sont dérivés du contenu DÉJÀ tronqué
  // par le paywall. Rendre `article.content` brut exposait le passage réservé
  // aux visiteurs non authentifiés (et aux crawlers) dès la page d'accueil.
  const articleExcerpts = new Map(
    articles.map((article) => {
      const cut = sliceContentAtPaywall(
        article.content || '',
        { isMember: false, isPaidSubscriber: false },
        article.isPremium ? ContentVisibility.PAID_SUBSCRIBERS : ContentVisibility.PUBLIC
      );
      return [article.id, buildPublicDescription(cut.content, 250) ?? ''];
    })
  );

  const jsonLdData = buildWebSiteSchema({
    name: name || decodedDomain,
    url: `https://${decodedDomain}`,
    description: heroText || undefined,
  });

  const layoutConfig = parseLayoutConfig(layoutStyle, {
    accentColor,
    fontFamily,
  });

  const templatePub: TemplatePublicationContext = {
    id: publication.id,
    name,
    slug: publication.slug,
    domain: decodedDomain,
    subdomain: publication.subdomain,
    customDomain: publication.customDomain,
    logoUrl,
    heroText,
    headerImageUrl,
    footerText,
    accentColor,
    fontFamily,
    themeMode,
    stripeAccountId,
    supportUrl,
    navigation: navigation.map((n) => ({
      id: n.id,
      label: n.label,
      url: n.url,
      order: n.order,
      isExternal: n.isExternal,
      publicationId: publication.id,
      parentId: n.parentId,
    })),
    socialLinks: socialLinks.map((s) => ({
      id: s.id,
      platform: s.platform,
      url: s.url,
      order: s.order,
      publicationId: publication.id,
    })),
  };

  const templateArticles: TemplateArticleItem[] = articles.map((article) => ({
    id: article.id,
    title: article.title,
    slug: article.slug,
    content: article.content,
    excerpt: articleExcerpts.get(article.id) || '',
    readingTime: article.readingTime,
    isPremium: article.isPremium,
    publishedAt: article.createdAt,
    category: article.category
      ? { name: article.category.name, slug: article.category.slug }
      : null,
  }));

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors selection:bg-[var(--tenant-accent)] selection:text-white">
      <JsonLd data={jsonLdData} />
      <TemplateRenderer
        config={layoutConfig}
        publication={templatePub}
        articles={templateArticles}
        mode="live"
      />
      {recommendations && recommendations.length > 0 && (
        <div className="container mx-auto px-4 lg:px-8 py-12 border-t border-border">
          <RecommendedSection authorName={name} recommendations={recommendations} />
        </div>
      )}
    </div>
  );
}
