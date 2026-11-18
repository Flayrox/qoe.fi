// @vitest-environment jsdom
// =====================================================================
// 👍 Vote « Utile » — l'optimisme doit savoir revenir
// =====================================================================
// 📖 Le vote était appliqué AVANT la réponse serveur (c'est ce qu'on veut :
//    le geste répond tout de suite). Mais un refus — session expirée,
//    annotation supprimée, limite atteinte — laissait le compteur gonflé et
//    la puce allumée, et le parent recevait cette fausse valeur par
//    `onUpdateAnnotation`. L'écran affichait donc un vote qui n'existait pas.
// =====================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { AnnotationSideDrawer } from '../AnnotationSideDrawer';
import type { AnnotationItem } from '../types';

const annotation: AnnotationItem = {
  id: 'hl-vote',
  text: 'La lenteur change la phrase',
  note: 'À reprendre en ouverture',
  isPublic: true,
  isOfficial: false,
  upvotesCount: 4,
  hasUpvoted: false,
  createdAt: '2026-09-04T18:40:00.000Z',
  reader: { id: 'reader-1', name: 'Lila', username: 'lila', logoUrl: null },
};

function voteButton() {
  return screen.getByRole('button', { name: /utile/i });
}

describe('AnnotationSideDrawer — vote refusé par le serveur', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.style.overflow = '';
  });

  it('revient au compteur d’avant quand la réponse est un refus', async () => {
    const onUpvote = vi.fn().mockResolvedValue({ ok: false, error: { message: 'Refusé.' } });
    const onUpdateAnnotation = vi.fn();

    render(
      <AnnotationSideDrawer
        articleId="article-1"
        annotation={annotation}
        isAuthenticated
        currentUserId="reader-1"
        mainAppUrl="https://qoe.fi"
        onClose={() => {}}
        onUpdateAnnotation={onUpdateAnnotation}
        callbacks={{ onUpvote }}
      />
    );

    expect(voteButton().textContent).toContain('4');
    fireEvent.click(voteButton());
    // Le geste répond tout de suite : c'est le principe de l'optimisme.
    expect(voteButton().textContent).toContain('5');

    await waitFor(() => expect(onUpvote).toHaveBeenCalledWith('hl-vote'));

    await waitFor(() => expect(voteButton().textContent).toContain('4'));
    expect(voteButton().getAttribute('aria-pressed')).toBe('false');
    // Le parent a reçu l'état vrai, pas le compteur gonflé.
    expect(onUpdateAnnotation).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'hl-vote', upvotesCount: 4, hasUpvoted: false })
    );
  });

  it('revient aussi quand l’appel lève', async () => {
    const onUpvote = vi.fn().mockRejectedValue(new Error('réseau'));

    render(
      <AnnotationSideDrawer
        articleId="article-1"
        annotation={annotation}
        isAuthenticated
        currentUserId="reader-1"
        mainAppUrl="https://qoe.fi"
        onClose={() => {}}
        callbacks={{ onUpvote }}
      />
    );

    fireEvent.click(voteButton());
    await waitFor(() => expect(voteButton().textContent).toContain('4'));
  });
});
