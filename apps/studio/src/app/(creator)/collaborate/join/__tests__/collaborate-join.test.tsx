// =====================================================================
// 🧪 L21f — page d'invitation à la co-rédaction
// =====================================================================
// Deux défauts mesurés :
//  1. `formatExpiry` passe heure/minute à `toLocaleDateString`, qui les
//     ignore : la validité s'affiche sans heure.
//  2. Le `setTimeout` de redirection n'est jamais nettoyé : quitter la page
//     dans la seconde renvoie quand même l'utilisateur ailleurs.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams('token=tok_1'),
}));

vi.mock('@qoe/sdk/actions/articles', () => ({
  getCollaborationInviteLinkPreviewAction: vi.fn(),
  joinCollaborationByLinkAction: vi.fn(),
}));

vi.mock('@qoe/ui', () => ({
  SafeAvatar: () => null,
}));

import {
  getCollaborationInviteLinkPreviewAction,
  joinCollaborationByLinkAction,
} from '@qoe/sdk/actions/articles';

import CollaborateJoinPage from '../page';

const preview = vi.mocked(getCollaborationInviteLinkPreviewAction);
const join = vi.mocked(joinCollaborationByLinkAction);

const PREVIEW = {
  title: 'Une nuit à Lisbonne',
  role: 'CO_AUTHOR',
  expiresAt: '2026-11-14T09:32:05Z',
  author: { name: 'Alice', username: 'alice', logoUrl: null },
} as never;

describe('CollaborateJoinPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    preview.mockResolvedValue({ ok: true, data: PREVIEW });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('n’effectue pas la redirection différée après démontage', async () => {
    join.mockResolvedValue({
      ok: true,
      data: { success: true, articleId: 'art_9' },
    } as never);

    const { unmount } = render(<CollaborateJoinPage />);

    const accept = await screen.findByText('Accepter et ouvrir l’éditeur');

    // ⏱️ La redirection est différée par un `setTimeout` : horloge simulée à
    // partir du clic, pour avancer le délai au lieu de l'attendre (R313).
    vi.useFakeTimers();
    fireEvent.click(accept);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText(/Invitation acceptée/)).toBeDefined();

    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });

    expect(push).not.toHaveBeenCalled();
  });
});
