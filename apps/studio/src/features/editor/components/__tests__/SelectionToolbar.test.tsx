// @vitest-environment jsdom
// =====================================================================
// 🧪 SelectionToolbar — menu flottant sur sélection de texte
// =====================================================================
// Le menu n'a de sens que sur une sélection de texte dans un paragraphe ou
// un titre. On vérifie son ouverture conditionnelle, l'état des marques et
// les commandes réellement appliquées à l'éditeur.
// =====================================================================

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { AnnotationMark } from '../../extensions/AnnotationMark';
import { ParagraphFormatting } from '../../extensions/ParagraphFormatting';
/**
 * `BubbleMenu` de Tiptap a besoin d'un vrai layout (getClientRects) absent de
 * jsdom. Ce double honore le contrat public : il n'affiche les enfants que si
 * `shouldShow` répond oui pour la sélection courante, et se met à jour à
 * chaque transaction — c'est exactement la règle du menu réel.
 */
vi.mock('@tiptap/react/menus', async () => {
  const React = await import('react');
  return {
    BubbleMenu: ({
      editor,
      children,
      shouldShow,
    }: {
      editor: Editor;
      children: React.ReactNode;
      shouldShow?: (props: { editor: Editor; from: number; to: number }) => boolean;
    }) => {
      const [, forceUpdate] = React.useReducer((value: number) => value + 1, 0);
      React.useEffect(() => {
        const update = () => forceUpdate();
        editor.on('transaction', update);
        editor.on('selectionUpdate', update);
        return () => {
          editor.off('transaction', update);
          editor.off('selectionUpdate', update);
        };
      }, [editor]);

      const { from, to } = editor.state.selection;
      const visible = shouldShow ? shouldShow({ editor, from, to }) : true;
      return visible
        ? React.createElement('div', { 'data-testid': 'bubble-menu' }, children)
        : null;
    },
  };
});

import { SelectionToolbar } from '../SelectionToolbar';

vi.mock('@lingui/core/macro', () => ({
  t: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
    if (Array.isArray(strings)) {
      return strings.reduce(
        (res, str, i) => res + str + (values[i] !== undefined ? values[i] : ''),
        ''
      );
    }
    return String(strings || '');
  },
}));

let editor: Editor | null = null;

function createEditor(html = '<p>Bonjour le monde</p>') {
  editor = new Editor({
    extensions: [StarterKit, AnnotationMark, ParagraphFormatting],
    content: html,
    element: document.createElement('div'),
  });
  return editor;
}

function renderToolbar(instance: Editor) {
  const onLink = vi.fn();
  const onAnnotation = vi.fn();
  render(<SelectionToolbar editor={instance} onLink={onLink} onAnnotation={onAnnotation} />);
  return { onLink, onAnnotation };
}

function selectText(instance: Editor, from: number, to: number) {
  act(() => {
    instance.chain().focus().setTextSelection({ from, to }).run();
  });
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

describe('SelectionToolbar', () => {
  it('n’apparaît pas sans sélection de texte', () => {
    const instance = createEditor();
    renderToolbar(instance);
    act(() => {
      instance.commands.setTextSelection(1);
    });

    expect(screen.queryByRole('button', { name: 'Gras' })).toBeNull();
  });

  it('apparaît sur une sélection dans un paragraphe', () => {
    const instance = createEditor();
    renderToolbar(instance);
    selectText(instance, 1, 8);

    expect(screen.getByRole('button', { name: 'Gras' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Italique' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Lien' })).toBeDefined();
    expect(screen.getByRole('button', { name: /Note d'auteur/ })).toBeDefined();
  });

  it('applique et reflète les marques de texte', () => {
    const instance = createEditor();
    renderToolbar(instance);
    selectText(instance, 1, 8);

    expect(screen.getByRole('button', { name: 'Gras' }).getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: 'Gras' }));
    expect(instance.isActive('bold')).toBe(true);
    expect(screen.getByRole('button', { name: 'Gras' }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Italique' }));
    expect(instance.isActive('italic')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Barré' }));
    expect(instance.isActive('strike')).toBe(true);
  });

  it('délègue le lien et la note d’auteur', () => {
    const instance = createEditor();
    const { onLink, onAnnotation } = renderToolbar(instance);
    selectText(instance, 1, 8);

    fireEvent.click(screen.getByRole('button', { name: 'Lien' }));
    fireEvent.click(screen.getByRole('button', { name: /Note d'auteur/ }));

    expect(onLink).toHaveBeenCalledTimes(1);
    expect(onAnnotation).toHaveBeenCalledTimes(1);
  });

  it('nomme l’action « Modifier la note » quand le curseur est dans une annotation', () => {
    const instance = createEditor('<p>texte annoté ici</p>');
    act(() => {
      instance.chain().setTextSelection({ from: 1, to: 6 }).setAnnotationMark({ note: 'n' }).run();
    });
    renderToolbar(instance);
    selectText(instance, 1, 6);

    expect(screen.getByRole('button', { name: "Modifier la note d'auteur" })).toBeDefined();
  });

  it('n’apparaît pas dans un bloc de code', () => {
    const instance = createEditor('<pre><code>const x = 1</code></pre>');
    renderToolbar(instance);
    act(() => {
      instance.commands.setTextSelection({ from: 2, to: 6 });
    });

    expect(screen.queryByRole('button', { name: 'Gras' })).toBeNull();
  });

  it('n’apparaît pas sur une sélection de nœud (image)', () => {
    const instance = createEditor('<p>Texte</p><img src="https://cdn.qoe.fi/a.jpg" alt="x">');
    renderToolbar(instance);

    let imagePos: number | null = null;
    instance.state.doc.descendants((node, pos) => {
      if (node.type.name === 'image') imagePos = pos;
      return true;
    });
    act(() => {
      instance.commands.setNodeSelection(imagePos as unknown as number);
    });

    expect(screen.queryByRole('button', { name: 'Gras' })).toBeNull();
  });

  it('propose alinéa et lettrine dans un paragraphe, pas dans un titre', () => {
    const instance = createEditor('<h2>Un titre long</h2>');
    renderToolbar(instance);
    selectText(instance, 1, 6);

    expect(screen.queryByRole('button', { name: /Alinéa de première ligne/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Lettrine/ })).toBeNull();
  });

  it('applique l’alinéa de première ligne', () => {
    const instance = createEditor();
    renderToolbar(instance);
    selectText(instance, 1, 8);

    fireEvent.click(screen.getByRole('button', { name: /Alinéa de première ligne/ }));

    expect(instance.getAttributes('paragraph').indent).toBe(true);
    expect(
      screen.getByRole('button', { name: /Alinéa de première ligne/ }).getAttribute('aria-pressed')
    ).toBe('true');
  });
});
