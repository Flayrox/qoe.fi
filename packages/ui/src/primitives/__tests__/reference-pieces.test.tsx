import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AnnotationMark } from '../annotation-mark/annotation-mark';
import { BevelButton } from '../bevel-button/bevel-button';
import { CopyButton } from '../copy-button/copy-button';
import { HoldToDeleteButton } from '../hold-to-delete/hold-to-delete-button';
import { SaveButton } from '../save-button/save-button';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('AnnotationMark', () => {
  it('garde le texte accessible et la décoration hors de l’arbre', () => {
    render(
      <p>
        Un mot <AnnotationMark variant="underline">souligné</AnnotationMark> dans une phrase.
      </p>
    );

    expect(screen.getByText('souligné')).toBeTruthy();
    // Le trait est une décoration : aucun rôle, aucun texte annoncé en plus.
    const decorations = document.querySelectorAll('svg[aria-hidden="true"]');
    expect(decorations.length).toBeGreaterThan(0);
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('donne un filtre unique à chaque marque', () => {
    const { container } = render(
      <p>
        <AnnotationMark variant="circle">un</AnnotationMark>
        <AnnotationMark variant="circle">deux</AnnotationMark>
      </p>
    );

    // Deux marques qui partagent le même `id` de filtre héritent du même
    // déplacement : la seconde serait dessinée avec la graine de la première.
    const ids = [...container.ownerDocument.querySelectorAll('filter')].map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('BevelButton', () => {
  it('est un bouton non-soumis et transmet ses attributs', () => {
    const onClick = vi.fn();
    render(
      <BevelButton onClick={onClick} aria-label="Ouvrir le menu">
        Menu
      </BevelButton>
    );

    const button = screen.getByRole('button', { name: 'Ouvrir le menu' }) as HTMLButtonElement;
    expect(button.type).toBe('button');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('respecte l’état désactivé', () => {
    render(<BevelButton disabled>Action</BevelButton>);

    expect((screen.getByRole('button', { name: 'Action' }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });
});

describe('HoldToDeleteButton', () => {
  it('supprime seulement quand le maintien va au bout', () => {
    vi.useFakeTimers();
    const onHoldComplete = vi.fn();
    render(<HoldToDeleteButton label="Supprimer l’écrit" onHoldComplete={onHoldComplete} />);

    const button = screen.getByRole('button', { name: /Supprimer l’écrit/ });
    fireEvent.pointerDown(button);
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(onHoldComplete).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onHoldComplete).toHaveBeenCalledTimes(1);
    expect(button.getAttribute('aria-label')).toBe('Supprimé');
  });

  it('annule si on relâche avant la fin', () => {
    vi.useFakeTimers();
    const onHoldComplete = vi.fn();
    render(<HoldToDeleteButton label="Supprimer" onHoldComplete={onHoldComplete} />);

    const button = screen.getByRole('button', { name: /Supprimer/ });
    fireEvent.pointerDown(button);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    fireEvent.pointerUp(button);
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(onHoldComplete).not.toHaveBeenCalled();
    expect(button.getAttribute('data-state')).toBe('idle');
  });

  it('fonctionne au clavier, sans souris', () => {
    vi.useFakeTimers();
    const onHoldComplete = vi.fn();
    render(<HoldToDeleteButton label="Supprimer" onHoldComplete={onHoldComplete} />);

    const button = screen.getByRole('button', { name: /Supprimer/ });
    fireEvent.keyDown(button, { key: ' ' });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(onHoldComplete).toHaveBeenCalledTimes(1);
  });
});

describe('CopyButton', () => {
  it('copie la valeur et le confirme dans une zone live', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    render(<CopyButton value="https://qoe.fi/mon-ecrit" />);
    fireEvent.click(screen.getByRole('button', { name: /Copier/ }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('https://qoe.fi/mon-ecrit'));
    // Le libellé au repos reste dans le DOM (les deux occupent la même
    // cellule) : c'est la zone live qui porte l'annonce, et elle seule.
    await waitFor(() =>
      expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe('Copié')
    );
  });
});

describe('SaveButton', () => {
  it('bascule en exposant aria-pressed', () => {
    const onSavedChange = vi.fn();
    render(<SaveButton onSavedChange={onSavedChange} />);

    const button = screen.getByRole('button', { name: /Enregistrer/ });
    expect(button.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(button);
    expect(onSavedChange).toHaveBeenCalledWith(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('reste contrôlable de l’extérieur', () => {
    const { rerender } = render(<SaveButton saved={false} />);
    const button = () => screen.getByRole('button');

    fireEvent.click(button());
    // Sans `onSavedChange`, l'état contrôlé ne bouge pas : c'est au parent
    // de décider, pas au bouton de prendre la main.
    expect(button().getAttribute('aria-pressed')).toBe('false');

    rerender(<SaveButton saved />);
    expect(button().getAttribute('aria-pressed')).toBe('true');
  });
});
