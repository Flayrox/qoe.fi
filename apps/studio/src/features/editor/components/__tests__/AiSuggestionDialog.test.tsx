// =====================================================================
// 🧪 AiSuggestionDialog — charger, échouer, appliquer
// =====================================================================
// Le dialogue n'appelle rien lui-même : il rend l'état fourni par l'appelant
// (chargement, erreur, liste vide) et remonte la suggestion choisie. On
// vérifie chaque état et le contrat exact d'application.
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

import { AiSuggestionDialog } from '../AiSuggestionDialog';

function baseProps(overrides: Partial<React.ComponentProps<typeof AiSuggestionDialog>> = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    title: 'Améliorer la fin',
    description: 'Trois propositions pour conclure.',
    loading: false,
    error: null,
    suggestions: ['Première piste', 'Deuxième piste'],
    onApply: vi.fn(),
    ...overrides,
  } as React.ComponentProps<typeof AiSuggestionDialog>;
  return props;
}

function renderDialog(overrides: Partial<React.ComponentProps<typeof AiSuggestionDialog>> = {}) {
  const props = baseProps(overrides);
  render(<AiSuggestionDialog {...props} />);
  return props;
}

afterEach(() => {
  cleanup();
});

describe('AiSuggestionDialog', () => {
  it('ne rend rien quand il est fermé', () => {
    render(<AiSuggestionDialog {...baseProps({ open: false })} />);
    expect(screen.queryByText('Améliorer la fin')).toBeNull();
  });

  it('affiche le titre et la description fournis', () => {
    renderDialog();
    expect(screen.getByText('Améliorer la fin')).toBeDefined();
    expect(screen.getByText('Trois propositions pour conclure.')).toBeDefined();
  });

  it('affiche l’attente pendant la génération', () => {
    renderDialog({ loading: true, suggestions: [] });
    expect(screen.getByText("L'assistant réfléchit…")).toBeDefined();
    expect(screen.queryByRole('button', { name: /Première piste/ })).toBeNull();
  });

  it('affiche l’erreur et permet de réessayer', () => {
    const onRetry = vi.fn();
    renderDialog({ error: 'Quota dépassé', suggestions: [], onRetry });

    expect(screen.getByText('Quota dépassé')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('n’affiche pas « Réessayer » quand aucun retry n’est branché', () => {
    renderDialog({ error: 'Quota dépassé', suggestions: [] });
    expect(screen.getByText('Quota dépassé')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
  });

  it('annonce l’absence de suggestion', () => {
    renderDialog({ suggestions: [] });
    expect(screen.getByText('Pas de suggestion pour ce texte.')).toBeDefined();
  });

  it('liste les suggestions numérotées', () => {
    renderDialog();

    expect(screen.getByRole('button', { name: /1\s*Première piste/ })).toBeDefined();
    expect(screen.getByRole('button', { name: /2\s*Deuxième piste/ })).toBeDefined();
  });

  it('applique la suggestion choisie puis ferme', () => {
    const props = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: /Deuxième piste/ }));

    expect(props.onApply).toHaveBeenCalledWith('Deuxième piste');
    expect(props.onApply).toHaveBeenCalledTimes(1);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('se ferme sans rien appliquer', () => {
    const props = renderDialog();

    // La boîte expose une croix et un bouton de pied tous deux nommés « Fermer ».
    const closeButtons = screen.getAllByRole('button', { name: 'Fermer' });
    fireEvent.click(closeButtons[closeButtons.length - 1]);

    expect(props.onApply).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });
});
