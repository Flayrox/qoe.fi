import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { toggleFollowCreatorHomeAction } from '@qoe/sdk/actions/feed';
import { NotificationItem, type GroupedNotificationLike } from '../NotificationItem';

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

vi.mock('@qoe/sdk/actions/feed', () => ({
  resolveProfileAction: vi.fn().mockResolvedValue(undefined),
  toggleFollowCreatorHomeAction: vi.fn().mockResolvedValue({ followed: true }),
}));

const notification: GroupedNotificationLike = {
  id: 'notif-1',
  notificationIds: ['notif-1'],
  type: 'LIKE',
  isRead: false,
  createdAt: new Date().toISOString(),
  senders: [
    {
      id: 'user_camille',
      name: 'Camille Roux',
      username: 'camilleroux',
      logoUrl: null,
      isCertified: false,
      type: 'MEDIA',
    },
  ],
  totalCount: 1,
};

function openCard() {
  const trigger = document.querySelector('[data-profile-hover-trigger]') as HTMLElement | null;
  if (!trigger) throw new Error('déclencheur de carte introuvable');
  fireEvent.focus(trigger);
  return trigger;
}

describe('NotificationItem — carte de survol', () => {
  beforeEach(() => {
    cleanup();
  });

  it('isole les clics du contenu de la carte du <Link> de la ligne', async () => {
    const onMarkRead = vi.fn();
    render(<NotificationItem notification={notification} onMarkRead={onMarkRead} />);

    openCard();
    const stats = await screen.findByText('abonnés');

    fireEvent.click(stats);

    expect(onMarkRead).not.toHaveBeenCalled();
  });

  it('laisse le bouton Suivre de la carte agir sans suivre la ligne', async () => {
    const onMarkRead = vi.fn();
    render(<NotificationItem notification={notification} onMarkRead={onMarkRead} />);

    openCard();
    const follow = await screen.findByRole('button', { name: 'Suivre' });
    fireEvent.click(follow);

    await waitFor(() => {
      expect(toggleFollowCreatorHomeAction).toHaveBeenCalled();
    });
    expect(onMarkRead).not.toHaveBeenCalled();
  });

  it('est focusable et ouvre la carte au focus', async () => {
    render(<NotificationItem notification={notification} />);

    const trigger = document.querySelector('[data-profile-hover-trigger]') as HTMLElement | null;
    if (!trigger) throw new Error('déclencheur de carte introuvable');

    expect(trigger.tabIndex).toBe(0);
    fireEvent.focus(trigger);

    await screen.findByRole('button', { name: 'Suivre' });
  });

  it('ouvre la carte avec Entrée sans passer par le focus', async () => {
    render(<NotificationItem notification={notification} />);

    const trigger = document.querySelector('[data-profile-hover-trigger]') as HTMLElement | null;
    if (!trigger) throw new Error('déclencheur de carte introuvable');

    fireEvent.keyDown(trigger, { key: 'Enter' });

    await screen.findByRole('button', { name: 'Suivre' });
  });

  it('referme la carte quand le focus quitte le déclencheur', async () => {
    render(<NotificationItem notification={notification} />);

    const trigger = openCard();
    await screen.findByRole('button', { name: 'Suivre' });

    fireEvent.blur(trigger, { relatedTarget: document.body });

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Suivre' })).toBeNull();
    });
  });

  it('ouvre la carte au premier tap sans suivre la ligne', async () => {
    const onMarkRead = vi.fn();
    render(<NotificationItem notification={notification} onMarkRead={onMarkRead} />);

    const trigger = document.querySelector('[data-profile-hover-trigger]') as HTMLElement | null;
    if (!trigger) throw new Error('déclencheur de carte introuvable');

    fireEvent.pointerDown(trigger, { pointerType: 'touch' });
    fireEvent.click(trigger);

    expect(onMarkRead).not.toHaveBeenCalled();
    await screen.findByRole('button', { name: 'Suivre' });
  });

  it('transmet la nature média du sender à SafeAvatar', async () => {
    render(<NotificationItem notification={notification} />);

    openCard();
    await screen.findByText('abonnés');

    const avatars = Array.from(document.querySelectorAll('[data-avatar]'));
    expect(avatars.length).toBeGreaterThan(1);
    for (const avatar of avatars) {
      expect(avatar.getAttribute('data-account-type')).toBe('MEDIA');
      expect(avatar.getAttribute('data-avatar-shape')).toBe('square');
    }
  });

  it('suit le lien serveur quand il porte un média', () => {
    render(
      <NotificationItem notification={{ ...notification, url: '/articles/art-1?ws=media-1' }} />
    );

    const link = document.querySelector('a[href="/articles/art-1?ws=media-1"]');
    expect(link).not.toBeNull();
  });

  it('affiche le bon libellé pour FOLLOW_ACCEPTED', () => {
    render(
      <NotificationItem
        notification={{
          ...notification,
          type: 'FOLLOW',
          metadata: { kind: 'FOLLOW_ACCEPTED' },
        }}
      />
    );
    expect(screen.getByText("a accepté votre demande d'abonnement")).toBeDefined();
  });

  it('affiche le bon libellé pour FEATURE_LAUNCH', () => {
    render(
      <NotificationItem
        notification={{
          ...notification,
          type: 'LIKE',
          metadata: { kind: 'FEATURE_LAUNCH' },
        }}
      />
    );
    expect(screen.getByText('est désormais disponible !')).toBeDefined();
  });
});
