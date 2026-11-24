// @vitest-environment jsdom
// =====================================================================
// 🧪 ThoughtThreadList — la suite du fil se charge, elle ne disparaît pas
// =====================================================================
// 🐛 Régression couverte : `Thread()` ne renvoie plus l'arbre complet mais une
//    première page + `repliesCursor`. Sans bouton branché, un fil de plus de
//    50 réponses s'arrêtait sans le dire. Ici : la page suivante est demandée
//    avec le curseur reçu, fusionnée dans l'arbre, et le bouton disparaît
//    quand le serveur annonce la dernière page.
// =====================================================================

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => '/auteur/thought/root',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next/image', () => ({ default: 'img' }));
vi.mock('@/components/thought-overlay/context', () => ({ useThoughtOverlay: () => null }));
vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

const { mockToast, mockGetThread, mockGetThreadReplies } = vi.hoisted(() => ({
  mockToast: { error: vi.fn(), success: vi.fn() },
  mockGetThread: vi.fn(),
  mockGetThreadReplies: vi.fn(),
}));

vi.mock('@qoe/ui/toast', () => ({ toast: mockToast }));

vi.mock('@qoe/sdk/actions/feed', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@qoe/sdk/actions/feed')>();
  return {
    ...actual,
    getPostThreadAction: (...args: unknown[]) => mockGetThread(...args),
    getPostThreadRepliesAction: (...args: unknown[]) => mockGetThreadReplies(...args),
  };
});

import { ThoughtThreadRoot } from '../ThoughtThreadRoot';
import { ThoughtThreadList } from '../ThoughtThreadList';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function reply(id: string, parentId: string | null) {
  return {
    id,
    parentId,
    rootId: 'root',
    content: id,
    createdAt: '2026-11-24T10:00:00.000Z',
    author: { id: `author-${id}`, username: `auteur-${id}` },
  };
}

function renderThread() {
  return render(
    <ThoughtThreadRoot postId="root" currentUserId="viewer-1">
      <ThoughtThreadList>
        {(item) => <div key={item.id} data-testid="reply-row" />}
      </ThoughtThreadList>
    </ThoughtThreadRoot>
  );
}

describe('ThoughtThreadList — pagination serveur (L42)', () => {
  it('demande la page suivante avec le curseur du fil puis s’arrête sur la dernière', async () => {
    const firstPage = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10'].map((id) =>
      reply(id, 'root')
    );
    mockGetThread.mockResolvedValue({
      ok: true,
      data: {
        post: {
          ...reply('root', null),
          replies: firstPage,
          repliesCursor: 'cursor-page-2',
          repliesTruncated: true,
        },
      },
    });
    mockGetThreadReplies.mockResolvedValue({
      ok: true,
      data: {
        replies: [reply('r11', 'root'), reply('r12', 'r11')],
        nextCursor: '',
        hasMore: false,
      },
    });

    renderThread();

    await waitFor(() => expect(screen.getByText(/Afficher 5 autres réponses/)).toBeTruthy());
    expect(screen.getAllByTestId('reply-row')).toHaveLength(5);

    fireEvent.click(screen.getByText(/Afficher 5 autres réponses/));
    expect(screen.getAllByTestId('reply-row')).toHaveLength(10);

    fireEvent.click(screen.getByText('Charger la suite du fil'));

    await waitFor(() => expect(screen.getAllByTestId('reply-row')).toHaveLength(11));
    expect(mockGetThreadReplies).toHaveBeenCalledWith({
      postId: 'root',
      cursor: 'cursor-page-2',
    });
    // Dernière page annoncée : plus de bouton, aucun rechargement en boucle.
    expect(screen.queryByText('Charger la suite du fil')).toBeNull();
  });

  it('un fil complet n’affiche jamais le bouton de pagination', async () => {
    mockGetThread.mockResolvedValue({
      ok: true,
      data: {
        post: {
          ...reply('root', null),
          replies: [reply('r1', 'root')],
          repliesCursor: '',
          repliesTruncated: false,
        },
      },
    });

    renderThread();

    await waitFor(() => expect(screen.getAllByTestId('reply-row')).toHaveLength(1));
    expect(screen.queryByText('Charger la suite du fil')).toBeNull();
  });
});
