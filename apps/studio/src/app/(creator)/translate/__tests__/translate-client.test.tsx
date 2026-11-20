// =====================================================================
// 🧪 L21f — copie de la traduction
// =====================================================================
// `copy()` relance un `setTimeout` de 1500 ms à chaque copie sans annuler le
// précédent : la seconde copie perd son indicateur au bout du délai de la
// première. Et un `writeText` rejeté part en promesse non gérée, sans aucun
// retour pour l'utilisateur.

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../actions', () => ({
  translateArticleAction: vi.fn(),
}));

vi.mock('@qoe/ui/select', () => ({
  Select: () => <div data-slot="select" />,
}));

vi.mock('@qoe/ui/icons', () => ({
  Icon: () => null,
}));

vi.mock('@qoe/ui/callout', () => ({
  Callout: ({ children }: { children?: React.ReactNode }) => <div role="alert">{children}</div>,
}));

import { translateArticleAction } from '../actions';
import { TranslateClient } from '../translate-client';

const translate = vi.mocked(translateArticleAction);

const ARTICLES = [{ id: 'art_1', title: 'Une nuit à Lisbonne', content: 'Le fleuve…' }];

describe('TranslateClient — copie', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    translate.mockResolvedValue({ success: true, text: 'A night in Lisbon' });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('garde l’indicateur « Copié » après une seconde copie', async () => {
    render(<TranslateClient articles={ARTICLES} />);

    fireEvent.click(screen.getByText('Traduire'));
    await screen.findByText('A night in Lisbon');

    fireEvent.click(screen.getByText('Copier'));
    await screen.findByText('Copié');

    // Deuxième copie 1 s plus tard : son délai court à partir de maintenant,
    // donc l'indicateur doit encore être là 1,6 s après la première.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    });
    fireEvent.click(screen.getByText('Copié').closest('button')!);

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 600));
    });
    expect(screen.getByText('Copié')).toBeDefined();
  });

  it('signale l’échec du presse-papiers au lieu de le laisser silencieux', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });

    render(<TranslateClient articles={ARTICLES} />);

    fireEvent.click(screen.getByText('Traduire'));
    await screen.findByText('A night in Lisbon');

    fireEvent.click(screen.getByText('Copier'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('Copie dans le presse-papiers impossible.');
    expect(screen.getByText('Copier')).toBeDefined();
  });
});
