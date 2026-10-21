import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { fetchTenantPublication } from '@/lib/tenant-data';
import { TenantPageShell } from '@/components/TenantPageShell';
import { TenantSearchClient, type SearchArticleItem } from './TenantSearchClient';
import {
  MinimalCraftShell,
  resolveTheme,
  type TemplatePublicationContext,
} from '@qoe/ui/templates';

interface PageProps {
  params: Promise<{ domain: string }>;
  searchParams: Promise<{ q?: string; mode?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);
  const publication = await fetchTenantPublication(decodedDomain);
  const name = publication?.name || decodedDomain;
  return {
    title: `Recherche | ${name}`,
    description: `Rechercher dans les publications de ${name}.`,
    alternates: { canonical: `https://${decodedDomain}/search` },
    robots: { index: false, follow: true },
  };
}

function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default async function TenantSearchPage({ params, searchParams }: PageProps) {
  const { domain } = await params;
  const { q } = await searchParams;
  const decodedDomain = decodeURIComponent(domain);
  const query = (q || '').trim();

  const publication = await fetchTenantPublication(decodedDomain);
  if (!publication) notFound();

  const categories = new Map((publication.categories || []).map((c) => [c.id, c.name]));

  const searchArticles: SearchArticleItem[] = (publication.articles || []).map((art) => ({
    id: art.id,
    title: art.title,
    slug: art.slug,
    excerpt: plainText(art.content || '').slice(0, 180),
    categoryName: art.category?.name || (art.categoryId && categories.get(art.categoryId)) || null,
    categorySlug: art.category?.slug || null,
    readingTime: art.readingTime,
    publishedAt: art.createdAt,
    imageUrl: art.imageUrl || null,
    isPremium: art.isPremium,
  }));

  const isMinimal =
    !publication.layoutStyle ||
    publication.layoutStyle === 'minimal' ||
    resolveTheme(publication.layoutStyle).id === 'minimal';

  const templatePublication: TemplatePublicationContext = {
    id: publication.id,
    name: publication.name,
    domain: decodedDomain,
    logoUrl: publication.logoUrl,
    headerImageUrl: publication.headerImageUrl,
    heroText: publication.heroText,
    accentColor: publication.accentColor,
    fontFamily: publication.fontFamily,
    themeMode: publication.themeMode,
    navigation: publication.navigation as TemplatePublicationContext['navigation'],
    socialLinks: publication.socialLinks as TemplatePublicationContext['socialLinks'],
    categories: (publication.categories ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      parentId: c.parentId ?? null,
    })),
    supportUrl: publication.supportUrl,
    stripeAccountId: publication.stripeAccountId,
    siteOptions:
      (publication as { siteOptions?: Record<string, boolean> | null })?.siteOptions ??
      (publication as { site_options?: Record<string, boolean> | null })?.site_options ??
      null,
  };

  const categoriesList = (publication.categories || []).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
  }));

  if (isMinimal) {
    return (
      <MinimalCraftShell publication={templatePublication}>
        <div className="container mx-auto px-4 lg:px-8 max-w-3xl pt-2 sm:pt-4">
          <TenantSearchClient
            initialQuery={query}
            articles={searchArticles}
            categories={categoriesList}
            accentColor={publication.accentColor}
          />
        </div>
      </MinimalCraftShell>
    );
  }

  return (
    <TenantPageShell publication={publication} domain={decodedDomain}>
      <div className="max-w-3xl mx-auto">
        <TenantSearchClient
          initialQuery={query}
          articles={searchArticles}
          categories={categoriesList}
          accentColor={publication.accentColor}
        />
      </div>
    </TenantPageShell>
  );
}
