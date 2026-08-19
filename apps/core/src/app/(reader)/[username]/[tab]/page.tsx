import { createClient } from '@qoe/supabase/server';
import { notFound } from 'next/navigation';
import { resolveProfileAction } from '@qoe/api-client/actions/feed';
import { goFetch } from '@qoe/api-client/actions/utils/go-client';
import type { PublicProfileData } from '@qoe/api-client';
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
]);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string; tab: string }>;
}) {
  const resolvedParams = await params;
  const rawUsername = decodeURIComponent(resolvedParams.username).replace(/^@/, '');

  if (STATIC_ASSET_REGEX.test(rawUsername) || RESERVED_USERNAMES.has(rawUsername)) {
    return { title: 'Profil introuvable — qoe.fi' };
  }

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

export default async function UserProfileTabPage({
  params,
}: {
  params: Promise<{ username: string; tab: string }>;
}) {
  const resolvedParams = await params;
  const rawUsername = decodeURIComponent(resolvedParams.username).replace(/^@/, '');
  const rawTab = resolvedParams.tab;

  if (STATIC_ASSET_REGEX.test(rawUsername) || RESERVED_USERNAMES.has(rawUsername)) {
    notFound();
  }

  if (!VALID_TABS.includes(rawTab)) {
    notFound();
  }

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
