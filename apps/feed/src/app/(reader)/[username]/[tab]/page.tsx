import { createClient } from '@qoe/supabase/server';
import { notFound } from 'next/navigation';
import { prisma } from '@qoe/db/client';
import { ProfileView } from '../components/ProfileView';
import { resolveProfileByHandle, isFollowingPublication } from '../getProfileData';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string; tab: string }>;
}) {
  const resolvedParams = await params;
  const rawUsername = decodeURIComponent(resolvedParams.username).replace(/^@/, '');

  const publication = await prisma.publication.findFirst({
    where: {
      OR: [
        { slug: { equals: rawUsername, mode: 'insensitive' } },
        { subdomain: { equals: rawUsername, mode: 'insensitive' } },
      ],
    },
    select: { name: true, slug: true, heroText: true, logoUrl: true },
  });

  if (!publication) {
    return { title: 'Profil introuvable — qoe.fi' };
  }

  return {
    title: `${publication.name || `@${publication.slug}`} (@${publication.slug}) — qoe.fi`,
    description: publication.heroText || `Profil créateur de ${publication.name} sur qoe.fi.`,
    openGraph: {
      title: `${publication.name || `@${publication.slug}`} sur qoe.fi`,
      description: publication.heroText || `Suivez ${publication.name} sur qoe.fi.`,
      images: publication.logoUrl ? [{ url: publication.logoUrl }] : [],
    },
  };
}

export default async function UserProfileTabPage({
  params,
}: {
  params: Promise<{ username: string; tab: string }>;
}) {
  const resolvedParams = await params;
  const rawTab = resolvedParams.tab;

  const validTabs = [
    'thoughts',
    'with_replies',
    'articles',
    'reposts',
    'media',
    'followers',
    'following',
  ];
  if (!validTabs.includes(rawTab)) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  const resolved = await resolveProfileByHandle(resolvedParams.username, currentUser?.id);
  if (!resolved) {
    notFound();
  }

  const { profileUser, ownerUserId, publicationId } = resolved;

  const isOwnProfile = !!currentUser && currentUser.id === ownerUserId;
  const isFollowing = currentUser
    ? await isFollowingPublication(currentUser.id, publicationId)
    : false;

  return (
    <ProfileView
      profileUser={profileUser}
      currentUserId={currentUser?.id || null}
      isOwnProfile={isOwnProfile}
      initialIsFollowing={isFollowing}
      initialTab={rawTab}
    />
  );
}
