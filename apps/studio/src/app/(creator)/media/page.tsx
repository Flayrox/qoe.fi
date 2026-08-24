// =====================================================================
// 🏢 Studio Média — apps/studio/src/app/(creator)/media/page.tsx
// =====================================================================
// Page de gestion des Médias : création, membres, rôles, permissions,
// invitations et réglages. Le workspace actif (cookie) détermine quel
// Média est ouvert, sans changer de compte.
// Go en primaire (GET /v1/media) — fallback Prisma dev.
// =====================================================================

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@qoe/supabase/server';
import { prisma } from '@qoe/db/client';
import { goFetch, isGoEnabled } from '@qoe/api-client/actions/utils/go-client';
import { MediaStudioClient } from './MediaStudioClient';

interface MediaListItem {
  id: string;
  name: string;
  slug: string;
  subdomain: string | null;
  bio: string | null;
  logoUrl: string | null;
  role: string;
  membersCount: number;
  invitesCount: number;
}

export default async function MediaPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/login');
  }

  // Workspace actif (cookie) — utilisé pour présélectionner le Média ouvert.
  const cookieStore = await cookies();
  const activeRaw = cookieStore.get('qoe_active_workspace')?.value ?? null;
  let activeWorkspace: { type: string; id: string } | null = null;
  try {
    activeWorkspace = activeRaw ? JSON.parse(decodeURIComponent(activeRaw)) : null;
  } catch {
    activeWorkspace = null;
  }

  // Go en primaire : liste des médias de l'utilisateur (chemin nominal).
  if (isGoEnabled()) {
    try {
      const res = await goFetch<{ medias: MediaListItem[] }>('/v1/media');
      const medias = res.medias ?? [];
      const activeMediaId = resolveActiveMediaId(medias, activeWorkspace);
      return <MediaStudioClient medias={medias} activeMediaId={activeMediaId} />;
    } catch {
      // Fallback Prisma dev ci-dessous (QOE_API_URL indisponible).
    }
  }

  // ⚠️ Fallback dev — le chemin nominal est le Go ci-dessus.
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

function resolveActiveMediaId(
  medias: MediaListItem[],
  activeWorkspace: { type: string; id: string } | null
): string | null {
  if (activeWorkspace?.type === 'MEDIA') {
    const match = medias.find((m) => m.id === activeWorkspace.id);
    if (match) return match.id;
  }
  return medias[0]?.id ?? null;
}
