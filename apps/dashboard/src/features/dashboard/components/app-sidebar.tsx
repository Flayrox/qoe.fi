import React from 'react';
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
      brandName={t`Studio`}
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
