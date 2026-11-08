import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSurfaceHotkeys } from '../useSurfaceHotkeys';

function press(key: string, target: EventTarget = window) {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

describe('useSurfaceHotkeys', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('résout une séquence à préfixe (g puis h)', () => {
    const onNavigate = vi.fn();
    renderHook(() => useSurfaceHotkeys({ scope: 'studio', onNavigate }));

    press('g');
    expect(onNavigate).not.toHaveBeenCalled();
    press('h');

    expect(onNavigate).toHaveBeenCalledWith('/', 'studio.home');
  });

  it('résout une touche simple (/)', () => {
    const onNavigate = vi.fn();
    renderHook(() => useSurfaceHotkeys({ scope: 'reader', onNavigate }));

    press('/');

    expect(onNavigate).toHaveBeenCalledWith('/search', 'reader.search');
  });

  it('ignore la saisie dans un champ', () => {
    const onNavigate = vi.fn();
    renderHook(() => useSurfaceHotkeys({ scope: 'studio', onNavigate }));

    const input = document.createElement('input');
    document.body.appendChild(input);

    press('g', input);
    press('h', input);

    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('ignore les combinaisons avec modificateur', () => {
    const onNavigate = vi.fn();
    renderHook(() => useSurfaceHotkeys({ scope: 'studio', onNavigate }));

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', metaKey: true }));

    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('abandonne la séquence après le délai', () => {
    vi.useFakeTimers();
    const onNavigate = vi.fn();
    renderHook(() => useSurfaceHotkeys({ scope: 'studio', onNavigate }));

    press('g');
    vi.advanceTimersByTime(2000);
    press('h');

    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("n'écoute rien quand enabled vaut false", () => {
    const onNavigate = vi.fn();
    renderHook(() => useSurfaceHotkeys({ scope: 'studio', onNavigate, enabled: false }));

    press('g');
    press('h');

    expect(onNavigate).not.toHaveBeenCalled();
  });
});
