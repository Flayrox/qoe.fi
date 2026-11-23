import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import type { Metadata } from 'next';
import { fetchTenantPublisher, fetchTenantSearchArticles } from '@/lib/tenant-data';
import { TenantPageShell } from '@/components/TenantPageShell';
import { TenantSearchClient, type SearchArticleItem } from './TenantSearchClient';
import { filterTenantArticles } from './filter';
import { MinimalCraftShell, type TemplatePublisherContext } from '@qoe/ui/templates';
import { normalizeTenantDomain } from '@/lib/tenant-domain';

interface PageProps {
  params: Promise<{ domain: string }>;
  searchParams: Promise<{ q?: string; category?: string; mode?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domain } = await params;
  const decodedDomain = normalizeTenantDomain(domain);
  const publisher = await fetchTenantPublisher(decodedDomain);
  const name = publisher?.name || decodedDomain;
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
  const { q, category } = await searchParams;
  const decodedDomain = normalizeTenantDomain(domain);
  const query = (q || '').trim();
  const selectedCategory = (category || 'all').trim() || 'all';

  const publisher = await fetchTenantPublisher(decodedDomain);
  if (!publisher) notFound();

  const headersList = await headers();
  const host = headersList.get('x-forwarded-host') || headersList.get('host') || decodedDomain;

  const categories = new Map((publisher.categories || []).map((c) => [c.id, c]));

  const allArticles: SearchArticleItem[] = (publisher.articles || []).map((art) => ({
    id: art.id,
    title: art.title,
    slug: art.slug,
    excerpt: plainText(art.content || '').slice(0, 180),
    categoryName:
      art.category?.name || (art.categoryId && categories.get(art.categoryId)?.name) || null,
    categorySlug: art.category?.slug || null,
    readingTime: art.readingTime,
    publishedAt: art.createdAt,
    imageUrl: art.imageUrl || null,
    isPremium: art.isPremium,
  }));

  // 🔎 Recherche côté serveur : avec une requête, Meilisearch (index enrichi
  // image + temps de lecture) ; repli sur le bundle si l'API échoue. Sans
  // requête, on garde le filtrage local (parcours par rubrique).
  let searchArticles: SearchArticleItem[];
  const selectedCategoryId =
    selectedCategory === 'all'
      ? undefined
      : publisher.categories?.find((c) => c.slug === selectedCategory)?.id;
  const categoryMissing = selectedCategory !== 'all' && !selectedCategoryId;
  const hits =
    query && !categoryMissing
      ? await fetchTenantSearchArticles(publisher.id, query, selectedCategoryId)
      : null;

  if (hits) {
    searchArticles = hits.map((hit) => {
      const category = hit.categoryId ? categories.get(hit.categoryId) : undefined;
      return {
        id: hit.id,
        title: hit.title,
        slug: hit.slug,
        excerpt: plainText(hit.content || '').slice(0, 180),
        categoryName: category?.name ?? null,
        categorySlug: category?.slug ?? null,
        readingTime: hit.readingTime,
        publishedAt: new Date(hit.createdAt).toISOString(),
        imageUrl: hit.imageUrl ?? null,
        isPremium: hit.isPremium,
      };
    });
  } else {
    searchArticles = categoryMissing
      ? []
      : filterTenantArticles(allArticles, query, selectedCategory);
  }

  // Thème unique Minimal Craft.
  const isMinimal = true;

  const templatePublisher: TemplatePublisherContext = {
    id: publisher.id,
    name: publisher.name,
    domain: decodedDomain,
    logoUrl: publisher.logoUrl,
    headerImageUrl: publisher.headerImageUrl,
    heroText: publisher.heroText,
    accentColor: publisher.accentColor,
    fontFamily: publisher.fontFamily,
    themeMode: publisher.themeMode,
    navigation: publisher.navigation as TemplatePublisherContext['navigation'],
    socialLinks: publisher.socialLinks as TemplatePublisherContext['socialLinks'],
    categories: (publisher.categories ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      parentId: c.parentId ?? null,
    })),
    supportUrl: publisher.supportUrl,
    stripeAccountId: publisher.stripeAccountId,
    siteOptions:
      (publisher as { siteOptions?: Record<string, boolean> | null })?.siteOptions ??
      (publisher as { site_options?: Record<string, boolean> | null })?.site_options ??
      null,
  };

  const categoriesList = (publisher.categories || []).map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
  }));

  if (isMinimal) {
    templatePublisher.domain = host;

    return (
      <MinimalCraftShell publisher={templatePublisher}>
        <div className="container mx-auto px-4 lg:px-8 max-w-3xl pt-2 sm:pt-4">
          <TenantSearchClient
            initialQuery={query}
            initialCategory={selectedCategory}
            articles={searchArticles}
            categories={categoriesList}
            accentColor={publisher.accentColor}
          />
        </div>
      </MinimalCraftShell>
    );
  }

  return (
    <TenantPageShell publisher={publisher} domain={decodedDomain} host={host}>
      <div className="max-w-3xl mx-auto">
        <TenantSearchClient
          initialQuery={query}
          initialCategory={selectedCategory}
          articles={searchArticles}
          categories={categoriesList}
          accentColor={publisher.accentColor}
        />
      </div>
    </TenantPageShell>
  );
}
