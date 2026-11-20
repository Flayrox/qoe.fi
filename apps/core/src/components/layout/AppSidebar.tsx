'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from '@qoe/ui/sidebar';
import { Logo } from '@qoe/ui';
import { useUnreadNotificationCount } from '@qoe/ui/notifications';
import { useUnreadConversationCountQuery } from '@qoe/sdk';
import { getSidebarSurfaces } from '@qoe/config';
import { routes } from '@qoe/config/routes';
import { t } from '@lingui/core/macro';
import { useMemo } from 'react';

// 🌐 Le manifeste porte un libellé français par défaut et documente que « la
// surface consommatrice » le traduit. Sans cette table, la navigation restait
// française dans l'interface `en` ; les `msgid` doivent être des littéraux,
// donc la correspondance se fait par identifiant de surface.
function readerSurfaceLabel(id: string, fallback: string): string {
  switch (id) {
    case 'reader.home':
      return t`Accueil`;
    case 'reader.search':
      return t`Recherche`;
    case 'reader.notifications':
      return t`Notifications`;
    case 'reader.messages':
      return t`Messages`;
    case 'reader.bookmarks':
      return t`Bibliothèque`;
    case 'reader.highlights':
      return t`Surlignages`;
    case 'reader.ebooks':
      return t`Livres`;
    case 'reader.billing':
      return t`Portefeuille`;
    case 'reader.pricing':
      return t`Abonnement Plus`;
    case 'reader.settings':
      return t`Réglages`;
    default:
      return fallback;
  }
}

interface AppSidebarProps {
  userId?: string | null;
  userName?: string;
  userUsername?: string | null;
  userEmail?: string;
  userAvatar?: string | null;
  userType?: 'PERSONAL' | 'MEDIA' | string | null;
  userRole?: string;
  onLogout?: () => void | Promise<void>;
  /** URL absolue du Studio, résolue côté serveur depuis l'hôte de la requête. */
  studioHref: string;
}

export function AppSidebar({
  userId = null,
  userName = t`Lecteur`,
  userUsername = null,
  userEmail = '',
  userAvatar = null,
  userType = null,
  onLogout,
  studioHref,
}: AppSidebarProps) {
  const userFallback = userName.slice(0, 2).toUpperCase();
  const unreadCount = useUnreadNotificationCount();
  const { data: unreadMessages = 0 } = useUnreadConversationCountQuery();
  const pathname = usePathname();
  // 🔕 Pas de badge tant qu'on est sur la page notifications
  const isOnNotificationsPage = pathname.startsWith('/notifications');
  const isOnMessagesPage = pathname.startsWith('/messages');

  const profileHref = useMemo(() => {
    const username = userUsername?.trim().replace(/^@/, '').toLowerCase();
    return username ? routes.feed.profile(username) : routes.feed.settings();
  }, [userUsername]);

  // 🗺️ La navigation vient du manifeste de surfaces. Seule l'entrée « Mon
  // profil » reste composée ici : son chemin dépend du viewer connecté, il ne
  // peut donc pas être une surface statique.
  const menuItems = useMemo(() => {
    const surfaces = getSidebarSurfaces('reader');
    const items = surfaces.flatMap((surface) => {
      const item = {
        title: readerSurfaceLabel(surface.id, surface.defaultLabel),
        url: surface.path,
        iconName: surface.iconName,
        badge:
          surface.id === 'reader.notifications' && !isOnNotificationsPage && unreadCount > 0
            ? unreadCount
            : surface.id === 'reader.messages' && !isOnMessagesPage && unreadMessages > 0
              ? unreadMessages
              : undefined,
      };
      if (surface.id !== 'reader.settings') return [item];
      return [{ title: t`Mon profil`, url: profileHref, iconName: 'CircleUserRound' }, item];
    });
    return items;
  }, [isOnNotificationsPage, isOnMessagesPage, unreadCount, unreadMessages, profileHref]);

  const handleOpenComposer = () => {
    window.dispatchEvent(new CustomEvent('open-composer'));
  };

  return (
    <Sidebar
      items={menuItems}
      logo={<Logo className="h-5 w-auto" fillColor="#EE4B2B" />}
      brandName="qoefi"
      // 🎛️ Le logo bascule vers le Studio : même geste que le plateau de hi,
      // où le côté gauche du logo choisit d'écrire.
      appSwitch={{ current: 'reader', counterpartHref: studioHref }}
      userId={userId}
      userUsername={userUsername}
      userName={userName}
      userEmail={userEmail}
      userFallback={userFallback}
      userAvatar={userAvatar}
      userType={userType}
      onLogout={onLogout}
      primaryAction={{
        label: t`Publier une pensée`,
        onClick: handleOpenComposer,
      }}
    />
  );
}
