// =====================================================================
// 🧪 useTransientMessage — un seul minuteur, jamais de fuite
// =====================================================================
// Contrats mesurés :
//   1. le message s'efface après la durée demandée ;
//   2. un second message remplace le premier *et* son minuteur (le premier
//      n'efface pas le second au bout de son propre délai) ;
//   3. le démontage ne laisse aucun minuteur vivant.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Button } from '@qoe/ui/button';
import { useTransientMessage } from '../useTransientMessage';

function Probe({ durationMs = 3000 }: { durationMs?: number }) {
  const notice = useTransientMessage(durationMs);
  return (
    <div>
      <Button type="button" onClick={() => notice.show('premier')}>
        premier
      </Button>
      <Button type="button" onClick={() => notice.show('second')}>
        second
      </Button>
      <output data-testid="message">{notice.message ?? ''}</output>
    </div>
  );
}

const message = () => screen.getByTestId('message').textContent;

describe('useTransientMessage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('affiche le message puis l’efface après la durée', () => {
    render(<Probe />);

    fireEvent.click(screen.getByRole('button', { name: 'premier' }));
    expect(message()).toBe('premier');

    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(message()).toBe('premier');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(message()).toBe('');
  });

  it('un second message annule le minuteur du premier', () => {
    render(<Probe />);

    fireEvent.click(screen.getByRole('button', { name: 'premier' }));
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    fireEvent.click(screen.getByRole('button', { name: 'second' }));
    act(() => {
      // Le minuteur du premier message aurait dû tirer ici : s'il vivait
      // encore, il effacerait le second.
      vi.advanceTimersByTime(1000);
    });
    expect(message()).toBe('second');

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(message()).toBe('');
  });

  it('le démontage emporte le minuteur en cours', () => {
    const { unmount } = render(<Probe />);

    fireEvent.click(screen.getByRole('button', { name: 'premier' }));
    expect(vi.getTimerCount()).toBe(1);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
