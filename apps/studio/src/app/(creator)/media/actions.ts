'use server';

import { createClient as createServerClient } from '@qoe/supabase/server';
import { goFetch } from '@qoe/api-client/actions/utils/go-client';
import { revalidatePath } from 'next/cache';

/**
 * 🔔 Notifie via le backend Go (dédup + prefs gérés en SQL par
 * InsertMediaInviteNotification / InsertMediaMemberJoinedNotification).
 * Le sender est toujours l'utilisateur authentifié côté Go.
 */
async function createMediaNotification(opts: {
  recipientId: string;
  senderId: string;
  type: 'MEDIA_INVITE' | 'MEDIA_MEMBER_JOINED';
  publicationId: string;
}) {
  const path =
    opts.type === 'MEDIA_INVITE'
      ? '/v1/notifications/media-invite'
      : '/v1/notifications/media-member-joined';
  return goFetch<{ success: boolean }>(path, {
    method: 'POST',
    body: { recipientId: opts.recipientId, publicationId: opts.publicationId },
  });
}

async function getAuthUser() {
  const supabase = await createServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) throw new Error('Non authentifié');
  return authUser;
}

/**
 * 🏢 Créer un nouveau Profil Média / Journal collectif
 * Crée la Publication (type MEDIA) + le Media + le membre owner (POST /v1/media).
 */
export async function createMediaAction(
  name: string,
  slug: string,
  bio?: string,
  logoUrl?: string
) {
  try {
    await getAuthUser();

    const media = await goFetch<{ id: string; publicationId: string }>('/v1/media', {
      method: 'POST',
      body: { name, slug, bio: bio ?? '', logoUrl: logoUrl ?? '' },
    });
    revalidatePath('/settings');
    return { success: true as const, media };
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
    await getAuthUser();

    // Go : GET /v1/media/workspaces.
    const res = await goFetch<{ personal: WorkspaceInfo; medias: WorkspaceInfo[] }>(
      '/v1/media/workspaces'
    );
    return { success: true, personal: res.personal, medias: res.medias };
  } catch (err: unknown) {
    console.error('[Get Workspaces Error]', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erreur de récupération des workspaces',
    };
  }
}

// Forme Go du détail média (parité include Prisma consommé par MediaStudioClient).
interface GoMediaDetail {
  id: string;
  publication: {
    id: string;
    name: string;
    slug: string;
    subdomain: string | null;
    customDomain: string | null;
    bio: string | null;
    logoUrl: string | null;
    heroText: string | null;
    headerImageUrl: string | null;
    footerText: string | null;
    accentColor: string | null;
    themeMode: string | null;
    layoutStyle: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
    allowIndexing: boolean;
    supportUrl: string | null;
    fontFamily: string | null;
    _count: { articles: number };
  };
  members: Array<{
    id: string;
    role: string;
    permissions: string[];
    status: string;
    joinedAt: string;
    user: { id: string; name: string | null; username: string | null; logoUrl: string | null };
  }>;
  invites: Array<{
    id: string;
    email: string;
    role: string;
    status: string;
    createdAt: string;
    expiresAt: string | null;
    inviter: { id: string; name: string | null; username: string | null };
  }>;
}

/**
 * 🎯 Récupérer un Média complet (publication + membres) pour le studio média.
 */
export async function getMediaByIdAction(mediaId: string) {
  try {
    await getAuthUser();

    // Go : GET /v1/media/{id}.
    const res = await goFetch<{ media: GoMediaDetail; myRole: string }>(
      `/v1/media/${encodeURIComponent(mediaId)}`
    );
    return {
      success: true as const,
      media: res.media,
      articlesCount: res.media.publication._count.articles,
      myRole: res.myRole,
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
    // Go : GET /v1/media/{id}.
    const res = await goFetch<{ media: GoMediaDetail }>(`/v1/media/${encodeURIComponent(mediaId)}`);
    return { success: true as const, publication: res.media.publication };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erreur de récupération',
    };
  }
}

/**
 * ➕ Inviter un rédacteur / co-auteur dans un Média
 * RBAC : manage_members (vérifié côté Go).
 */
export async function inviteMediaMemberAction(
  mediaId: string,
  email: string,
  role: string = 'writer'
) {
  try {
    await getAuthUser();

    // Go : POST /v1/media/{id}/invites.
    const res = await goFetch<{ success: boolean; alreadyMember?: boolean }>(
      `/v1/media/${encodeURIComponent(mediaId)}/invites`,
      { method: 'POST', body: { email, role } }
    );
    revalidatePath('/advanced');
    return { success: true as const, alreadyMember: res.alreadyMember === true };
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
    await getAuthUser();

    // Go : POST /v1/media/invites/{token}/accept.
    const res = await goFetch<{ success: boolean; mediaId: string }>(
      `/v1/media/invites/${encodeURIComponent(token)}/accept`,
      { method: 'POST' }
    );
    revalidatePath('/advanced');
    return { success: true as const, mediaId: res.mediaId };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : "Échec de l'acceptation" };
  }
}

/**
 * 🔁 Changer le rôle d'un membre.
 * RBAC : manage_members (vérifié côté Go).
 */
export async function updateMediaMemberRoleAction(
  mediaId: string,
  memberUserId: string,
  role: string
) {
  try {
    await getAuthUser();

    // Go : PATCH /v1/media/{id}/members/{userId}.
    await goFetch(
      `/v1/media/${encodeURIComponent(mediaId)}/members/${encodeURIComponent(memberUserId)}`,
      {
        method: 'PATCH',
        body: { role },
      }
    );
    revalidatePath('/advanced');
    return { success: true as const };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Échec du changement de rôle',
    };
  }
}

/**
 * ⚙️ Mettre à jour les permissions granulaires d'un membre.
 * RBAC : manage_members (vérifié côté Go).
 */
export async function updateMediaMemberPermissionsAction(
  mediaId: string,
  memberUserId: string,
  permissions: string[]
) {
  try {
    await getAuthUser();

    // Go : PATCH /v1/media/{id}/members/{userId}/permissions.
    await goFetch(
      `/v1/media/${encodeURIComponent(mediaId)}/members/${encodeURIComponent(memberUserId)}/permissions`,
      { method: 'PATCH', body: { permissions } }
    );
    revalidatePath('/advanced');
    return { success: true as const };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Échec de la mise à jour des permissions',
    };
  }
}

/**
 * 🗑️ Retirer un membre du Média.
 * RBAC : manage_members. Impossible de retirer l'owner (vérifié côté Go).
 */
export async function removeMediaMemberAction(mediaId: string, memberUserId: string) {
  try {
    await getAuthUser();

    // Go : DELETE /v1/media/{id}/members/{userId}.
    await goFetch(
      `/v1/media/${encodeURIComponent(mediaId)}/members/${encodeURIComponent(memberUserId)}`,
      { method: 'DELETE' }
    );
    revalidatePath('/advanced');
    return { success: true as const };
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : 'Échec du retrait' };
  }
}

/**
 * 🎨 Mettre à jour les réglages d'un Média (identité, design, SEO).
 * RBAC : manage_settings (vérifié côté Go).
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
    await getAuthUser();

    // Go : PATCH /v1/media/{id}/settings.
    const res = await goFetch<{ success: boolean; publication: GoMediaDetail['publication'] }>(
      `/v1/media/${encodeURIComponent(mediaId)}/settings`,
      { method: 'PATCH', body: data }
    );
    revalidatePath('/settings');
    return { success: true as const, publication: res.publication };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Échec de la mise à jour',
    };
  }
}
