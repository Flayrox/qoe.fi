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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string; tab: string }>;
}) {
  const resolvedParams = await params;
  const rawUsername = decodeURIComponent(resolvedParams.username).replace(/^@/, '');

  try {
    const profile = await goFetch<PublicProfileData>(
      `/v1/users/${encodeURIComponent(rawUsername)}`
    );
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
  const rawTab = resolvedParams.tab;

  if (!VALID_TABS.includes(rawTab)) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  const resolved = await resolveProfileAction(resolvedParams.username);
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
