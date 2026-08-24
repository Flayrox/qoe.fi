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
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
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

  // Go : liste des médias de l'utilisateur.
  const res = await goFetch<{ medias: MediaListItem[] }>('/v1/media');
  const medias = res.medias ?? [];
  const activeMediaId = resolveActiveMediaId(medias, activeWorkspace);
  return <MediaStudioClient medias={medias} activeMediaId={activeMediaId} />;
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
