// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/repondeur/thought/post-test-1',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/image', () => ({ default: 'img' }));

vi.mock('@/components/article-overlay/ArticleOverlayProvider', () => ({
  useArticleOverlay: () => null,
}));

vi.mock('@/components/thought-overlay/context', () => ({
  useThoughtOverlay: () => null,
}));

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'viewer-1' } } }) },
  }),
}));

const { mockToast, mockToggleLikePost, mockToggleRepostPost } = vi.hoisted(() => ({
  mockToast: {
    error: vi.fn(),
    success: vi.fn(),
  },
  mockToggleLikePost: vi.fn(),
  mockToggleRepostPost: vi.fn(),
}));

vi.mock('@qoe/ui/toast', () => ({
  toast: mockToast,
}));

vi.mock('@qoe/sdk/actions/feed', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@qoe/sdk/actions/feed')>();
  return {
    ...actual,
    getPostThreadAction: vi.fn().mockResolvedValue({ ok: true, data: { post: null } }),
    toggleLikePostAction: (...args: unknown[]) => mockToggleLikePost(...args),
    toggleRepostPostAction: (...args: unknown[]) => mockToggleRepostPost(...args),
  };
});

import { ThoughtThreadRoot } from '../ThoughtThreadRoot';
import { ThoughtThreadFocus } from '../ThoughtThreadFocus';
import type { OptimisticThought } from '../ThoughtThreadContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function TestWrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function makeTestPost(overrides?: Partial<OptimisticThought>): OptimisticThought {
  return {
    id: 'post-test-1',
    content: 'Pensée de test pour like et repost',
    createdAt: new Date().toISOString(),
    liked: false,
    likesCount: 5,
    reposted: false,
    repostsCount: 2,
    repliesCount: 0,
    authorId: 'author-blocked',
    author: {
      id: 'author-blocked',
      name: 'Auteur Bloqué',
      username: 'auteur_bloque',
      subdomain: null,
      logoUrl: null,
      isCertified: false,
      type: 'PERSONAL',
    },
    ...overrides,
  };
}

describe('Engagement — Rollback optimiste en cas de blocage (403)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('annule le like optimiste et affiche le message générique quand le compte est bloqué', async () => {
    mockToggleLikePost.mockResolvedValueOnce({
      ok: false,
      error: { message: 'Action impossible : ce compte est bloqué.' },
    });

    const onInteractionUpdate = vi.fn();
    const initialPost = makeTestPost();

    render(
      <TestWrapper>
        <ThoughtThreadRoot
          postId="post-test-1"
          initialPost={initialPost}
          currentUserId="viewer-1"
          onInteractionUpdate={onInteractionUpdate}
        >
          <ThoughtThreadFocus />
        </ThoughtThreadRoot>
      </TestWrapper>
    );

    // Trouve le bouton de like
    const likeButton = screen.getByLabelText("J'aime");
    expect(likeButton).toBeDefined();

    // Clic pour liker
    fireEvent.click(likeButton);

    // Le backend renvoie 403 / refus de blocage -> le rollback restaure l'état et toast l'erreur
    await waitFor(() => {
      expect(mockToggleLikePost).toHaveBeenCalledWith('post-test-1');
      expect(mockToast.error).toHaveBeenCalledWith('Action impossible : ce compte est bloqué.');
    });

    // onInteractionUpdate a été rappelé pour synchroniser le rollback
    expect(onInteractionUpdate).toHaveBeenCalledWith('post-test-1', {
      liked: false,
      likesCount: 5,
    });
  });

  it('annule le repost optimiste et affiche le message générique quand le compte est bloqué', async () => {
    mockToggleRepostPost.mockResolvedValueOnce({
      ok: false,
      error: { message: 'Action impossible : ce compte est bloqué.' },
    });

    const initialPost = makeTestPost();

    render(
      <TestWrapper>
        <ThoughtThreadRoot postId="post-test-1" initialPost={initialPost} currentUserId="viewer-1">
          <ThoughtThreadFocus />
        </ThoughtThreadRoot>
      </TestWrapper>
    );

    // Trouve le bouton de repost
    const repostButton = screen.getByLabelText('Repartager');
    expect(repostButton).toBeDefined();

    // Clic sur le déclencheur de repost
    fireEvent.click(repostButton);

    // Clic sur l'option de repost direct
    const directRepostOption = await screen.findByText('Repartager');
    fireEvent.click(directRepostOption);

    await waitFor(() => {
      expect(mockToggleRepostPost).toHaveBeenCalledWith('post-test-1');
      expect(mockToast.error).toHaveBeenCalledWith('Action impossible : ce compte est bloqué.');
    });
  });
});
