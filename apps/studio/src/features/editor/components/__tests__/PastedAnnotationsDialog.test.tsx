// =====================================================================
// 🧪 PastedAnnotationsDialog — convertir une syntaxe collée en annotation
// =====================================================================
// L'auteur colle du texte contenant `{passage}(note)`. Ce dialogue propose de
// le transformer en annotation officielle, une par une ou d'un coup. On
// vérifie ce qui est envoyé au parent : note éditée, repli sur la note
// d'origine, et les différentes sorties (oui, non, tout).
// =====================================================================

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

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

import {
  PastedAnnotationsDialog,
  type DetectedBracketAnnotation,
} from '../PastedAnnotationsDialog';

const current: DetectedBracketAnnotation = {
  from: 10,
  to: 40,
  targetText: 'la ville breathe',
  noteText: 'Métaphore filée',
  contextBefore: 'Dans ce passage, ',
  contextAfter: ' revient trois fois.',
};

function baseProps(overrides: Partial<React.ComponentProps<typeof PastedAnnotationsDialog>> = {}) {
  const props = {
    open: true,
    current,
    currentIndex: 1,
    totalCount: 3,
    remainingCount: 3,
    onConfirmCurrent: vi.fn(),
    onSkipCurrent: vi.fn(),
    onConfirmAll: vi.fn(),
    onSkipAll: vi.fn(),
    ...overrides,
  } as React.ComponentProps<typeof PastedAnnotationsDialog>;
  return props;
}

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof PastedAnnotationsDialog>> = {}
) {
  const props = baseProps(overrides);
  const rendered = render(<PastedAnnotationsDialog {...props} />);
  return { ...props, ...rendered };
}

afterEach(() => {
  cleanup();
});

describe('PastedAnnotationsDialog', () => {
  it('ne rend rien quand il est fermé ou sans annotation', () => {
    render(<PastedAnnotationsDialog {...baseProps({ open: false })} />);
    expect(screen.queryByText(/transformer ce passage/i)).toBeNull();
    cleanup();

    render(<PastedAnnotationsDialog {...baseProps({ current: null })} />);
    expect(screen.queryByText(/transformer ce passage/i)).toBeNull();
  });

  it('situe l’annotation dans la progression', () => {
    renderDialog();
    expect(screen.getByText('Annotation 1 sur 3')).toBeDefined();
  });

  it('montre le passage dans son contexte', () => {
    renderDialog();

    expect(screen.getByText('la ville breathe')).toBeDefined();
    expect(screen.getByText('Dans ce passage,')).toBeDefined();
    expect(screen.getByText(/revient trois fois/)).toBeDefined();
  });

  it('préremplit la note et valide la version éditée', () => {
    const props = renderDialog();
    const textarea = screen.getByLabelText(/Contenu de l'annotation officielle/i);
    expect((textarea as HTMLTextAreaElement).value).toBe('Métaphore filée');

    fireEvent.change(textarea, { target: { value: 'Métaphore du souffle' } });
    fireEvent.click(screen.getByRole('button', { name: /^Oui$/ }));

    expect(props.onConfirmCurrent).toHaveBeenCalledWith('Métaphore du souffle');
  });

  it('retombe sur la note d’origine si le champ est vidé', () => {
    const props = renderDialog();
    const textarea = screen.getByLabelText(/Contenu de l'annotation officielle/i);

    fireEvent.change(textarea, { target: { value: '    ' } });
    fireEvent.click(screen.getByRole('button', { name: /^Oui$/ }));

    expect(props.onConfirmCurrent).toHaveBeenCalledWith('Métaphore filée');
  });

  it('nettoie les espaces autour de la note éditée', () => {
    const props = renderDialog();
    fireEvent.change(screen.getByLabelText(/Contenu de l'annotation officielle/i), {
      target: { value: '  Note nettoyée  ' },
    });

    fireEvent.click(screen.getByRole('button', { name: /^Oui$/ }));
    expect(props.onConfirmCurrent).toHaveBeenCalledWith('Note nettoyée');
  });

  it('valide au clavier avec Cmd/Ctrl + Entrée', () => {
    const props = renderDialog();
    const textarea = screen.getByLabelText(/Contenu de l'annotation officielle/i);

    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    expect(props.onConfirmCurrent).toHaveBeenCalledWith('Métaphore filée');

    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(props.onConfirmCurrent).toHaveBeenCalledTimes(1);
  });

  it('permet de refuser l’annotation courante', () => {
    const props = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: /^Non$/ }));

    expect(props.onSkipCurrent).toHaveBeenCalledTimes(1);
    expect(props.onConfirmCurrent).not.toHaveBeenCalled();
  });

  it('propose les actions de masse seulement quand il reste plusieurs annotations', () => {
    const props = renderDialog({ remainingCount: 3 });

    fireEvent.click(screen.getByRole('button', { name: /Oui pour tous \(3\)/ }));
    expect(props.onConfirmAll).toHaveBeenCalledWith('Métaphore filée');

    fireEvent.click(screen.getByRole('button', { name: /Non pour tous/ }));
    expect(props.onSkipAll).toHaveBeenCalledTimes(1);

    cleanup();
    renderDialog({ remainingCount: 1 });
    expect(screen.queryByRole('button', { name: /Oui pour tous/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Non pour tous/ })).toBeNull();
  });

  it('applique la note éditée à toutes les annotations', () => {
    const props = renderDialog();
    fireEvent.change(screen.getByLabelText(/Contenu de l'annotation officielle/i), {
      target: { value: 'Note commune' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Oui pour tous/ }));
    expect(props.onConfirmAll).toHaveBeenCalledWith('Note commune');
  });

  it('réinitialise la note quand l’annotation courante change', () => {
    const { rerender } = render(<PastedAnnotationsDialog {...baseProps()} />);
    fireEvent.change(screen.getByLabelText(/Contenu de l'annotation officielle/i), {
      target: { value: 'Brouillon local' },
    });

    rerender(
      <PastedAnnotationsDialog
        {...baseProps({
          current: { ...current, noteText: 'Autre note', targetText: 'un autre passage' },
          currentIndex: 2,
          remainingCount: 2,
        })}
      />
    );

    expect(
      (screen.getByLabelText(/Contenu de l'annotation officielle/i) as HTMLTextAreaElement).value
    ).toBe('Autre note');
  });

  it('traite la fermeture du dialogue comme un refus global', () => {
    const props = renderDialog();

    // La croix de la boîte de dialogue ferme et vaut refus global.
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));

    expect(props.onSkipAll).toHaveBeenCalled();
  });
});
