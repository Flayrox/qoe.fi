// @vitest-environment jsdom
// =====================================================================
// 🧪 EditorStatusBar — chiffres fiables et raccourcis de correction
// =====================================================================
// Le bandeau est la seule vue d'ensemble de l'article (mots, caractères,
// temps de lecture, images sans alt). On le teste contre un vrai éditeur
// Tiptap : compter sur des props simulées ne prouverait rien du document.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { CharacterCount } from '@tiptap/extensions';
import { ArticleImage } from '../../extensions/ArticleImage';
import { AnnotationMark } from '../../extensions/AnnotationMark';
import { EditorStatusBar } from '../EditorStatusBar';

let editor: Editor | null = null;

function createEditor(content: string) {
  editor = new Editor({
    extensions: [StarterKit, CharacterCount, ArticleImage, AnnotationMark],
    content,
    element: document.createElement('div'),
  });
  return editor;
}

function renderBar(props: Partial<React.ComponentProps<typeof EditorStatusBar>> = {}) {
  const instance = props.editor ?? createEditor('<p>un deux trois</p>');
  const callbacks = {
    onOpenAnnotation: vi.fn(),
    onFixAltMissing: vi.fn(),
    onOpenShortcuts: vi.fn(),
    onOpenPreflight: vi.fn(),
  };
  render(<EditorStatusBar editor={instance} {...callbacks} {...props} />);
  return { ...callbacks, editor: instance };
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe('EditorStatusBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('affiche les mots, les caractères et un temps de lecture arrondi au dessus', () => {
    const instance = createEditor('<p>un deux trois</p>');
    render(<EditorStatusBar editor={instance} />);

    expect(screen.getByText(/3\s*mots/)).toBeDefined();
    expect(screen.getByText(/13\s*caractères/)).toBeDefined();
    // 3 mots → 1 minute minimum, jamais « 0 min ».
    expect(screen.getByText(/1\s*min de lecture/)).toBeDefined();
  });

  it('n’affiche pas de temps de lecture sur un document vide', () => {
    const instance = createEditor('<p></p>');
    render(<EditorStatusBar editor={instance} />);

    expect(screen.queryByText(/min de lecture/)).toBeNull();
    expect(screen.getByText(/0\s*mots/)).toBeDefined();
  });

  it('calcule le temps de lecture à 200 mots par minute', () => {
    const words = Array.from({ length: 401 }, (_, i) => `mot${i}`).join(' ');
    const instance = createEditor(`<p>${words}</p>`);
    render(<EditorStatusBar editor={instance} />);

    // 401 / 200 = 2,005 → 3 minutes.
    expect(screen.getByText(/3\s*min de lecture/)).toBeDefined();
  });

  it('signale les images sans alt et ouvre la première à corriger', () => {
    const instance = createEditor(
      '<p>texte</p><img src="https://cdn.qoe.fi/a.jpg"><img data-gallery="1" src="https://cdn.qoe.fi/b.jpg">'
    );
    const { onFixAltMissing } = renderBar({ editor: instance });

    const button = screen.getByRole('button', { name: /2 images sans alt/ });
    fireEvent.click(button);
    expect(onFixAltMissing).toHaveBeenCalledTimes(1);
  });

  it('accorde le libellé au singulier et ignore les images décrites', () => {
    const instance = createEditor(
      '<p>texte</p><img src="https://cdn.qoe.fi/a.jpg" alt="Une manif">'
    );
    renderBar({ editor: instance });
    expect(screen.queryByRole('button', { name: /images? sans alt/ })).toBeNull();

    const withOne = createEditor('<p>texte</p><img src="https://cdn.qoe.fi/b.jpg">');
    render(<EditorStatusBar editor={withOne} onFixAltMissing={vi.fn()} />);
    expect(screen.getByRole('button', { name: /1 image sans alt/ })).toBeDefined();
  });

  it('n’offre « corriger » que si l’action est branchée', () => {
    const instance = createEditor('<p>texte</p><img src="https://cdn.qoe.fi/a.jpg">');
    render(<EditorStatusBar editor={instance} />);

    // Le badge apparaît, mais sans bouton cliquable sans handler : rien à faire.
    expect(screen.queryByRole('button', { name: /image sans alt/ })).toBeNull();
  });

  it('propose d’éditer la note quand le curseur est dans une annotation', () => {
    const instance = createEditor('<p>texte annoté</p>');
    instance
      .chain()
      .setTextSelection({ from: 1, to: 6 })
      .setAnnotationMark({ note: 'contexte' })
      .run();

    const { onOpenAnnotation } = renderBar({ editor: instance });

    const button = screen.getByRole('button', { name: /Modifier la note d'auteur/ });
    fireEvent.click(button);
    expect(onOpenAnnotation).toHaveBeenCalledTimes(1);
  });

  it('masque l’action d’annotation hors d’une annotation', () => {
    const instance = createEditor('<p>texte simple</p>');
    instance.commands.setTextSelection(2);
    renderBar({ editor: instance });

    expect(screen.queryByRole('button', { name: /Modifier la note d'auteur/ })).toBeNull();
  });

  it('branche les raccourcis et le préflight quand ils sont fournis', () => {
    const instance = createEditor('<p>texte</p>');
    const { onOpenShortcuts, onOpenPreflight } = renderBar({ editor: instance });

    fireEvent.click(screen.getByRole('button', { name: /Raccourcis/ }));
    fireEvent.click(screen.getByRole('button', { name: /Prêt à publier/ }));

    expect(onOpenShortcuts).toHaveBeenCalledTimes(1);
    expect(onOpenPreflight).toHaveBeenCalledTimes(1);
  });

  it('reste silencieux quand aucun raccourci n’est branché', () => {
    const instance = createEditor('<p>texte</p>');
    render(<EditorStatusBar editor={instance} />);

    expect(screen.queryByRole('button', { name: /Raccourcis/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Prêt à publier/ })).toBeNull();
  });
});
