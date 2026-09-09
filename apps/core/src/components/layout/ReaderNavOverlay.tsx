'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Bell, Mail } from 'lucide-react';
import { Logo, SafeAvatar } from '@qoe/ui';
import { useUnreadNotificationCount } from '@qoe/ui/notifications';
import { useUnreadConversationCountQuery } from '@qoe/sdk';
import { t } from '@lingui/core/macro';

interface ReaderNavOverlayProps {
  userName?: string;
  userUsername?: string | null;
  userEmail?: string;
  userAvatar?: string | null;
  userRole?: string;
  onLogout?: () => void | Promise<void>;
}

export function ReaderNavOverlay({
  userName = t`Lecteur`,
  userUsername = null,
  userAvatar = null,
}: ReaderNavOverlayProps) {
  const pathname = usePathname();
  const unreadCount = useUnreadNotificationCount();
  const { data: unreadMessages = 0 } = useUnreadConversationCountQuery();

  // 🔕 Pas de badge tant qu'on est sur la page concernée
  const showNotificationBadge = !pathname.startsWith('/notifications') && unreadCount > 0;
  const showMessagesBadge = !pathname.startsWith('/messages') && unreadMessages > 0;

  const profileHref = userUsername?.trim()
    ? `/${userUsername.trim().replace(/^@/, '').toLowerCase()}`
    : '/settings';

  const handleToggleSidebar = () => {
    window.dispatchEvent(new CustomEvent('toggle-mobile-sidebar'));
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-30 h-14 bg-background/85 backdrop-blur-xl border-b border-border/40 px-3 sm:px-4 flex items-center justify-between md:hidden select-none">
      {/* ── GAUCHE : Bouton Hamburger & Marque ── */}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={handleToggleSidebar}
          className="p-2 -ml-1 rounded-xl text-foreground/80 hover:text-foreground hover:bg-muted/60 active:scale-95 transition-all cursor-pointer outline-none"
          aria-label={t`Ouvrir le menu`}
        >
          <Menu className="w-5 h-5" />
        </button>

        <Link href="/home" className="flex items-center gap-2 outline-none group">
          <Logo className="h-5 w-auto" fillColor="#EE4B2B" />
          <span className="font-bold text-sm tracking-tight text-foreground group-hover:opacity-85 transition-opacity">
            qoe<span className="text-primary">.fi</span>
          </span>
        </Link>
      </div>

      {/* ── DROITE : Raccourcis Notifications, Messages & Profil ── */}
      <div className="flex items-center gap-1">
        <Link
          href="/notifications"
          className="relative p-2 rounded-xl text-foreground/80 hover:text-foreground hover:bg-muted/60 active:scale-95 transition-all outline-none"
          aria-label={t`Notifications`}
        >
          <Bell className="w-4 h-4" />
          {showNotificationBadge && (
            <span className="absolute top-2 right-2 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
          )}
        </Link>

        <Link
          href="/messages"
          className="relative p-2 rounded-xl text-foreground/80 hover:text-foreground hover:bg-muted/60 active:scale-95 transition-all outline-none"
          aria-label={t`Messages`}
        >
          <Mail className="w-4 h-4" />
          {showMessagesBadge && (
            <span className="absolute top-2 right-2 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
          )}
        </Link>

        <Link
          href={profileHref}
          className="p-1 rounded-full hover:ring-2 hover:ring-primary/20 active:scale-95 transition-all outline-none ml-1"
          aria-label={t`Mon profil`}
        >
          <SafeAvatar
            src={userAvatar}
            name={userName}
            className="w-6 h-6 rounded-full text-[10px] font-semibold"
          />
        </Link>
      </div>
    </header>
  );
}
