import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { ReadingProgressBar } from '../ReadingProgressBar';

describe('ReadingProgressBar', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('monte le composant avec une barre de progression initiale', () => {
    const { container } = render(<ReadingProgressBar />);
    const bar = container.querySelector('[style*="width"]');
    expect(bar).toBeInTheDocument();
  });

  it('calcule et met à jour la progression lors du scroll', () => {
    // Simuler document height et innerHeight
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      value: 2000,
      configurable: true,
    });
    Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true });
    Object.defineProperty(window, 'scrollY', { value: 500, configurable: true, writable: true });

    // Mock requestAnimationFrame pour exécution synchrone
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });

    const { container } = render(<ReadingProgressBar />);
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    const bar = container.querySelector('[style*="width"]') as HTMLElement;
    expect(bar).toBeInTheDocument();
    // scrollY=500, maxScroll = 2000 - 1000 = 1000 -> 50%
    expect(bar.style.width).toBe('50%');
  });

  it('borne la progression à 100% maximum', () => {
    Object.defineProperty(document.documentElement, 'scrollHeight', {
      value: 1500,
      configurable: true,
    });
    Object.defineProperty(window, 'innerHeight', { value: 1000, configurable: true });
    Object.defineProperty(window, 'scrollY', { value: 1000, configurable: true, writable: true });

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });

    const { container } = render(<ReadingProgressBar />);
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });

    const bar = container.querySelector('[style*="width"]') as HTMLElement;
    expect(bar.style.width).toBe('100%');
  });
});
