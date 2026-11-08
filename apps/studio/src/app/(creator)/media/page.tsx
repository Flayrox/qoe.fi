// =====================================================================
// 🏢 Studio Média — apps/studio/src/app/(creator)/media/page.tsx
// =====================================================================
// Page de gestion des Médias : création, membres, rôles, permissions,
// invitations et réglages. Le workspace actif (cookie) détermine quel
// Média est ouvert, sans changer de compte.
// Go en primaire (GET /v1/media) — fallback Prisma dev.
// =====================================================================

import { redirect } from 'next/navigation';
import { createClient } from '@qoe/supabase/server';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { getActiveWorkspace } from '@/lib/active-workspace';
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

  // Résolveur unique et mis en cache par requête : même source que la
  // sidebar et les autres pages (cookie média → contexte Go validé).
  const workspace = await getActiveWorkspace(user.id);
  const activeMediaId = workspace.type === 'MEDIA' ? (workspace.mediaId ?? null) : null;

  // Go : liste des médias de l'utilisateur.
  const res = await goFetch<{ medias: MediaListItem[] }>('/v1/media');
  const medias = res.medias ?? [];
  return <MediaStudioClient medias={medias} activeMediaId={activeMediaId} />;
}
