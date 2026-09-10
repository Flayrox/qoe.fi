import { notFound } from 'next/navigation';
import { createClient } from '@qoe/supabase/server';
import { resolveProfileAction } from '@qoe/sdk/actions/feed';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import type { PublicProfileData } from '@qoe/sdk';
import { ProfileView } from './components/ProfileView';

const STATIC_ASSET_REGEX = /\.(ico|png|jpg|jpeg|gif|svg|webp|js|css|json|xml|txt|map)$/i;
const RESERVED_USERNAMES = new Set([
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
  'api',
  '_next',
  'manifest.json',
]);

import { JsonLd, buildPersonSchema } from '@qoe/ui';
import { getLanguage } from '@qoe/i18n/server';

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const lang = await getLanguage();
  const isFr = lang === 'fr';

  const resolvedParams = await params;
  const rawUsername = decodeURIComponent(resolvedParams.username).replace(/^@/, '');

  if (STATIC_ASSET_REGEX.test(rawUsername) || RESERVED_USERNAMES.has(rawUsername)) {
    return { title: isFr ? 'Profil introuvable — qoe.fi' : 'Profile not found — qoe.fi' };
  }

  try {
    // Go-first : GET /v1/users/{username}.
    const profileRaw = await goFetch<{ data: PublicProfileData } | PublicProfileData>(
      `/v1/users/${encodeURIComponent(rawUsername)}`
    );
    const profile =
      profileRaw && typeof profileRaw === 'object' && 'data' in profileRaw && profileRaw.data
        ? profileRaw.data
        : (profileRaw as PublicProfileData);

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://qoe.fi').replace(/\/$/, '');
    const canonicalUrl = `${appUrl}/${encodeURIComponent(profile.slug || rawUsername)}`;
    const defaultDesc = isFr
      ? `Profil créateur de ${profile.name || `@${profile.slug}`} sur qoe.fi.`
      : `Creator profile of ${profile.name || `@${profile.slug}`} on qoe.fi.`;

    return {
      title: `${profile.name || `@${profile.slug}`} (@${profile.slug}) — qoe.fi`,
      description: profile.heroText || defaultDesc,
      alternates: {
        canonical: canonicalUrl,
      },
      openGraph: {
        type: 'profile',
        locale: isFr ? 'fr_FR' : 'en_US',
        title: isFr
          ? `${profile.name || `@${profile.slug}`} sur qoe.fi`
          : `${profile.name || `@${profile.slug}`} on qoe.fi`,
        description: profile.heroText || defaultDesc,
        url: canonicalUrl,
        images: profile.logoUrl ? [{ url: profile.logoUrl }] : [],
      },
      twitter: {
        card: 'summary',
        title: isFr
          ? `${profile.name || `@${profile.slug}`} sur qoe.fi`
          : `${profile.name || `@${profile.slug}`} on qoe.fi`,
        description: profile.heroText || defaultDesc,
        images: profile.logoUrl ? [profile.logoUrl] : [],
      },
    };
  } catch {
    return { title: isFr ? 'Profil introuvable — qoe.fi' : 'Profile not found — qoe.fi' };
  }
}

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const resolvedParams = await params;
  const rawUsername = decodeURIComponent(resolvedParams.username).replace(/^@/, '');

  if (STATIC_ASSET_REGEX.test(rawUsername) || RESERVED_USERNAMES.has(rawUsername)) {
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

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://qoe.fi').replace(/\/$/, '');
  const jsonLdData = buildPersonSchema({
    name: profileUser.name,
    username: profileUser.username,
    bio: profileUser.heroText,
    logoUrl: profileUser.logoUrl,
    baseUrl: appUrl,
  });

  return (
    <>
      <JsonLd data={jsonLdData} />
      <ProfileView
        profileUser={profileUser}
        currentUserId={currentUser?.id || null}
        isOwnProfile={isOwnProfile}
        initialIsFollowing={isFollowing}
        initialTab="thoughts"
        initialPublicationId={publicationId}
      />
    </>
  );
}
