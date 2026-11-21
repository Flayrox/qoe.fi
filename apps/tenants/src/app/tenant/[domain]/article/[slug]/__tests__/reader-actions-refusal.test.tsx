// @vitest-environment jsdom
// =====================================================================
// 🧪 ReaderActions — un signet refusé ne reste pas muet
// =====================================================================
// Rouge mesuré avant correctif : `if (res.ok)` uniquement. Un refus serveur
// (compte restreint, cadence) laissait la barre dans son état antérieur, sans
// un mot — impossible de distinguer « refusé » de « pas cliqué ».
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { toastError, toggleBookmark } = vi.hoisted(() => ({
  toastError: vi.fn(),
  toggleBookmark: vi.fn(async () => ({ ok: false, error: { message: 'Action refusée' } })),
}));

vi.mock('@qoe/ui/toast', () => ({ toast: { error: toastError, success: vi.fn() } }));
vi.mock('@qoe/ui', () => ({ useRequireAuth: () => ({ openAuthModal: vi.fn() }) }));
vi.mock('@qoe/ui/reader', () => ({
  ReadingSettingsSheet: () => null,
  TextToSpeechPlayer: () => null,
}));
vi.mock('@qoe/sdk/actions/tenant', () => ({
  toggleBookmarkArticleAction: toggleBookmark,
  toggleFollowCreatorAction: vi.fn(async () => ({ ok: true, data: { followed: true } })),
}));

import { ReaderActions } from '../ReaderActions';

describe('ReaderActions', () => {
  beforeEach(() => {
    toastError.mockClear();
    toggleBookmark.mockClear();
  });
  afterEach(() => cleanup());

  it('affiche le refus du signet', async () => {
    render(
      <ReaderActions
        articleId="art_1"
        publisherId="pub_1"
        creatorName="Le Média"
        isAuthenticated
        initialBookmarked={false}
        initialFollowed={false}
        mainAppUrl="https://qoe.test"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Sauvegarder cet écrit/ }));

    await waitFor(() => expect(toggleBookmark).toHaveBeenCalled());
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Action refusée'));
  });
});
