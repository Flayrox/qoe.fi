'use server';

import { createClient as createServerClient } from '@qoe/supabase/server';
import { prisma } from '@qoe/db/client';
import { revalidatePath } from 'next/cache';

async function getAuthenticatedUser() {
  const supabase = await createServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error('Non authentifié');

  const dbUser = await prisma.user.findUnique({ where: { id: authUser.id } });
  if (!dbUser) throw new Error('Utilisateur introuvable');

  return dbUser;
}

/**
 * 🏢 Créer un nouveau Profil Média / Journal collectif
 */
export async function createMediaAction(
  name: string,
  slug: string,
  bio?: string,
  logoUrl?: string
) {
  try {
    const user = await getAuthenticatedUser();

    if (!name || !slug) {
      return { success: false, error: 'Le nom et le permalien du Média sont requis' };
    }

    const cleanSlug = slug
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    const existing = await prisma.media.findUnique({ where: { slug: cleanSlug } });
    if (existing) {
      return {
        success: false,
        error: 'Ce permalien de Média est déjà utilisé par un autre journal',
      };
    }

    const media = await prisma.media.create({
      data: {
        name,
        slug: cleanSlug,
        subdomain: cleanSlug,
        bio: bio || null,
        logoUrl: logoUrl || null,
        members: {
          create: {
            userId: user.id,
            role: 'owner',
          },
        },
      },
    });

    revalidatePath('/settings');
    return { success: true, media };
  } catch (err: unknown) {
    console.error('[Create Media Error]', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Impossible de créer le profil Média',
    };
  }
}

/**
 * 👥 Récupérer tous les Workspaces de l'utilisateur (Profil personnel + Médias)
 */
export interface WorkspaceInfo {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  type: string;
  role?: string;
}

export type GetUserWorkspacesResponse =
  | { success: true; personal: WorkspaceInfo; medias: WorkspaceInfo[] }
  | { success: false; error: string };

export async function getUserWorkspacesAction(): Promise<GetUserWorkspacesResponse> {
  try {
    const user = await getAuthenticatedUser();

    const memberships = await prisma.mediaMember.findMany({
      where: { userId: user.id },
      include: {
        media: true,
      },
    });

    return {
      success: true,
      personal: {
        id: user.id,
        name: user.name || user.username || 'Profil Personnel',
        slug: user.username || 'personal',
        logoUrl: user.logoUrl || null,
        type: 'PERSONAL',
      },
      medias: memberships.map((m) => ({
        id: m.media.id,
        name: m.media.name,
        slug: m.media.slug,
        logoUrl: m.media.logoUrl,
        role: m.role,
        type: 'MEDIA',
      })),
    };
  } catch (err: unknown) {
    console.error('[Get Workspaces Error]', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erreur de récupération des workspaces',
    };
  }
}

/**
 * ➕ Inviter un rédacteur / co-auteur dans un Média
 */
export async function inviteMediaMemberAction(
  mediaId: string,
  email: string,
  role: string = 'writer'
) {
  try {
    const user = await getAuthenticatedUser();

    // Verify current user is owner/editor of the media
    const membership = await prisma.mediaMember.findUnique({
      where: {
        mediaId_userId: {
          mediaId,
          userId: user.id,
        },
      },
    });

    if (!membership || (membership.role !== 'owner' && membership.role !== 'editor')) {
      return {
        success: false,
        error: 'Seuls les propriétaires ou éditeurs du Média peuvent ajouter des membres',
      };
    }

    const targetUser = await prisma.user.findUnique({ where: { email } });
    if (!targetUser) {
      return { success: false, error: 'Aucun compte utilisateur trouvé avec cette adresse email' };
    }

    await prisma.mediaMember.upsert({
      where: {
        mediaId_userId: {
          mediaId,
          userId: targetUser.id,
        },
      },
      update: { role },
      create: {
        mediaId,
        userId: targetUser.id,
        role,
      },
    });

    revalidatePath('/advanced');
    return { success: true };
  } catch (err: unknown) {
    console.error('[Invite Media Member Error]', err);
    return { success: false, error: err instanceof Error ? err.message : "Échec de l'invitation" };
  }
}
