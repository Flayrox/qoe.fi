import { createClient } from '@qoe/supabase/server';
import { notFound, permanentRedirect } from 'next/navigation';
import { resolveProfileAction } from '@qoe/sdk/actions/feed';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { routes } from '@qoe/config/routes';
import type { PublicProfileData } from '@qoe/sdk';
import type { Metadata } from 'next';
import { ProfileView } from '../components/ProfileView';

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
  'thought',
  'thoughts',
  'article',
  'articles',
  'a',
]);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string; tab: string }>;
}): Promise<Metadata> {
  const resolvedParams = await params;
  const rawUsername = decodeURIComponent(resolvedParams.username).replace(/^@/, '');
  const rawTab = resolvedParams.tab;

  if (rawUsername === 'article' || rawUsername === 'articles' || rawUsername === 'a') {
    try {
      const art = await goFetch<{
        slug: string;
        author?: { username?: string | null };
        publisher?: { slug?: string | null; subdomain?: string | null };
      }>(`/v1/articles/${encodeURIComponent(rawTab)}`);
      if (art && art.slug) {
        const canonicalOwner =
          art.publisher?.slug || art.publisher?.subdomain || art.author?.username || 'qoefi';
        return {
          alternates: {
            canonical: `${(process.env.NEXT_PUBLIC_APP_URL || 'https://qoe.fi').replace(/\/$/, '')}${routes.feed.article(canonicalOwner, art.slug)}`,
          },
        };
      }
    } catch {
      // ignore
    }
  }

  if (STATIC_ASSET_REGEX.test(rawUsername) || RESERVED_USERNAMES.has(rawUsername)) {
    return { title: 'Introuvable — qoefi' };
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
        title: `${profile.name || `@${profile.slug}`} (@${profile.slug}) — qoefi`,
        description: profile.heroText || `Profil créateur de ${profile.name} sur qoefi.`,
        openGraph: {
          title: `${profile.name || `@${profile.slug}`} sur qoefi`,
          description: profile.heroText || `Suivez ${profile.name} sur qoefi.`,
          images: profile.logoUrl ? [{ url: profile.logoUrl }] : [],
        },
      };
    } catch {
      return { title: 'Profil introuvable — qoefi' };
    }
  }

  // Si ce n'est pas un onglet valide (ex: ancienne URL /:username/:articleSlug),
  // l'URL canonique est /:username/a/:slug.
  return {
    alternates: {
      canonical: `${(process.env.NEXT_PUBLIC_APP_URL || 'https://qoe.fi').replace(/\/$/, '')}${routes.feed.article(rawUsername, rawTab)}`,
    },
  };
}

export default async function UserProfileTabPage({
  params,
}: {
  params: Promise<{ username: string; tab: string }>;
}) {
  const resolvedParams = await params;
  const rawUsername = decodeURIComponent(resolvedParams.username).replace(/^@/, '');
  const rawTab = resolvedParams.tab;

  if (STATIC_ASSET_REGEX.test(rawUsername)) {
    notFound();
  }

  // 0. Récupération résiliente : /article/:slug, /articles/:slug, /a/:slug
  // Redirige directement vers l'URL canonique /:owner/a/:slug si le slug correspond à un article
  if (rawUsername === 'article' || rawUsername === 'articles' || rawUsername === 'a') {
    // ⚠️ `permanentRedirect` signale la redirection en levant une exception de
    // contrôle (NEXT_REDIRECT). Appelée dans le `try`, elle était attrapée par
    // le `catch` juste en dessous : TOUS les liens profonds `/article/<slug>`
    // tombaient donc sur `notFound()` (404), même pour un article publié.
    let art: {
      slug: string;
      author?: { username?: string | null };
      publisher?: { slug?: string | null; subdomain?: string | null };
    } | null = null;
    try {
      art = await goFetch<{
        slug: string;
        author?: { username?: string | null };
        publisher?: { slug?: string | null; subdomain?: string | null };
      }>(`/v1/articles/${encodeURIComponent(rawTab)}`);
    } catch {
      art = null; // slug introuvable ou API indisponible → 404 propre
    }

    if (art && art.slug) {
      const canonicalOwner =
        art.publisher?.slug || art.publisher?.subdomain || art.author?.username || 'qoefi';
      permanentRedirect(routes.feed.article(canonicalOwner, art.slug));
    }

    notFound();
  }

  if (RESERVED_USERNAMES.has(rawUsername)) {
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

    const {
      profileUser,
      isFollowing,
      publisherId,
      followRequested = false,
      profileVisibility = 'PUBLIC',
      canViewContent = true,
    } = resolved.data;
    const isOwnProfile = !!currentUser && currentUser.id === profileUser.ownerUserId;

    return (
      <ProfileView
        profileUser={profileUser}
        currentUserId={currentUser?.id || null}
        isOwnProfile={isOwnProfile}
        initialIsFollowing={isFollowing}
        initialFollowRequested={followRequested}
        profileVisibility={profileVisibility}
        initialCanViewContent={canViewContent}
        initialTab={rawTab}
        initialPublisherId={publisherId}
      />
    );
  }

  // 2. Transition SEO permanente (HTTP 308) : /:username/:slug -> /:username/a/:slug
  // Redirige les anciens backlinks et favoris vers la nouvelle URL canonique sans perte de jus SEO
  permanentRedirect(routes.feed.article(rawUsername, rawTab));
}
