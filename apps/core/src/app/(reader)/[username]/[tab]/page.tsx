import { createClient } from '@qoe/supabase/server';
import { notFound } from 'next/navigation';
import { resolveProfileAction } from '@qoe/sdk/actions/feed';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { buildPublicDescription } from '@qoe/utils';
import { parseSpotlightParams } from '@qoe/sdk/spotlight';
import { type CanonicalDocument } from '@qoe/ui/annotations';
import { JsonLd, buildArticleSchema } from '@qoe/ui';
import { getLanguage } from '@qoe/i18n/server';
import type { PublicProfileData } from '@qoe/sdk';
import type { Metadata } from 'next';
import { ProfileView } from '../components/ProfileView';
import { loadHomeFeedData } from '@/lib/home-feed-data';
import { FeedDashboard } from '../../home/FeedDashboard';

const VALID_TABS = [
  'thoughts',
  'with_replies',
  'articles',
  'reposts',
  'media',
  'followers',
  'following',
];

const STATIC_ASSET_REGEX = /\.(ico|png|jpg|jpeg|gif|svg|webp|js|css|json|xml|txt|map)$/i;
const RESERVED_USERNAMES = new Set([
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
  'api',
  '_next',
  'manifest.json',
]);

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
    console.error('[core] fetchCanonicalDocument:', err);
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string; tab: string }>;
}): Promise<Metadata> {
  const resolvedParams = await params;
  const rawUsername = decodeURIComponent(resolvedParams.username).replace(/^@/, '');
  const rawTab = resolvedParams.tab;

  if (STATIC_ASSET_REGEX.test(rawUsername) || RESERVED_USERNAMES.has(rawUsername)) {
    return { title: 'Introuvable — qoe.fi' };
  }

  // Si c'est un onglet de profil classique
  if (VALID_TABS.includes(rawTab)) {
    try {
      const profileRaw = await goFetch<{ data: PublicProfileData } | PublicProfileData>(
        `/v1/users/${encodeURIComponent(rawUsername)}`
      );
      const profile =
        profileRaw && typeof profileRaw === 'object' && 'data' in profileRaw && profileRaw.data
          ? profileRaw.data
          : (profileRaw as PublicProfileData);
      return {
        title: `${profile.name || `@${profile.slug}`} (@${profile.slug}) — qoe.fi`,
        description: profile.heroText || `Profil créateur de ${profile.name} sur qoe.fi.`,
        openGraph: {
          title: `${profile.name || `@${profile.slug}`} sur qoe.fi`,
          description: profile.heroText || `Suivez ${profile.name} sur qoe.fi.`,
          images: profile.logoUrl ? [{ url: profile.logoUrl }] : [],
        },
      };
    } catch {
      return { title: 'Profil introuvable — qoe.fi' };
    }
  }

  // Sinon, c'est un article (forme /:publicationOrUsername/:articleSlug)
  const lang = await getLanguage();
  const isFr = lang === 'fr';
  const article = await fetchArticleBySlug(rawTab);

  if (!article) {
    return {
      title: isFr ? 'Article introuvable | qoe.fi' : 'Article not found | qoe.fi',
    };
  }

  const cleanDescription = buildPublicDescription(article.content, 160);
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://qoe.fi').replace(/\/$/, '');
  const canonicalOwner =
    article.publication?.slug ||
    article.publication?.subdomain ||
    article.author?.username ||
    rawUsername;
  const canonicalUrl = `${appUrl}/${encodeURIComponent(canonicalOwner)}/${encodeURIComponent(article.slug)}`;
  const authorName =
    article.author?.name ||
    (article.author?.username ? `@${article.author.username}` : isFr ? 'Auteur' : 'Author');

  return {
    title: `${article.title} | qoe.fi`,
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

export default async function UserProfileTabPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string; tab: string }>;
  searchParams?: Promise<{ hlStart?: string; hlEnd?: string; hlSha?: string }>;
}) {
  const resolvedParams = await params;
  const rawUsername = decodeURIComponent(resolvedParams.username).replace(/^@/, '');
  const rawTab = resolvedParams.tab;

  if (STATIC_ASSET_REGEX.test(rawUsername) || RESERVED_USERNAMES.has(rawUsername)) {
    notFound();
  }

  // 1. Branche profil utilisateur (/username/thoughts, /username/articles, etc.)
  if (VALID_TABS.includes(rawTab)) {
    const supabase = await createClient();
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    const resolved = await resolveProfileAction(rawUsername);
    if (!resolved.ok || !resolved.data) {
      notFound();
    }

    const { profileUser, isFollowing, publicationId } = resolved.data;
    const isOwnProfile = !!currentUser && currentUser.id === profileUser.ownerUserId;

    return (
      <ProfileView
        profileUser={profileUser}
        currentUserId={currentUser?.id || null}
        isOwnProfile={isOwnProfile}
        initialIsFollowing={isFollowing}
        initialTab={rawTab}
        initialPublicationId={publicationId}
      />
    );
  }

  // 2. Branche article (/publicationSlug/articleSlug OU /authorUsername/articleSlug)
  // La publication prime sur l'auteur si l'article est affilié à un média.
  const article = await fetchArticleBySlug(rawTab);
  if (!article) {
    notFound();
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
