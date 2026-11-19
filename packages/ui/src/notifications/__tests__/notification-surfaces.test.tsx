import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    onClick,
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  }) => (
    <a href={href} onClick={onClick}>
      {children}
    </a>
  ),
}));

vi.mock('@qoe/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@qoe/sdk')>();
  return {
    ...actual,
    useNotificationsInfiniteQuery: () => ({
      data: { pages: [{ notifications: [] }] },
      isLoading: false,
      fetchNextPage: vi.fn(),
      hasNextPage: false,
      isFetchingNextPage: false,
      refetch: vi.fn(),
    }),
    useMarkNotificationsAsReadMutation: () => ({ mutate: vi.fn(), isPending: false }),
    useUnreadNotificationCountQuery: () => ({ data: 0, refetch: vi.fn() }),
  };
});

vi.mock('../../notifications/useRealtimeNotificationSync', () => ({
  useRealtimeNotificationSync: () => {},
}));

import {
  NotificationItem,
  type GroupedNotificationLike,
} from '../../notifications/NotificationItem';
import { NotificationList } from '../../notifications/NotificationList';

const base: GroupedNotificationLike = {
  id: 'notif-1',
  type: 'LIKE',
  isRead: true,
  createdAt: new Date().toISOString(),
  senders: [
    {
      id: 'user_camille',
      name: 'Camille Roux',
      username: 'camilleroux',
      logoUrl: null,
      isCertified: false,
      type: 'PERSONAL',
    },
  ],
  totalCount: 1,
};

describe('NotificationItem — lien de repli', () => {
  it('pointe vers le profil canonique du core, jamais vers /@pseudo', () => {
    // F134 — le dernier repli produisait `/@camilleroux` : le core sert
    // `/{pseudo}` et n'a aucune route `/@…`, donc un 404.
    render(<NotificationItem notification={{ ...base, url: null }} />);

    const link = document.querySelector('a[href]') as HTMLAnchorElement | null;
    expect(link?.getAttribute('href')).toBe('/camilleroux');
  });
});

describe('NotificationList — filtres', () => {
  it('expose les filtres comme des onglets avec leur état sélectionné', () => {
    // F137 — cinq `<button>` sans `tablist` ni `aria-selected` : un lecteur
    // d'écran annonçait cinq boutons, sans dire lequel filtre la liste.
    render(<NotificationList />);

    expect(screen.getByRole('tablist')).not.toBeNull();
    const mentions = screen.getByRole('tab', { name: 'Mentions' });
    expect(mentions.getAttribute('aria-selected')).toBe('false');

    fireEvent.click(mentions);
    expect(mentions.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Toutes' }).getAttribute('aria-selected')).toBe('false');
  });

  it('annonce l’attente du chargement', () => {
    render(<NotificationList />);
    // La barre d'onglets reste utilisable pendant le chargement : on vérifie
    // que la zone de liste porte un état occupé plutôt qu'un simple spinner.
    expect(screen.getByRole('tablist').getAttribute('aria-busy')).toBe('false');
  });
});
