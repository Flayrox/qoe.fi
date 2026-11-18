// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { feedKeys } from '../query-keys';
import { createOptimisticLikeMutationOptions } from '../hooks/useOptimisticLike';
import { useDeletePostMutation } from '../hooks/useDeletePostMutation';
import { useToggleMutationQueue } from '../lib/useToggleMutationQueue';

// Durcissement du cache optimiste (L06b) :
// - les deux alias de compteur (`likeCount` / `likesCount`) restent alignés ;
// - un snapshot restauré rend exactement l'état d'avant ;
// - une suppression refusée par le serveur ne masque plus la pensée ;
// - deux toggles identiques consécutifs ne laissent plus de promesse pendante.

// `vi.hoisted` : la fabrique de mock est remontée avant les imports, elle ne
// peut donc pas capturer une variable déclarée plus bas. On mocke uniquement
// l'action utilisée (importer le barrel réel charge la config d'environnement).
const { deletePostAction } = vi.hoisted(() => ({ deletePostAction: vi.fn() }));

vi.mock('../actions/feed', () => ({ deletePostAction }));

type FeedPage = { data: Array<Record<string, unknown>> };

function feedWith(post: Record<string, unknown>) {
  return { pages: [{ data: [post] }] };
}

describe('cache feed — alias de compteurs', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
  });

  it('met à jour likeCount ET likesCount au like', async () => {
    queryClient.setQueryData(feedKeys.timeline('for-you'), feedWith({ id: 'p1', likeCount: 4 }));
    const options = createOptimisticLikeMutationOptions(queryClient);

    await options.onMutate({
      thoughtId: 'p1',
      isLikedCurrent: false,
      likeMutationFn: vi.fn(),
    });

    const post = (
      queryClient.getQueryData(feedKeys.timeline('for-you')) as {
        pages: FeedPage[];
      }
    ).pages[0].data[0];
    expect(post.likeCount).toBe(5);
    expect(post.likesCount).toBe(5);
    expect(post.liked).toBe(true);
  });

  it('ne descend jamais sous zéro et restaure le snapshot', async () => {
    const initial = feedWith({ id: 'p1', likesCount: 0, liked: true });
    queryClient.setQueryData(feedKeys.timeline('for-you'), initial);
    const options = createOptimisticLikeMutationOptions(queryClient);

    const context = await options.onMutate({
      thoughtId: 'p1',
      isLikedCurrent: true,
      likeMutationFn: vi.fn(),
    });

    const afterUnlike = queryClient.getQueryData(feedKeys.timeline('for-you')) as {
      pages: FeedPage[];
    };
    expect(afterUnlike.pages[0].data[0].likeCount).toBe(0);

    options.onError(
      new Error('refusé'),
      {
        thoughtId: 'p1',
        isLikedCurrent: true,
        likeMutationFn: vi.fn(),
      },
      context
    );
    expect(queryClient.getQueryData(feedKeys.timeline('for-you'))).toEqual(initial);
  });
});

describe('useDeletePostMutation — refus serveur', () => {
  let queryClient: QueryClient;
  beforeEach(() => {
    deletePostAction.mockReset();
    queryClient = new QueryClient();
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('lève et ne tombstones pas quand l’action répond ok:false', async () => {
    deletePostAction.mockResolvedValue({
      ok: false,
      error: { message: 'Refusé', code: 'FORBIDDEN' },
    });
    const { result } = renderHook(() => useDeletePostMutation(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync('p1')).rejects.toThrow('Refusé');
    });
    const { getPostShadow } = await import('../shadow');
    expect(getPostShadow('p1')?.isDeleted).toBeUndefined();
  });

  it('tombstones après un succès serveur', async () => {
    deletePostAction.mockResolvedValue({ ok: true, data: { success: true } });
    const { result } = renderHook(() => useDeletePostMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('p2');
    });
    const { getPostShadow } = await import('../shadow');
    expect(getPostShadow('p2')?.isDeleted).toBe(true);
  });
});

describe('useToggleMutationQueue — toggles identiques', () => {
  it('résout la seconde demande au lieu de la laisser pendante', async () => {
    let release: (() => void) | undefined;
    const runMutation = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          release = () => resolve(true);
        })
    );
    const { result } = renderHook(() =>
      useToggleMutationQueue<boolean>({
        initialState: false,
        runMutation,
        onSuccess: vi.fn(),
      })
    );

    let first: Promise<boolean> | undefined;
    let second: Promise<boolean> | undefined;
    act(() => {
      first = result.current(true);
      second = result.current(true);
    });

    expect(runMutation).toHaveBeenCalledTimes(1);
    release?.();
    await expect(first).resolves.toBe(true);
    // Sans correctif, cette promesse ne se réglait jamais.
    await expect(second).resolves.toBe(true);
  });
});
