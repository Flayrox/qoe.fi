// =====================================================================
// 🏢 Studio Média — apps/dashboard/src/app/(creator)/media/page.tsx
// =====================================================================
// Page de gestion des Médias : création, membres, rôles, permissions,
// invitations et réglages. Le workspace actif (cookie) détermine quel
// Média est ouvert, sans changer de compte.
// =====================================================================

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@qoe/supabase/server';
import { prisma } from '@qoe/db/client';
import { MediaStudioClient } from './MediaStudioClient';

export default async function MediaPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }

  const cookieStore = await cookies();
  const activeRaw = cookieStore.get('qoe_active_workspace')?.value ?? null;
  let activeWorkspace: { type: string; id: string } | null = null;
  try {
    activeWorkspace = activeRaw ? JSON.parse(decodeURIComponent(activeRaw)) : null;
  } catch {
    activeWorkspace = null;
  }

  const memberships = await prisma.mediaMember.findMany({
    where: { userId: user.id },
    include: {
      media: {
        include: {
          publication: true,
          _count: { select: { members: true, invites: true } },
        },
      },
    },
    orderBy: { joinedAt: 'asc' },
  });

  const medias = memberships.map((m) => ({
    id: m.media.id,
    name: m.media.publication.name,
    slug: m.media.publication.slug,
    subdomain: m.media.publication.subdomain,
    bio: m.media.publication.bio,
    logoUrl: m.media.publication.logoUrl,
    role: m.role,
    membersCount: m.media._count.members,
    invitesCount: m.media._count.invites,
  }));

  const activeMedia =
    activeWorkspace?.type === 'MEDIA'
      ? (medias.find((m) => m.id === activeWorkspace?.id) ?? null)
      : null;

  return <MediaStudioClient medias={medias} activeMediaId={activeMedia?.id ?? null} />;
}
