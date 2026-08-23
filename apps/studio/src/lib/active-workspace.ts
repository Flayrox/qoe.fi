// =====================================================================
// 🎛️ Active Workspace — Contexte de travail actif (Personnel | Média)
// =====================================================================
// 📖 Le dashboard est piloté par le workspace actif (cookie posé par le
//    switcher en haut). Chaque section (Home, Articles, Audience,
//    Analytics, Réglages...) opère sur cette publication : la publication
//    personnelle du créateur OU celle du Média sélectionné — sans changer
//    de compte.
// =====================================================================

import { cookies } from 'next/headers';
import { goFetch } from '@qoe/api-client/actions/utils/go-client';

export interface ActiveWorkspace {
  type: 'PERSONAL' | 'MEDIA';
  publicationId: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  /** mediaId uniquement si type === 'MEDIA' */
  mediaId?: string;
  /** rôle du user dans le Média (si type === 'MEDIA') */
  mediaRole?: string;
}

const WORKSPACE_COOKIE = 'qoe_active_workspace';

function parseCookie(raw: string | undefined): { type?: string; id?: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as { type?: string; id?: string };
    if (parsed.type && parsed.id) return parsed;
    return null;
  } catch {
    return null;
  }
}

/**
 * 🎛️ Résout le workspace actif de l'utilisateur — Go-only.
 * - Si un Média actif est sélectionné et que l'utilisateur en est membre → contexte MEDIA.
 * - Sinon → publication personnelle du créateur.
 * Délègue à Go `GET /v1/workspaces/active?mediaId=` (auth via Supabase JWT).
 */
export async function getActiveWorkspace(userId: string): Promise<ActiveWorkspace> {
  const cookieStore = await cookies();
  const saved = parseCookie(cookieStore.get(WORKSPACE_COOKIE)?.value);
  const mediaId = saved?.type === 'MEDIA' && saved.id ? saved.id : '';

  try {
    const qs = mediaId ? `?mediaId=${encodeURIComponent(mediaId)}` : '';
    return await goFetch<ActiveWorkspace>(`/v1/workspaces/active${qs}`);
  } catch {
    // Fallback si Go indisponible (dev) : publication personnelle = userId
    return {
      type: 'PERSONAL',
      publicationId: userId,
      name: 'Profil Personnel',
      slug: 'personal',
      logoUrl: null,
    };
  }
}

/**
 * 🎛️ Version "server action" : lit le cookie et résout la publication active.
 * À utiliser dans les actions serveur du dashboard pour être workspace-aware.
 */
export async function getActivePublicationId(userId: string): Promise<string> {
  const ws = await getActiveWorkspace(userId);
  return ws.publicationId;
}
