import React from 'react';
import { cookies, headers } from 'next/headers';
import { createClient } from '@qoe/supabase/server';
import { prisma } from '@qoe/db/client';
import { goFetch } from '@qoe/api-client/actions/utils/go-client';
import { logout } from '@/app/login/actions';
import { t } from '@lingui/core/macro';
import { Sidebar } from '@qoe/ui/sidebar';
import { Logo } from '@qoe/ui';

// Contrats Go (GET /v1/users/me, /v1/notifications/unread-count, /v1/media/workspaces).
interface MeResponse {
  data: {
    id: string;
    email: string | null;
    username: string | null;
    name: string | null;
    logoUrl: string | null;
  };
}
interface WorkspacesResponse {
  medias: { id: string; name: string }[];
}

function parseCookie(raw: string | null | undefined): { type?: string; id?: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as { type?: string; id?: string };
    if (parsed.type && parsed.id) return parsed;
    return null;
  } catch {
    return null;
  }
}

export async function AppSidebar() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  // Résout le workspace actif (cookie) pour adapter le Studio.
  let activeMediaId: string | null = null;
  try {
    const cookieStore = await cookies();
    const parsed = parseCookie(cookieStore.get('qoe_active_workspace')?.value ?? null);
    if (parsed?.type === 'MEDIA' && parsed.id) activeMediaId = parsed.id;
  } catch {
    // cookie absent/invalide → Studio personnel
  }

  // 🚀 Go-first : profil, compteur de notifications non lues, nom du média actif.
  let dbUser: {
    id: string;
    email: string | null;
    name: string | null;
    username: string | null;
    logoUrl: string | null;
  } | null = null;
  let unreadCount = 0;
  let mediaBrandName: string | null = null;

  try {
    const [me, unread, workspaces] = await Promise.all([
      goFetch<MeResponse>('/v1/users/me'),
      goFetch<{ count: number }>('/v1/notifications/unread-count'),
      goFetch<WorkspacesResponse>('/v1/media/workspaces'),
    ]);
    dbUser = {
      id: me.data.id,
      email: me.data.email,
      name: me.data.name,
      username: me.data.username,
      logoUrl: me.data.logoUrl,
    };
    unreadCount = unread.count ?? 0;
    if (activeMediaId) {
      mediaBrandName = workspaces.medias.find((m) => m.id === activeMediaId)?.name ?? null;
    }
  } catch {
    // 🐢 Fallback dev (sans QOE_API_URL) : Prisma.
    dbUser = authUser
      ? await prisma.user.findUnique({
          where: { id: authUser.id },
        })
      : null;

    unreadCount = dbUser
      ? await prisma.notification.count({ where: { recipientId: dbUser.id, isRead: false } })
      : 0;

    if (activeMediaId && dbUser) {
      const member = await prisma.mediaMember.findFirst({
        where: { mediaId: activeMediaId, userId: dbUser.id },
        include: { media: { include: { publication: { select: { name: true } } } } },
      });
      if (member) {
        mediaBrandName = member.media.publication.name;
      }
    }
  }

  const userEmail = dbUser?.email || authUser?.email || 'hello@qoe.fi';
  const userName =
    dbUser?.name ||
    dbUser?.username ||
    (authUser?.user_metadata?.name as string | undefined) ||
    'Creator';
  const userFallback = userName.slice(0, 2).toUpperCase();
  const userAvatar =
    dbUser?.logoUrl || (authUser?.user_metadata?.avatar_url as string | undefined) || null;

  // 🔕 Pas de badge tant qu'on est sur la page notifications (header posé par middleware.ts)
  let isOnNotificationsPage = false;
  try {
    const headerStore = await headers();
    isOnNotificationsPage = (headerStore.get('x-pathname') || '').startsWith('/notifications');
  } catch {
    // headers() indisponible (edge cas rare) → on garde le badge
  }

  const brandName = mediaBrandName ?? t`Studio`;

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
    {
      title: t`Newsletters`,
      url: '/newsletters',
      iconName: 'Mail',
    },
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
    {
      title: t`Développeur / API`,
      url: '/developer',
      iconName: 'Code',
    },
    {
      title: t`Webhooks`,
      url: '/developer/webhooks',
      iconName: 'Webhook',
    },
    {
      title: t`Paramètres`,
      url: '/settings',
      iconName: 'Settings',
    },
    {
      title: t`Importation (Substack)`,
      url: '/import',
      iconName: 'Upload',
    },
  ];

  return (
    <Sidebar
      items={menuItems}
      logo={<Logo className="h-5 w-auto" fillColor="#EE4B2B" />}
      brandName={brandName}
      userName={userName}
      userEmail={userEmail}
      userFallback={userFallback}
      userAvatar={userAvatar}
      onLogout={logout}
      primaryAction={{
        label: t`Nouvel Écrit`,
        href: '/articles/new',
      }}
    />
  );
}
