import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { ProfileHoverCard } from '../ProfileHoverCard';
import { resolveProfileAction, toggleFollowCreatorHomeAction } from '@qoe/sdk/actions/feed';

vi.mock('@qoe/sdk/actions/feed', () => ({
  resolveProfileAction: vi.fn(),
  toggleFollowCreatorHomeAction: vi.fn(),
}));

const user = {
  id: 'user_camille',
  name: 'Camille Dubois',
  username: 'camille',
  logoUrl: null,
  type: 'PERSONAL' as const,
};

describe('ProfileHoverCard — navigation', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('laisse le lien parent gérer le clic (navigation client, pas de rechargement)', () => {
    const onLinkClick = vi.fn((event: React.MouseEvent) => event.preventDefault());
    const onOpenProfile = vi.fn();

    render(
      <a href="/camille" onClick={onLinkClick}>
        <ProfileHoverCard user={user} onOpenProfile={onOpenProfile}>
          <span>Avatar de Camille</span>
        </ProfileHoverCard>
      </a>
    );

    fireEvent.click(screen.getByText('Avatar de Camille'));

    // L'événement doit remonter jusqu'au <Link> : c'est lui qui fait la
    // navigation côté client et qui empêche le href natif de recharger la page.
    expect(onLinkClick).toHaveBeenCalledTimes(1);
    expect(onLinkClick.mock.calls[0]?.[0].defaultPrevented).toBe(true);
    expect(onOpenProfile).not.toHaveBeenCalled();
  });

  it('appelle onOpenProfile quand le déclencheur n’est pas dans un lien', () => {
    const onOpenProfile = vi.fn();

    render(
      <ProfileHoverCard user={user} onOpenProfile={onOpenProfile}>
        <span>Camille</span>
      </ProfileHoverCard>
    );

    fireEvent.click(screen.getByText('Camille'));

    expect(onOpenProfile).toHaveBeenCalledWith('camille');
  });
});

describe('ProfileHoverCard — contenu de la carte ouverte', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('affiche le badge "Média" quand type="MEDIA" ou isMedia=true, et l’omet pour PERSONAL', () => {
    const mediaUser = {
      id: 'user_media',
      name: 'Journal Indépendant',
      username: 'journal_indep',
      type: 'MEDIA' as const,
      isMedia: true,
    };

    const { unmount } = render(
      <ProfileHoverCard user={mediaUser}>
        <span>Ouvrir Journal</span>
      </ProfileHoverCard>
    );

    fireEvent.focus(screen.getByText('Ouvrir Journal'));
    const content = document.querySelector('[data-profile-hover-content]');
    expect(content).not.toBeNull();
    expect(content?.textContent).toContain('Média');

    unmount();

    render(
      <ProfileHoverCard user={user}>
        <span>Ouvrir Camille</span>
      </ProfileHoverCard>
    );

    fireEvent.focus(screen.getByText('Ouvrir Camille'));
    const personalContent = document.querySelector('[data-profile-hover-content]');
    expect(personalContent).not.toBeNull();
    expect(personalContent?.textContent).not.toContain('Média');
  });

  it('affiche la bio passée en prop', () => {
    const userWithBio = {
      id: 'user_bio_direct',
      name: 'Bio User',
      username: 'bio_user_direct',
      bio: 'Écrivain et observateur du web libre.',
      type: 'PERSONAL' as const,
    };
    render(
      <ProfileHoverCard user={userWithBio}>
        <span>Profil avec Bio</span>
      </ProfileHoverCard>
    );

    fireEvent.focus(screen.getByText('Profil avec Bio'));
    expect(screen.getByText('Écrivain et observateur du web libre.')).toBeDefined();
  });

  it('résout la bio de façon paresseuse via resolveProfileAction à l’ouverture', async () => {
    const mockResolve = vi.mocked(resolveProfileAction);
    mockResolve.mockResolvedValueOnce({
      data: {
        profileUser: {
          id: 'user_lazy',
          name: 'Penseur Vagabond',
          username: 'vagabond',
          heroText: 'Bio chargée paresseusement à l’ouverture.',
          type: 'PERSONAL',
          isCertified: true,
          _count: {
            followers: 120,
            following: 45,
            articles: 10,
          },
        },
        isFollowing: false,
      },
    } as unknown as Awaited<ReturnType<typeof resolveProfileAction>>);

    render(
      <ProfileHoverCard username="vagabond">
        <span>Vagabond</span>
      </ProfileHoverCard>
    );

    fireEvent.focus(screen.getByText('Vagabond'));

    expect(mockResolve).toHaveBeenCalledWith('vagabond');
    expect(await screen.findByText('Bio chargée paresseusement à l’ouverture.')).toBeDefined();
    expect(await screen.findByText('120')).toBeDefined();
  });

  it('bascule le bouton Suivre <-> Abonné(e) de manière optimiste', async () => {
    const mockToggleFollow = vi.mocked(toggleFollowCreatorHomeAction);
    mockToggleFollow.mockResolvedValue({
      ok: true,
      data: { followed: true },
    } as unknown as Awaited<ReturnType<typeof toggleFollowCreatorHomeAction>>);

    render(
      <ProfileHoverCard
        user={{
          id: 'user_toggle',
          name: 'Toggle User',
          username: 'toggle_user',
          isFollowing: false,
        }}
      >
        <span>Toggle User</span>
      </ProfileHoverCard>
    );

    fireEvent.focus(screen.getByText('Toggle User'));

    const followBtn = await screen.findByRole('button', { name: /suivre/i });
    expect(followBtn.textContent).toContain('Suivre');

    // Clic pour suivre -> passage optimiste à Abonné(e)
    fireEvent.click(followBtn);
    expect(mockToggleFollow).toHaveBeenCalledWith('user_toggle');
    expect(await screen.findByRole('button', { name: /abonné\(e\)/i })).toBeDefined();

    // Clic pour se désabonner -> retour optimiste à Suivre
    const unfollowBtn = screen.getByRole('button', { name: /abonné\(e\)/i });
    fireEvent.click(unfollowBtn);
    expect(await screen.findByRole('button', { name: /suivre/i })).toBeDefined();
  });

  it('annule le toggle optimiste (rollback) en cas d’erreur de l’action', async () => {
    const mockToggleFollow = vi.mocked(toggleFollowCreatorHomeAction);
    mockToggleFollow.mockRejectedValueOnce(new Error('Network failure'));

    render(
      <ProfileHoverCard
        user={{
          id: 'user_rollback',
          name: 'Rollback User',
          username: 'rollback_user',
          isFollowing: false,
        }}
      >
        <span>Rollback User</span>
      </ProfileHoverCard>
    );

    fireEvent.focus(screen.getByText('Rollback User'));

    const followBtn = await screen.findByRole('button', { name: /suivre/i });
    expect(followBtn.textContent).toContain('Suivre');

    // Clic : l'action échoue, l'état doit revenir à Suivre
    fireEvent.click(followBtn);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /suivre/i })).toBeDefined();
    });
  });

  it('applique le positionnement demandé via la prop side (bottom vs top)', async () => {
    render(
      <ProfileHoverCard user={user} side="bottom">
        <span>Camille Bottom</span>
      </ProfileHoverCard>
    );

    fireEvent.focus(screen.getByText('Camille Bottom'));

    const content = await screen.findByText('@camille');
    const container = content.closest('[data-slot="hover-card-content"]');
    expect(container?.className).toContain('top-full');
  });
});
