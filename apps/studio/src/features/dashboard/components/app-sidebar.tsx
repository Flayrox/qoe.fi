import React from 'react';
import { headers } from 'next/headers';
import { createClient } from '@qoe/supabase/server';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { getActiveWorkspace, type ActiveWorkspace } from '@/lib/active-workspace';
import { logout } from '@/app/login/actions';
import { t } from '@lingui/core/macro';
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
  // (PERSONAL = propriétaire, donc tout est visible.)
  const isMediaWorkspace = workspace?.type === 'MEDIA';
  const permissions = workspace?.permissions ?? [];
  // Le chrome suit les permissions effectives (rôle + overrides), pas le
  // rôle nominal : un viewer avec l'override doit voir l'entrée, un writer
  // sans elle ne doit pas découvrir un 403.
  const canAnalyze = !isMediaWorkspace || permissions.includes('media:view_analytics');
  const canDevelop = !isMediaWorkspace || permissions.includes('api_keys:manage');
  const canNewsletter = !isMediaWorkspace || permissions.includes('media:manage_newsletter');
  const canWrite = !isMediaWorkspace || permissions.includes('media:create_articles');

  const menuItems = [
    {
      title: t`Home`,
      url: '/',
      iconName: 'Home',
    },
    {
      title: t`Articles`,
      url: '/articles',
      iconName: 'FileText',
    },
    {
      title: t`Notifications`,
      url: '/notifications',
      iconName: 'Bell',
      badge: !isOnNotificationsPage && unreadCount > 0 ? unreadCount : undefined,
    },
    {
      title: t`Médias`,
      url: '/media',
      iconName: 'Building2',
    },
    ...(canNewsletter
      ? [
          {
            title: t`Newsletters`,
            url: '/newsletters',
            iconName: 'Mail',
          },
        ]
      : []),
    ...(canAnalyze
      ? [
          {
            title: t`Audience`,
            url: '/audience',
            iconName: 'Users',
          },
          {
            title: t`Analytics`,
            url: '/analytics',
            iconName: 'PieChart',
          },
        ]
      : []),
    ...(canDevelop
      ? [
          {
            title: t`Développeur`,
            url: '/developer',
            iconName: 'Code',
          },
        ]
      : []),
    {
      title: t`Settings`,
      url: '/settings',
      iconName: 'Settings',
    },
    {
      title: t`Offre Pro`,
      url: '/pricing',
      iconName: 'Crown',
    },
  ];

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
