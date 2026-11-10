import React from 'react';
import { headers } from 'next/headers';
import { getMainAppUrl } from '@qoe/config';
import { createClient } from '@qoe/supabase/server';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { getActiveWorkspace, type ActiveWorkspace } from '@/lib/active-workspace';
import { logout } from '@/app/login/actions';
import { t } from '@lingui/core/macro';
import { StudioSidebar } from './StudioSidebar';

// Contrats Go (GET /v1/users/me, /v1/notifications/unread-count).
interface MeResponse {
  data: {
    id: string;
    email: string | null;
    username: string | null;
    name: string | null;
    logoUrl: string | null;
    publisherLogoUrl: string | null;
  };
}

export async function AppSidebar() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  // 🚀 Go-first : profil, compteur de notifications non lues et workspace
  // actif (résolution unique + cache par requête).
  let dbUser: {
    id: string;
    email: string | null;
    name: string | null;
    username: string | null;
    logoUrl: string | null;
    publisherLogoUrl: string | null;
  } | null = null;
  let unreadCount = 0;
  let workspace: ActiveWorkspace | null = null;

  try {
    const [me, unread, active] = await Promise.all([
      goFetch<MeResponse>('/v1/users/me'),
      goFetch<{ count: number }>('/v1/notifications/unread-count'),
      authUser ? getActiveWorkspace(authUser.id) : Promise.resolve(null),
    ]);
    dbUser = {
      id: me.data.id,
      email: me.data.email,
      name: me.data.name,
      username: me.data.username,
      logoUrl: me.data.logoUrl,
      publisherLogoUrl: me.data.publisherLogoUrl,
    };
    unreadCount = unread.count ?? 0;
    workspace = active;
  } catch {
    // Erreur Go (API indisponible / non connecté) → le sidebar retombe sur
    // les métadonnées Supabase du user ; compteurs à zéro.
    dbUser = null;
    unreadCount = 0;
    workspace = null;
  }

  const userEmail = dbUser?.email || authUser?.email || 'hello@qoe.fi';
  const userName =
    dbUser?.name ||
    dbUser?.username ||
    (authUser?.user_metadata?.name as string | undefined) ||
    'Creator';
  const userFallback = userName.slice(0, 2).toUpperCase();
  // Avatar du compte : logo personnel, sinon logo de la publication
  // personnelle (convention PERSONAL), sinon avatar Supabase.
  const userAvatar =
    dbUser?.logoUrl ||
    dbUser?.publisherLogoUrl ||
    (authUser?.user_metadata?.avatar_url as string | undefined) ||
    null;

  // 🔕 Pas de badge tant qu'on est sur la page notifications (header posé par middleware.ts)
  let isOnNotificationsPage = false;
  let requestHost: string | undefined;
  try {
    const headerStore = await headers();
    requestHost = headerStore.get('host') ?? undefined;
    isOnNotificationsPage = (headerStore.get('x-pathname') || '').startsWith('/notifications');
  } catch {
    // headers() indisponible (edge cas rare) → on garde le badge
  }

  const brandName = workspace?.type === 'MEDIA' ? workspace.name : t`Studio`;

  // 🎛️ Retour au feed : URL absolue résolue depuis l'hôte de la requête, pour
  // rester sur le domaine de la session SSO (qoe.test, lvh.me, qoe.fi).
  const feedHref = `${getMainAppUrl(requestHost)}/home`;

  // 🛡️ Le chrome suit les permissions effectives (rôle + overrides) du média
  // actif ; un compte PERSONNEL est propriétaire, donc `undefined` = tout voir.
  const isMediaWorkspace = workspace?.type === 'MEDIA';
  const permissions = isMediaWorkspace ? (workspace?.permissions ?? []) : undefined;
  const canWrite =
    !isMediaWorkspace || (workspace?.permissions ?? []).includes('media:create_articles');

  return (
    <StudioSidebar
      userId={dbUser?.id || authUser?.id}
      userName={userName}
      userUsername={dbUser?.username}
      userEmail={userEmail}
      userFallback={userFallback}
      userAvatar={userAvatar}
      brandName={brandName}
      feedHref={feedHref}
      permissions={permissions}
      canWrite={canWrite}
      unreadCount={unreadCount}
      isOnNotificationsPage={isOnNotificationsPage}
      onLogout={logout}
    />
  );
}
