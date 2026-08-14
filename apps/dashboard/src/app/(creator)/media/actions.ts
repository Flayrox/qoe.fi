'use server';

import { createClient as createServerClient } from '@qoe/supabase/server';
import { prisma, type Prisma } from '@qoe/db/client';
import { notifications } from '@qoe/db';
import { logger } from '@qoe/observability';
import { revalidatePath } from 'next/cache';
import crypto from 'crypto';
import { MEDIA_ROLES, canMedia } from '@qoe/auth';

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

async function getMediaMembership(mediaId: string, userId: string) {
  return prisma.mediaMember.findUnique({
    where: { mediaId_userId: { mediaId, userId } },
  });
}

async function logMediaAction(
  mediaId: string,
  actorId: string,
  action: string,
  metadata?: Record<string, unknown>
) {
  await prisma.mediaAuditLog.create({
    data: {
      mediaId,
      actorId,
      action,
      metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });
}

function cleanSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * 🏢 Créer un nouveau Profil Média / Journal collectif
 * Crée la Publication (type MEDIA) + le Media + le membre owner.
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

    const clean = cleanSlug(slug);

    const existing = await prisma.publication.findFirst({
      where: { OR: [{ slug: clean }, { subdomain: clean }] },
    });
    if (existing) {
      return {
        success: false,
        error: 'Ce permalien de Média est déjà utilisé par un autre journal',
      };
    }

    const media = await prisma.$transaction(async (tx) => {
      const publication = await tx.publication.create({
        data: {
          type: 'MEDIA',
          name: name.trim(),
          slug: clean,
          subdomain: clean,
          bio: bio || null,
          logoUrl: logoUrl || null,
          accentColor: '#EE4B2B',
        },
      });

      const createdMedia = await tx.media.create({
        data: {
          publicationId: publication.id,
          members: {
            create: {
              userId: user.id,
              role: MEDIA_ROLES.OWNER,
            },
          },
        },
      });

      await tx.mediaAuditLog.create({
        data: {
          mediaId: createdMedia.id,
          actorId: user.id,
          action: 'media.created',
          metadata: { name, slug: clean },
        },
      });

      return createdMedia;
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
  type: 'PERSONAL' | 'MEDIA';
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
        media: {
          include: { publication: true },
        },
      },
    });

    const personalPublication = await prisma.publication.findFirst({
      where: { type: 'PERSONAL', user: { id: user.id } },
    });

    return {
      success: true,
      personal: {
        id: personalPublication?.id ?? user.id,
        name: user.name || user.username || 'Profil Personnel',
        slug: personalPublication?.slug || user.username || 'personal',
        logoUrl: user.logoUrl || null,
        type: 'PERSONAL',
      },
      medias: memberships.map((m) => ({
        id: m.media.id,
        name: m.media.publication.name,
        slug: m.media.publication.slug,
        logoUrl: m.media.publication.logoUrl,
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
 * 🎯 Récupérer un Média complet (publication + membres) pour le studio média.
 */
export async function getMediaByIdAction(mediaId: string) {
  try {
    const user = await getAuthenticatedUser();
    const membership = await getMediaMembership(mediaId, user.id);
    if (!membership) {
      return { success: false, error: "Vous n'êtes pas membre de ce Média" };
    }

    const media = await prisma.media.findUnique({
      where: { id: mediaId },
      include: {
        publication: {
          include: {
            _count: { select: { articles: true } },
          },
        },
        members: {
          include: { user: { select: { id: true, name: true, username: true, logoUrl: true } } },
          orderBy: { joinedAt: 'asc' },
        },
        invites: {
          where: { status: 'PENDING' },
          orderBy: { createdAt: 'desc' },
          include: { inviter: { select: { id: true, name: true, username: true } } },
        },
      },
    });

    if (!media) return { success: false, error: 'Média introuvable' };
    return {
      success: true,
      media,
      articlesCount: media.publication._count.articles,
      myRole: membership.role,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erreur de récupération du Média',
    };
  }
}

/**
 * 🎯 Résout la publication d'un média (pour le studio / tenant).
 */
export async function getMediaPublicationAction(mediaId: string) {
  try {
    const media = await prisma.media.findUnique({
      where: { id: mediaId },
      include: { publication: true },
    });
    if (!media) return { success: false, error: 'Média introuvable' };
    return { success: true, publication: media.publication };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erreur de récupération',
    };
  }
}

/**
 * ➕ Inviter un rédacteur / co-auteur dans un Média
 * RBAC : manage_members.
 */
export async function inviteMediaMemberAction(
  mediaId: string,
  email: string,
  role: string = MEDIA_ROLES.WRITER
) {
  try {
    const user = await getAuthenticatedUser();
    const membership = await getMediaMembership(mediaId, user.id);
    if (!canMedia(membership, 'media:manage_members')) {
      return {
        success: false,
        error: 'Seuls les propriétaires ou éditeurs du Média peuvent ajouter des membres',
      };
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return { success: false, error: 'Adresse email invalide' };
    }

    const targetUser = await prisma.user.findUnique({ where: { email: cleanEmail } });

    // Si l'utilisateur existe déjà et est membre → on met à jour son rôle
    if (targetUser) {
      const existing = await getMediaMembership(mediaId, targetUser.id);
      if (existing) {
        await prisma.mediaMember.update({
          where: { mediaId_userId: { mediaId, userId: targetUser.id } },
          data: { role },
        });
        await logMediaAction(mediaId, user.id, 'member.role_changed', {
          targetId: targetUser.id,
          role,
        });
        revalidatePath('/advanced');
        return { success: true, alreadyMember: true };
      }
    }

    const token = crypto.randomBytes(24).toString('hex');
    const invite = await prisma.mediaInvite.create({
      data: {
        mediaId,
        inviterId: user.id,
        email: cleanEmail,
        role,
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 jours
      },
    });

    await logMediaAction(mediaId, user.id, 'member.invited', { email: cleanEmail, role });

    // Notifier le membre existant (s'il a un compte)
    if (targetUser && targetUser.id !== user.id) {
      const media = await prisma.media.findUnique({
        where: { id: mediaId },
        include: { publication: { select: { id: true, name: true } } },
      });
      if (media) {
        await notifications
          .createNotification({
            recipientId: targetUser.id,
            senderId: user.id,
            type: 'MEDIA_INVITE',
            publicationId: media.publication.id,
          })
          .catch((err: unknown) => logger.error('Erreur notification invite média', { err }));
      }
    }

    revalidatePath('/advanced');
    return { success: true, invite };
  } catch (err: unknown) {
    console.error('[Invite Media Member Error]', err);
    return { success: false, error: err instanceof Error ? err.message : "Échec de l'invitation" };
  }
}

/**
 * ✅ Accepter une invitation à rejoindre un Média (via token).
 */
export async function acceptMediaInviteAction(token: string) {
  try {
    const user = await getAuthenticatedUser();
    const invite = await prisma.mediaInvite.findUnique({
      where: { token },
      include: { media: true },
    });

    if (!invite) return { success: false, error: 'Invitation introuvable ou déjà utilisée' };
    if (invite.status !== 'PENDING') {
      return { success: false, error: 'Cette invitation a déjà été traitée' };
    }
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return { success: false, error: 'Cette invitation a expiré' };
    }
    if (invite.email.toLowerCase() !== user.email?.toLowerCase()) {
      return { success: false, error: "Cette invitation n'est pas destinée à ce compte" };
    }

    await prisma.$transaction(async (tx) => {
      await tx.mediaMember.upsert({
        where: { mediaId_userId: { mediaId: invite.mediaId, userId: user.id } },
        update: { role: invite.role, status: 'active' },
        create: {
          mediaId: invite.mediaId,
          userId: user.id,
          role: invite.role,
          status: 'active',
        },
      });
      await tx.mediaInvite.update({
        where: { id: invite.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });
      await tx.mediaAuditLog.create({
        data: {
          mediaId: invite.mediaId,
          actorId: user.id,
          action: 'member.joined',
          metadata: { email: user.email },
        },
      });
    });

    // Notifier l'inviteur
    if (invite.inviterId !== user.id) {
      const media = await prisma.media.findUnique({
        where: { id: invite.mediaId },
        include: { publication: { select: { id: true, name: true } } },
      });
      if (media) {
        await notifications
          .createNotification({
            recipientId: invite.inviterId,
            senderId: user.id,
            type: 'MEDIA_MEMBER_JOINED',
            publicationId: media.publication.id,
          })
          .catch((err: unknown) => logger.error('Erreur notification member joined', { err }));
      }
    }

    revalidatePath('/advanced');
    return { success: true, mediaId: invite.mediaId };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Échec de l'acceptation" };
  }
}

/**
 * 🔁 Changer le rôle d'un membre.
 * RBAC : manage_members.
 */
export async function updateMediaMemberRoleAction(
  mediaId: string,
  memberUserId: string,
  role: string
) {
  try {
    const user = await getAuthenticatedUser();
    const membership = await getMediaMembership(mediaId, user.id);
    if (!canMedia(membership, 'media:manage_members')) {
      return { success: false, error: 'Permission insuffisante' };
    }
    if (!(role in MEDIA_ROLES)) {
      return { success: false, error: 'Rôle invalide' };
    }

    await prisma.mediaMember.update({
      where: { mediaId_userId: { mediaId, userId: memberUserId } },
      data: { role, permissions: [] },
    });
    await logMediaAction(mediaId, user.id, 'member.role_changed', {
      targetId: memberUserId,
      role,
    });
    revalidatePath('/advanced');
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Échec du changement de rôle',
    };
  }
}

/**
 * ⚙️ Mettre à jour les permissions granulaires d'un membre.
 * RBAC : manage_members.
 */
export async function updateMediaMemberPermissionsAction(
  mediaId: string,
  memberUserId: string,
  permissions: string[]
) {
  try {
    const user = await getAuthenticatedUser();
    const membership = await getMediaMembership(mediaId, user.id);
    if (!canMedia(membership, 'media:manage_members')) {
      return { success: false, error: 'Permission insuffisante' };
    }

    await prisma.mediaMember.update({
      where: { mediaId_userId: { mediaId, userId: memberUserId } },
      data: { permissions },
    });
    await logMediaAction(mediaId, user.id, 'member.permissions_changed', {
      targetId: memberUserId,
      permissions,
    });
    revalidatePath('/advanced');
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Échec de la mise à jour des permissions',
    };
  }
}

/**
 * 🗑️ Retirer un membre du Média.
 * RBAC : manage_members. Impossible de retirer l'owner.
 */
export async function removeMediaMemberAction(mediaId: string, memberUserId: string) {
  try {
    const user = await getAuthenticatedUser();
    const membership = await getMediaMembership(mediaId, user.id);
    if (!canMedia(membership, 'media:manage_members')) {
      return { success: false, error: 'Permission insuffisante' };
    }

    const target = await prisma.mediaMember.findUnique({
      where: { mediaId_userId: { mediaId, userId: memberUserId } },
    });
    if (!target) return { success: false, error: 'Membre introuvable' };
    if (target.role === MEDIA_ROLES.OWNER) {
      return { success: false, error: 'Impossible de retirer le propriétaire du Média' };
    }

    await prisma.mediaMember.delete({
      where: { mediaId_userId: { mediaId, userId: memberUserId } },
    });
    await logMediaAction(mediaId, user.id, 'member.removed', { targetId: memberUserId });
    revalidatePath('/advanced');
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Échec du retrait' };
  }
}

/**
 * 🎨 Mettre à jour les réglages d'un Média (identité, design, SEO).
 * RBAC : manage_settings.
 */
export async function updateMediaSettingsAction(
  mediaId: string,
  data: {
    name?: string;
    bio?: string | null;
    logoUrl?: string | null;
    subdomain?: string | null;
    customDomain?: string | null;
    accentColor?: string | null;
    heroText?: string | null;
    headerImageUrl?: string | null;
    footerText?: string | null;
    themeMode?: string | null;
    layoutStyle?: string | null;
    seoTitle?: string | null;
    seoDescription?: string | null;
    allowIndexing?: boolean;
    fontFamily?: string | null;
    supportUrl?: string | null;
  }
) {
  try {
    const user = await getAuthenticatedUser();
    const membership = await getMediaMembership(mediaId, user.id);
    if (!canMedia(membership, 'media:manage_settings')) {
      return { success: false, error: 'Permission insuffisante' };
    }

    const media = await prisma.media.findUnique({
      where: { id: mediaId },
      include: { publication: true },
    });
    if (!media) return { success: false, error: 'Média introuvable' };

    const publication = await prisma.publication.update({
      where: { id: media.publicationId },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.bio !== undefined ? { bio: data.bio } : {}),
        ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl } : {}),
        ...(data.subdomain !== undefined ? { subdomain: data.subdomain } : {}),
        ...(data.customDomain !== undefined ? { customDomain: data.customDomain } : {}),
        ...(data.accentColor !== undefined ? { accentColor: data.accentColor } : {}),
        ...(data.heroText !== undefined ? { heroText: data.heroText } : {}),
        ...(data.headerImageUrl !== undefined ? { headerImageUrl: data.headerImageUrl } : {}),
        ...(data.footerText !== undefined ? { footerText: data.footerText } : {}),
        ...(data.themeMode !== undefined ? { themeMode: data.themeMode } : {}),
        ...(data.layoutStyle !== undefined ? { layoutStyle: data.layoutStyle } : {}),
        ...(data.seoTitle !== undefined ? { seoTitle: data.seoTitle } : {}),
        ...(data.seoDescription !== undefined ? { seoDescription: data.seoDescription } : {}),
        ...(data.allowIndexing !== undefined ? { allowIndexing: data.allowIndexing } : {}),
        ...(data.fontFamily !== undefined ? { fontFamily: data.fontFamily } : {}),
        ...(data.supportUrl !== undefined ? { supportUrl: data.supportUrl } : {}),
      },
    });

    await logMediaAction(mediaId, user.id, 'media.settings_updated', {
      fields: Object.keys(data),
    });
    revalidatePath('/settings');
    return { success: true, publication };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Échec de la mise à jour',
    };
  }
}
