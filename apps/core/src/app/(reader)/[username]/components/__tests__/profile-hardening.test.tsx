// @vitest-environment jsdom
// =====================================================================
// 🧪 Profil — onglet de suivi et URL de publication
// =====================================================================
// Deux garanties : changer d'onglet dans la liste des abonnés pendant un
// chargement ne laisse pas une liste vide définitive, et le lien du site
// d'une publication suit la résolution d'origine du repo (jamais un domaine
// de production écrit en dur).
// =====================================================================

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/auteur',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/image', () => ({ default: 'img' }));
vi.mock('@/components/article-overlay/ArticleOverlayProvider', () => ({
  useArticleOverlay: () => null,
}));
vi.mock('@/components/thought-overlay/context', () => ({ useThoughtOverlay: () => null }));
vi.mock('@qoe/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@qoe/sdk')>();
  return {
    ...actual,
    useDeletePostMutation: () => ({ mutateAsync: vi.fn() }),
    updateActorShadow: vi.fn(),
    withShadowMutation: vi.fn(async (opts: { mutation: () => Promise<unknown> }) =>
      opts.mutation()
    ),
  };
});

const { mockGetFollowList, mockToast } = vi.hoisted(() => ({
  mockGetFollowList: vi.fn(),
  mockToast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@qoe/ui/toast', () => ({ toast: mockToast }));
vi.mock('@qoe/sdk/actions/feed', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@qoe/sdk/actions/feed')>();
  return {
    ...actual,
    getFollowListAction: mockGetFollowList,
    toggleFollowCreatorHomeAction: vi.fn(),
    removeFollowerAction: vi.fn(),
  };
});

import { routes } from '@qoe/config/routes';
import { FollowList } from '../FollowList';
import { ProfileView } from '../ProfileView';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('FollowList (L20b2b4)', () => {
  it('charge le nouvel onglet même si la première page est encore en vol', async () => {
    let resolveFirst: ((value: unknown) => void) | null = null;
    mockGetFollowList
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValue({ ok: true, data: { items: [], hasMore: false, nextCursor: null } });

    render(<FollowList handle="auteur" initialTab="followers" currentUserId="viewer-1" />);
    await waitFor(() => expect(mockGetFollowList).toHaveBeenCalledTimes(1));

    // L'utilisateur bascule d'onglet avant la fin du premier chargement.
    fireEvent.click(screen.getByText('Abonnements'));
    resolveFirst!({ ok: true, data: { items: [], hasMore: false, nextCursor: null } });

    await waitFor(() => expect(mockGetFollowList).toHaveBeenCalledTimes(2));
    expect((mockGetFollowList.mock.calls[1][0] as { tab: string }).tab).toBe('following');
  });
});

describe('ProfileView (L20b2b4)', () => {
  it("dérive l'URL du site de la publication, jamais un domaine en dur", () => {
    render(
      <ProfileView
        profileUser={{
          id: 'profile-1',
          ownerUserId: 'owner-1',
          type: 'MEDIA',
          name: 'Les Docs',
          username: 'lesdocs',
          subdomain: 'lesdocs',
          customDomain: null,
          logoUrl: null,
          heroText: null,
          website: null,
          createdAt: '2020-01-01T00:00:00.000Z',
          posts: [],
          articles: [],
          _count: { followers: 1, following: 1, posts: 0 },
        }}
        currentUserId="viewer-1"
        isOwnProfile={false}
        initialIsFollowing={false}
        initialPublisherId="profile-1"
      />
    );

    const link = screen.getByRole('link', { name: /lesdocs/i });
    expect(link.getAttribute('href')).toBe(routes.tenant.home('lesdocs'));
  });
});
