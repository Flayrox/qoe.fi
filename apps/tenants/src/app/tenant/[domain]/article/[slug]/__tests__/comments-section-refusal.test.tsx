// @vitest-environment jsdom
// =====================================================================
// 🧪 ArticleCommentsSection — un commentaire refusé se voit
// =====================================================================
// Rouge mesuré avant correctif : `if (res.ok && res.data)` sans `else`. Un
// garde qui refuse (compte non vérifié, article fermé, cadence) laissait le
// texte saisi, aucun message et aucun toast : le lecteur pouvait cliquer
// dix fois sans comprendre.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { toastError, postComment } = vi.hoisted(() => ({
  toastError: vi.fn(),
  postComment: vi.fn(async () => ({ ok: false, error: { message: 'Compte non vérifié' } })),
}));

vi.mock('@qoe/ui/toast', () => ({ toast: { error: toastError, success: vi.fn() } }));
vi.mock('@qoe/ui', () => ({ useRequireAuth: () => ({ openAuthModal: vi.fn() }) }));
vi.mock('@qoe/sdk/actions/articles', () => ({
  postArticleCommentAction: postComment,
  deleteArticleCommentAction: vi.fn(async () => ({ ok: false, error: { message: 'Refusé' } })),
}));

import { ArticleCommentsSection } from '../ArticleCommentsSection';

describe('ArticleCommentsSection', () => {
  beforeEach(() => {
    toastError.mockClear();
    postComment.mockClear();
  });
  afterEach(() => cleanup());

  it('affiche le refus du serveur', async () => {
    render(
      <ArticleCommentsSection
        articleId="art_1"
        initialComments={[]}
        isAuthenticated
        currentUserId="u1"
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/Partagez votre réflexion/), {
      target: { value: 'Un commentaire' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Publier/ }));

    await waitFor(() => expect(postComment).toHaveBeenCalled());
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Compte non vérifié'));
  });
});
