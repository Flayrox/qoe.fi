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
import { prisma } from '@qoe/db/client';

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
 * 🎛️ Résout le workspace actif de l'utilisateur.
 * - Si un Média actif est sélectionné et que l'utilisateur en est membre → contexte MEDIA.
 * - Sinon → publication personnelle du créateur.
 */
export async function getActiveWorkspace(userId: string): Promise<ActiveWorkspace> {
  const cookieStore = await cookies();
  const saved = parseCookie(cookieStore.get(WORKSPACE_COOKIE)?.value);

  if (saved?.type === 'MEDIA' && saved.id) {
    const membership = await prisma.mediaMember.findUnique({
      where: { mediaId_userId: { mediaId: saved.id, userId } },
      include: {
        media: {
          include: {
            publication: {
              select: { id: true, name: true, slug: true, logoUrl: true },
            },
          },
        },
      },
    });
    if (membership) {
      return {
        type: 'MEDIA',
        mediaId: membership.mediaId,
        publicationId: membership.media.publication.id,
        name: membership.media.publication.name,
        slug: membership.media.publication.slug,
        logoUrl: membership.media.publication.logoUrl,
        mediaRole: membership.role,
      };
    }
  }

  // Défaut : publication personnelle
  const personal = await prisma.publication.findFirst({
    where: { type: 'PERSONAL', user: { id: userId } },
    select: { id: true, name: true, slug: true, logoUrl: true },
  });

  return {
    type: 'PERSONAL',
    publicationId: personal?.id ?? userId,
    name: personal?.name || 'Profil Personnel',
    slug: personal?.slug || 'personal',
    logoUrl: personal?.logoUrl ?? null,
  };
}

/**
 * 🎛️ Version "server action" : lit le cookie et résout la publication active.
 * À utiliser dans les actions serveur du dashboard pour être workspace-aware.
 */
export async function getActivePublicationId(userId: string): Promise<string> {
  const ws = await getActiveWorkspace(userId);
  return ws.publicationId;
}
