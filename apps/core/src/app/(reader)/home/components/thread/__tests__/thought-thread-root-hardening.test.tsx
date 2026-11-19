// @vitest-environment jsdom
// =====================================================================
// 🧪 ThoughtThreadRoot — états optimistes et pannes
// =====================================================================
// Trois garanties : le parent (feed) reçoit l'état *visé* par le like
// optimiste, une suppression refusée revient en arrière, et un chargement de
// fil qui échoue ne laisse pas un squelette éternel.
// =====================================================================

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/repondeur/thought/post-test-1',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/image', () => ({ default: 'img' }));
vi.mock('@/components/article-overlay/ArticleOverlayProvider', () => ({
  useArticleOverlay: () => null,
}));
vi.mock('@/components/thought-overlay/context', () => ({ useThoughtOverlay: () => null }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'viewer-1' } } }) } }),
}));

const { mockToast, mockToggleLikePost, mockDeletePost, mockGetPostThread } = vi.hoisted(() => ({
  mockToast: { error: vi.fn(), success: vi.fn() },
  mockToggleLikePost: vi.fn(),
  mockDeletePost: vi.fn(),
  mockGetPostThread: vi.fn(),
}));

vi.mock('@qoe/ui/toast', () => ({ toast: mockToast }));

vi.mock('@qoe/sdk/actions/feed', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@qoe/sdk/actions/feed')>();
  return {
    ...actual,
    getPostThreadAction: (...args: unknown[]) => mockGetPostThread(...args),
    toggleLikePostAction: (...args: unknown[]) => mockToggleLikePost(...args),
    deletePostAction: (...args: unknown[]) => mockDeletePost(...args),
  };
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThoughtThreadRoot } from '../ThoughtThreadRoot';
import { ThoughtThreadFocus } from '../ThoughtThreadFocus';
import { ThoughtThreadList } from '../ThoughtThreadList';
import { useThoughtThreadContext, type OptimisticThought } from '../ThoughtThreadContext';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function TestWrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function makePost(overrides?: Partial<OptimisticThought>): OptimisticThought {
  return {
    id: 'post-test-1',
    content: 'Pensée de test',
    createdAt: '2026-11-19T10:00:00.000Z',
    liked: false,
    likesCount: 5,
    reposted: false,
    repostsCount: 2,
    repliesCount: 0,
    authorId: 'author-1',
    author: {
      id: 'author-1',
      name: 'Auteur',
      username: 'auteur',
      subdomain: null,
      logoUrl: null,
      isCertified: false,
      type: 'PERSONAL',
    },
    replies: [],
    ...overrides,
  } as OptimisticThought;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ThoughtThreadRoot (L20b2b2c)', () => {
  it('annonce le like optimiste avec son nouvel état, pas l’ancien', async () => {
    mockToggleLikePost.mockResolvedValue({ ok: true, data: { liked: true } });
    const onInteractionUpdate = vi.fn();

    render(
      <TestWrapper>
        <ThoughtThreadRoot
          postId="post-test-1"
          initialPost={makePost()}
          currentUserId="viewer-1"
          onInteractionUpdate={onInteractionUpdate}
        >
          <ThoughtThreadFocus />
        </ThoughtThreadRoot>
      </TestWrapper>
    );

    fireEvent.click(screen.getByLabelText("J'aime"));

    await waitFor(() => expect(mockToggleLikePost).toHaveBeenCalledWith('post-test-1'));
    // Le feed doit recevoir l'état visé (liké, 6), même si l'appel serveur échoue ensuite.
    expect(onInteractionUpdate).toHaveBeenNthCalledWith(1, 'post-test-1', {
      liked: true,
      likesCount: 6,
    });
  });

  it('revient en arrière quand la suppression de la pensée racine est refusée', async () => {
    mockDeletePost.mockResolvedValue({ ok: false, error: { message: 'Suppression impossible.' } });
    const onClose = vi.fn();
    let deleteThought: ((id: string) => Promise<boolean>) | null = null;

    function Probe() {
      const ctx = useThoughtThreadContext();
      deleteThought = ctx.deleteThought;
      return null;
    }

    render(
      <TestWrapper>
        <ThoughtThreadRoot
          postId="post-test-1"
          initialPost={makePost()}
          currentUserId="viewer-1"
          onClose={onClose}
        >
          <Probe />
        </ThoughtThreadRoot>
      </TestWrapper>
    );

    let result: boolean | null = null;
    await act(async () => {
      result = await deleteThought!('post-test-1');
    });

    // Refus serveur : la vue ne se ferme pas, l'utilisateur voit l'erreur.
    expect(result).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    expect(mockToast.error).toHaveBeenCalled();
  });

  it('sort du squelette quand le chargement du fil échoue', async () => {
    mockGetPostThread.mockRejectedValue(new Error('Go API 503'));

    render(
      <TestWrapper>
        <ThoughtThreadRoot postId="post-test-1" currentUserId="viewer-1">
          <ThoughtThreadList />
        </ThoughtThreadRoot>
      </TestWrapper>
    );

    await waitFor(() =>
      expect(screen.getByText('Soyez le premier à exprimer une réponse.')).toBeTruthy()
    );
  });
});
