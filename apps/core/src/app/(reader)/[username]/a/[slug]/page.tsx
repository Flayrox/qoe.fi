import { notFound } from 'next/navigation';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { buildPublicDescription } from '@qoe/utils';
import { parseSpotlightParams } from '@qoe/sdk/spotlight';
import { type CanonicalDocument } from '@qoe/ui/annotations';
import { JsonLd, buildArticleSchema } from '@qoe/ui';
import { getLanguage } from '@qoe/i18n/server';
import type { Metadata } from 'next';
import { loadHomeFeedData } from '@/lib/home-feed-data';
import { FeedDashboard } from '../../../home/FeedDashboard';

const STATIC_ASSET_REGEX = /\.(ico|png|jpg|jpeg|gif|svg|webp|js|css|json|xml|txt|map)$/i;

interface GoArticle {
  id: string;
  title: string;
  slug: string;
  content: string;
  imageUrl?: string | null;
  image_url?: string | null;
  readingTime?: number;
  createdAt: string;
  isPremium?: boolean;
  accessGranted?: boolean;
  category?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  author: {
    id: string;
    name?: string | null;
    username?: string | null;
    logoUrl?: string | null;
    heroText?: string | null;
    isCertified?: boolean;
    type?: 'PERSONAL' | 'MEDIA';
  };
  publication?: {
    name?: string | null;
    slug?: string | null;
    subdomain?: string | null;
    logoUrl?: string | null;
    customDomain?: string | null;
  } | null;
}

async function fetchArticleBySlug(slug: string): Promise<GoArticle | null> {
  try {
    return await goFetch<GoArticle>(`/v1/articles/${encodeURIComponent(slug)}`);
  } catch (err) {
    if ((err as { status?: number })?.status === 404) return null;
    throw err;
  }
}

async function fetchCanonicalDocument(articleId: string): Promise<CanonicalDocument | null> {
  try {
    const doc = await goFetch<CanonicalDocument>(
      `/v1/articles/${encodeURIComponent(articleId)}/document`
    );
    if (!doc || !Array.isArray(doc.blocks) || !doc.text) return null;
    return doc;
  } catch (err) {
    if ((err as { status?: number })?.status === 404) return null;
    console.error('[core/a] fetchCanonicalDocument:', err);
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string; slug: string }>;
}): Promise<Metadata> {
  const resolvedParams = await params;
  const rawUsername = decodeURIComponent(resolvedParams.username).replace(/^@/, '');
  const rawSlug = decodeURIComponent(resolvedParams.slug);

  if (STATIC_ASSET_REGEX.test(rawUsername)) {
    return { title: 'Introuvable — qoefi' };
  }

  const lang = await getLanguage();
  const isFr = lang === 'fr';
  const article = await fetchArticleBySlug(rawSlug);

  if (!article) {
    return {
      title: isFr ? 'Article introuvable | qoefi' : 'Article not found | qoefi',
    };
  }

  const cleanDescription = buildPublicDescription(article.content, 160);
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://qoe.fi').replace(/\/$/, '');
  const canonicalOwner =
    article.publication?.slug ||
    article.publication?.subdomain ||
    article.author?.username ||
    rawUsername;
  const canonicalUrl = `${appUrl}/${encodeURIComponent(canonicalOwner)}/a/${encodeURIComponent(article.slug)}`;
  const authorName =
    article.author?.name ||
    (article.author?.username ? `@${article.author.username}` : isFr ? 'Auteur' : 'Author');

  return {
    title: `${article.title} | qoefi`,
    description: cleanDescription,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      type: 'article',
      locale: isFr ? 'fr_FR' : 'en_US',
      title: article.title,
      description: cleanDescription,
      url: canonicalUrl,
      publishedTime: article.createdAt,
      authors: [authorName],
      images: article.author?.logoUrl ? [{ url: article.author.logoUrl }] : [],
    },
    twitter: {
      card: 'summary_large_image',
      title: article.title,
      description: cleanDescription,
      images: article.author?.logoUrl ? [article.author.logoUrl] : [],
    },
  };
}

export default async function UserArticleDedicatedPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string; slug: string }>;
  searchParams?: Promise<{ hlStart?: string; hlEnd?: string; hlSha?: string }>;
}) {
  const resolvedParams = await params;
  const rawUsername = decodeURIComponent(resolvedParams.username).replace(/^@/, '');
  const rawSlug = decodeURIComponent(resolvedParams.slug);

  if (STATIC_ASSET_REGEX.test(rawUsername)) {
    notFound();
  }

  const article = await fetchArticleBySlug(rawSlug);
  if (!article) {
    notFound();
    return;
  }

  // 🔦 Deep-link citation → article
  const spotlight = searchParams ? parseSpotlightParams(await searchParams) : null;

  // Tranche 1-c : document canonique (rendu par blocs + marques par offsets).
  const canReadFull = !article.isPremium || article.accessGranted === true;

  // Chargement en parallèle du flux d'accueil (feed arrière-plan) et du doc canonique
  const [feedProps, canonicalDocument] = await Promise.all([
    loadHomeFeedData(),
    canReadFull ? fetchCanonicalDocument(article.id) : Promise.resolve(null),
  ]);

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://qoe.fi').replace(/\/$/, '');
  const jsonLdData = buildArticleSchema({
    title: article.title,
    description: buildPublicDescription(article.content, 200),
    slug: article.slug,
    createdAt: article.createdAt,
    authorName: article.author?.name,
    authorUsername: article.author?.username,
    authorLogo: article.author?.logoUrl,
    baseUrl: appUrl,
  });

  return (
    <>
      <JsonLd data={jsonLdData} />
      <FeedDashboard
        {...feedProps}
        initialArticle={{
          id: article.id,
          title: article.title,
          slug: article.slug,
          content: article.content,
          imageUrl: article.imageUrl || article.image_url || null,
          readingTime: article.readingTime ?? 3,
          createdAt: article.createdAt,
          published: true,
          isPremium: article.isPremium ?? false,
          accessGranted: article.accessGranted ?? false,
          author: {
            id: article.author?.id || 'author',
            name: article.author?.name ?? null,
            username: article.author?.username ?? null,
            logoUrl: article.author?.logoUrl ?? null,
            heroText: article.author?.heroText ?? null,
            isCertified: article.author?.isCertified ?? false,
            type: article.author?.type ?? 'PERSONAL',
            subdomain: article.publication?.subdomain ?? null,
            customDomain: article.publication?.customDomain ?? null,
          },
          category: article.category ? { name: article.category.name } : null,
          publication: article.publication
            ? {
                name: article.publication.name,
                slug: article.publication.slug,
                subdomain: article.publication.subdomain,
                logoUrl: article.publication.logoUrl,
                customDomain: article.publication.customDomain,
              }
            : null,
        }}
        initialCanonicalDocument={canonicalDocument}
        initialSpotlight={spotlight}
        initialReturnUrl={`/${encodeURIComponent(rawUsername)}/articles`}
      />
    </>
  );
}
