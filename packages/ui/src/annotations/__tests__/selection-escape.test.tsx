// @vitest-environment jsdom
// =====================================================================
// ⌨️ Barre de sélection — Échap referme vraiment le formulaire de note
// =====================================================================
// 📖 Le bouton de fermeture du formulaire annonce « Fermer (Échap) ».
//    Or, formulaire ouvert, `isLocked` est vrai : `clearSelection()` sort
//    aussitôt, et Échap ne faisait rien du tout. Le raccourci affiché
//    mentait, et il ne restait que la souris pour abandonner la saisie.
// =====================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { TextHighlighter } from '../TextHighlighter';

const PASSAGE = 'La lenteur change la phrase et apporte la sérénité.';

function mountArticle() {
  document.body.innerHTML = `<div id="article-content"><p>${PASSAGE}</p></div>`;
}

function selectText(startOffset: number, endOffset: number) {
  const paragraph = document.querySelector('#article-content p')!;
  const textNode = paragraph.firstChild as Text;

  const range = document.createRange();
  range.setStart(textNode, startOffset);
  range.setEnd(textNode, endOffset);

  const mockRect = {
    top: 100,
    left: 50,
    bottom: 120,
    right: 150,
    width: 100,
    height: 20,
    x: 50,
    y: 100,
    toJSON: () => {},
  };

  range.getBoundingClientRect = () => mockRect as DOMRect;
  range.getClientRects = () => [mockRect] as unknown as DOMRectList;

  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);

  return { range, text: range.toString() };
}

describe('TextSelectionPopover — Échap pendant la saisie d’une note', () => {
  beforeEach(() => {
    mountArticle();
  });

  it('referme le formulaire de note et rend l’article', async () => {
    render(
      <TextHighlighter
        articleId="article-1"
        creatorName="Auteur"
        allowPublicAnnotations
        isAuthenticated
        initialHighlights={[]}
        publicHighlights={[]}
        mainAppUrl=""
        containerId="article-content"
        currentUserId="reader-1"
        callbacks={{ onHighlightCreate: vi.fn() }}
      />
    );

    selectText(21, 27); // « phrase »
    fireEvent.keyUp(document, { key: 'ArrowRight' });

    fireEvent.click(await screen.findByTitle('Ajouter une note ou annotation publique'));
    expect(await screen.findByText('Nouvelle annotation')).toBeTruthy();

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Votre note' }), { key: 'Escape' });

    await waitFor(() => expect(screen.queryByText('Nouvelle annotation')).toBeNull());
    expect(screen.queryByRole('toolbar', { name: 'Annoter la sélection' })).toBeNull();
  });
});
