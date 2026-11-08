import React from 'react';
import { headers } from 'next/headers';
import { createClient } from '@qoe/supabase/server';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { getActiveWorkspace, type ActiveWorkspace } from '@/lib/active-workspace';
import { logout } from '@/app/login/actions';
import { t } from '@lingui/core/macro';
import { getSidebarSurfaces } from '@qoe/config';
import { Sidebar } from '@qoe/ui/sidebar';
import { Logo } from '@qoe/ui';

// Contrats Go (GET /v1/users/me, /v1/notifications/unread-count).
interface MeResponse {
  data: {
    id: string;
    email: string | null;
    username: string | null;
    name: string | null;
    logoUrl: string | null;
    publicationLogoUrl: string | null;
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
    publicationLogoUrl: string | null;
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
      publicationLogoUrl: me.data.publicationLogoUrl,
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
    dbUser?.publicationLogoUrl ||
    (authUser?.user_metadata?.avatar_url as string | undefined) ||
    null;

  // 🔕 Pas de badge tant qu'on est sur la page notifications (header posé par middleware.ts)
  let isOnNotificationsPage = false;
  try {
    const headerStore = await headers();
    isOnNotificationsPage = (headerStore.get('x-pathname') || '').startsWith('/notifications');
  } catch {
    // headers() indisponible (edge cas rare) → on garde le badge
  }

  const brandName = workspace?.type === 'MEDIA' ? workspace.name : t`Studio`;

  // 🛡️ Le chrome suit le rôle réel dans le média actif : un writer/viewer ne
  // doit pas découvrir un 403 après avoir cliqué sur Analytics ou Développeur.
  // (PERSONAL = propriétaire, donc tout est visible.) Le menu est dérivé du
  // manifeste de surfaces : ajouter une page ne se fait plus ici.
  const isMediaWorkspace = workspace?.type === 'MEDIA';
  const permissions = workspace?.permissions ?? [];
  const canWrite = !isMediaWorkspace || permissions.includes('media:create_articles');

  const menuItems = getSidebarSurfaces('studio', isMediaWorkspace ? permissions : undefined).map(
    (surface) => ({
      title: surface.defaultLabel,
      url: surface.path,
      iconName: surface.iconName,
      badge:
        surface.id === 'studio.notifications' && !isOnNotificationsPage && unreadCount > 0
          ? unreadCount
          : undefined,
    })
  );

  return (
    <Sidebar
      items={menuItems}
      logo={<Logo className="h-5 w-auto" fillColor="#EE4B2B" />}
      brandName={brandName}
      userId={dbUser?.id || authUser?.id}
      userUsername={dbUser?.username}
      userName={userName}
      userEmail={userEmail}
      userFallback={userFallback}
      userAvatar={userAvatar}
      onLogout={logout}
      primaryAction={
        canWrite
          ? {
              label: t`Nouvel Écrit`,
              href: '/articles/new',
            }
          : undefined
      }
    />
  );
}
