// @vitest-environment jsdom
// =====================================================================
// 🖱️ TextHighlighter + TextSelectionPopover — Gestes de sélection
// =====================================================================

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { TextHighlighter } from '../TextHighlighter';
import type { CreateHighlightParams } from '../types';

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

  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);

  return { range, text: range.toString() };
}

describe('TextHighlighter + TextSelectionPopover — gestures de sélection et création', () => {
  beforeEach(() => {
    mountArticle();
  });

  it('cliquer sur "Surligner" appelle onHighlightCreate avec note: null, isPublic: false, quoteOrdinal et rend la marque', async () => {
    const onHighlightCreate = vi.fn().mockImplementation(async (params: CreateHighlightParams) => {
      return {
        ok: true,
        data: {
          id: 'hl-test-1',
          text: params.text,
          note: params.note,
          isPublic: params.isPublic,
          quoteOrdinal: params.quoteOrdinal,
        },
      };
    });

    render(
      <TextHighlighter
        articleId="article-1"
        creatorName="Auteur"
        allowPublicAnnotations={true}
        isAuthenticated={true}
        initialHighlights={[]}
        publicHighlights={[]}
        mainAppUrl=""
        containerId="article-content"
        callbacks={{ onHighlightCreate }}
      />
    );

    // Sélection de "lenteur" (indices 3 à 10)
    const { text } = selectText(3, 10);
    expect(text).toBe('lenteur');

    // Déclenchement de la barre flottante via mouseup
    fireEvent.mouseUp(document);

    // Vérification de la présence de la barre d'outils
    const toolbar = await screen.findByRole('toolbar', { name: 'Annoter la sélection' });
    expect(toolbar).toBeTruthy();

    const highlightBtn = screen.getByTitle('Surligner ce passage');
    expect(highlightBtn).toBeTruthy();

    // Clic sur "Surligner"
    fireEvent.click(highlightBtn);

    // Vérification de l'appel au callback onHighlightCreate
    await waitFor(() => {
      expect(onHighlightCreate).toHaveBeenCalledWith({
        articleId: 'article-1',
        text: 'lenteur',
        note: null,
        isPublic: false,
        quoteOrdinal: 0,
      });
    });

    // Vérification du rendu de la marque dans le DOM
    await waitFor(() => {
      const mark = document.querySelector('mark[data-highlight-text="lenteur"]');
      expect(mark).toBeTruthy();
      expect(mark?.getAttribute('data-highlight-id')).toBe('hl-test-1');
      expect(mark?.textContent).toBe('lenteur');
    });
  });

  it('cliquer sur "Annoter" ouvre le formulaire, permet de basculer en public et soumet l’annotation avec sa marque', async () => {
    const onHighlightCreate = vi.fn().mockImplementation(async (params: CreateHighlightParams) => {
      return {
        ok: true,
        data: {
          id: 'hl-test-2',
          text: params.text,
          note: params.note,
          isPublic: params.isPublic,
          quoteOrdinal: params.quoteOrdinal,
        },
      };
    });

    render(
      <TextHighlighter
        articleId="article-1"
        creatorName="Auteur"
        allowPublicAnnotations={true}
        isAuthenticated={true}
        initialHighlights={[]}
        publicHighlights={[]}
        mainAppUrl=""
        containerId="article-content"
        callbacks={{ onHighlightCreate }}
      />
    );

    // Sélection de "phrase" (indices 21 à 27)
    const { text } = selectText(21, 27);
    expect(text).toBe('phrase');

    // Déclenchement de la barre flottante via keyup
    fireEvent.keyUp(document, { key: 'ArrowRight' });

    // Attente de l'apparition du bouton "Annoter"
    const annotateBtn = await screen.findByTitle('Ajouter une note ou annotation publique');
    expect(annotateBtn).toBeTruthy();

    // Clic sur "Annoter" pour ouvrir le formulaire
    fireEvent.click(annotateBtn);

    // Le formulaire de saisie de note s'ouvre
    expect(await screen.findByText('Nouvelle annotation')).toBeTruthy();

    // Saisie de la réflexion
    const textarea = screen.getByRole('textbox', { name: 'Votre note' });
    fireEvent.change(textarea, { target: { value: 'Une pensée sur la phrase' } });

    // Bascule de la visibilité sur "Publique"
    const publicBtn = screen.getByRole('radio', { name: 'Annotation publique' });
    fireEvent.click(publicBtn);

    // Soumission du formulaire
    const submitBtn = screen.getByRole('button', { name: /Enregistrer l'annotation/ });
    fireEvent.click(submitBtn);

    // Vérification de l'appel à onHighlightCreate avec note et isPublic: true
    await waitFor(() => {
      expect(onHighlightCreate).toHaveBeenCalledWith({
        articleId: 'article-1',
        text: 'phrase',
        note: 'Une pensée sur la phrase',
        isPublic: true,
        quoteOrdinal: 0,
      });
    });

    // Vérification du rendu de la marque persistée dans le DOM
    await waitFor(
      () => {
        const mark = document.querySelector('mark[data-highlight-text="phrase"]');
        expect(mark).toBeTruthy();
        expect(mark?.getAttribute('data-highlight-id')).toBe('hl-test-2');
      },
      { timeout: 2000 }
    );
  });
});
