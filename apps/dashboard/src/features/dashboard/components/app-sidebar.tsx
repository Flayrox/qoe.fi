import React from 'react';
import { cookies } from 'next/headers';
import { createClient } from '@qoe/supabase/server';
import { prisma } from '@qoe/db/client';
import { logout } from '@/app/login/actions';
import { t } from '@lingui/core/macro';
import { Sidebar } from '@qoe/ui/sidebar';
import { Logo } from '@qoe/ui';

export async function AppSidebar() {
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  const user = authUser
    ? await prisma.user.findUnique({
        where: { id: authUser.id },
      })
    : null;

  const userEmail = user?.email || authUser?.email || 'hello@qoe.fi';
  const userName =
    user?.name ||
    user?.username ||
    (authUser?.user_metadata?.name as string | undefined) ||
    'Creator';
  const userFallback = userName.slice(0, 2).toUpperCase();
  const userAvatar =
    user?.logoUrl || (authUser?.user_metadata?.avatar_url as string | undefined) || null;

  // Résout le workspace actif (cookie) pour adapter le Studio
  let brandName = t`Studio`;
  try {
    const cookieStore = await cookies();
    const activeRaw = cookieStore.get('qoe_active_workspace')?.value ?? null;
    if (activeRaw) {
      const parsed = JSON.parse(decodeURIComponent(activeRaw)) as { type?: string; id?: string };
      if (parsed?.type === 'MEDIA' && parsed.id && user) {
        const member = await prisma.mediaMember.findFirst({
          where: { mediaId: parsed.id, userId: user.id },
          include: { media: { include: { publication: { select: { name: true } } } } },
        });
        if (member) {
          brandName = member.media.publication.name;
        }
      }
    }
  } catch {
    // cookie absent/invalide → Studio personnel
  }

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
