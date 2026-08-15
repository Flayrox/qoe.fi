'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@qoe/ui/sidebar';
import { Logo } from '@qoe/ui';
import { useUnreadNotificationCount } from '@qoe/ui/notifications';
import { routes } from '@qoe/config/routes';
import { t } from '@lingui/core/macro';

interface AppSidebarProps {
  userName?: string;
  userEmail?: string;
  userAvatar?: string | null;
  userRole?: string;
  onLogout?: () => void | Promise<void>;
}

export function AppSidebar({
  userName = t`Lecteur`,
  userEmail = '',
  userAvatar = null,
  onLogout,
}: AppSidebarProps) {
  const userFallback = userName.slice(0, 2).toUpperCase();
  const unreadCount = useUnreadNotificationCount();
  const pathname = usePathname();
  // 🔕 Pas de badge tant qu'on est sur la page notifications
  const isOnNotificationsPage = pathname.startsWith('/notifications');

  const menuItems = [
    {
      title: t`Accueil`,
      url: routes.feed.home(),
      iconName: 'Home',
    },
    {
      title: t`Recherche`,
      url: '/search',
      iconName: 'Search',
    },
    {
      title: t`Notifications`,
      url: '/notifications',
      iconName: 'Bell',
      badge: !isOnNotificationsPage && unreadCount > 0 ? unreadCount : undefined,
    },
    {
      title: t`Starter Packs`,
      url: routes.feed.starterPacks(),
      iconName: 'Compass',
    },
    {
      title: t`Signets`,
      url: routes.feed.library(),
      iconName: 'Bookmark',
    },
    {
      title: t`Surlignages`,
      url: routes.feed.highlights(),
      iconName: 'Highlighter',
    },
    {
      title: t`Portefeuille`,
      url: routes.feed.billing(),
      iconName: 'Wallet',
    },
  ];

  const handleOpenComposer = () => {
    window.dispatchEvent(new CustomEvent('open-composer'));
  };

  return (
    <Sidebar
      items={menuItems}
      logo={<Logo className="h-5 w-auto" fillColor="#EE4B2B" />}
      brandName="qoe.fi"
      userName={userName}
      userEmail={userEmail}
      userFallback={userFallback}
      userAvatar={userAvatar}
      onLogout={onLogout}
      primaryAction={{
        label: t`Publier une pensée`,
        onClick: handleOpenComposer,
      }}
    />
  );
}
