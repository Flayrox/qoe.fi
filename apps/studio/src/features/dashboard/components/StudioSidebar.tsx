'use client';

import React from 'react';
import { getSidebarSurfaces } from '@qoe/config';
import { Sidebar } from '@qoe/ui/sidebar';
import { Logo } from '@qoe/ui';
import { t } from '@lingui/core/macro';

export interface StudioSidebarProps {
  userId?: string | null;
  userName: string;
  userUsername?: string | null;
  userEmail: string;
  userFallback: string;
  userAvatar?: string | null;
  userType?: 'PERSONAL' | 'MEDIA' | string | null;
  brandName: string;
  /** Permissions du média actif ; `undefined` = propriétaire personnel. */
  permissions?: string[];
  canWrite: boolean;
  unreadCount: number;
  isOnNotificationsPage: boolean;
  onLogout?: () => void | Promise<void>;
}

/**
 * 🧭 Sidebar du Studio — vue cliente réelle montée par le layout créateur.
 *
 * Les entrées viennent du manifeste (`getSidebarSurfaces`), les badges restent
 * dynamiques. Composant séparé du Server Component de chargement pour être
 * testable au rendu sans mocker Supabase ni Go.
 */
export function StudioSidebar({
  userId = null,
  userName,
  userUsername,
  userEmail,
  userFallback,
  userAvatar = null,
  userType = null,
  brandName,
  permissions,
  canWrite,
  unreadCount,
  isOnNotificationsPage,
  onLogout,
}: StudioSidebarProps) {
  const menuItems = getSidebarSurfaces('studio', permissions).map((surface) => ({
    title: surface.defaultLabel,
    url: surface.path,
    iconName: surface.iconName,
    badge:
      surface.id === 'studio.notifications' && !isOnNotificationsPage && unreadCount > 0
        ? unreadCount
        : undefined,
  }));

  return (
    <Sidebar
      items={menuItems}
      logo={<Logo className="h-5 w-auto" fillColor="#EE4B2B" />}
      brandName={brandName}
      userId={userId}
      userUsername={userUsername}
      userName={userName}
      userEmail={userEmail}
      userFallback={userFallback}
      userAvatar={userAvatar}
      userType={userType}
      onLogout={onLogout}
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
