import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { trackServerEvent } from './analytics';

describe('trackServerEvent', () => {
  const umamiTrack = vi.fn();
  const posthogCapture = vi.fn();

  beforeEach(() => {
    umamiTrack.mockReset();
    posthogCapture.mockReset();
    delete (globalThis as Record<string, unknown>).window;
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
    vi.restoreAllMocks();
  });

  it('ne crashe pas sans window (SSR)', () => {
    expect(() => trackServerEvent('x')).not.toThrow();
  });

  it('remonte vers umami et posthog quand présents', () => {
    (globalThis as Record<string, unknown>).window = {
      umami: { track: umamiTrack },
      posthog: { capture: posthogCapture },
    };
    trackServerEvent('click_card', { id: '1' });
    expect(umamiTrack).toHaveBeenCalledWith('click_card', { id: '1' });
    expect(posthogCapture).toHaveBeenCalledWith('click_card', { id: '1' });
  });

  it('isole un échec chez umami et continue vers posthog', () => {
    (globalThis as Record<string, unknown>).window = {
      umami: {
        track: vi.fn(() => {
          throw new Error('boom');
        }),
      },
      posthog: { capture: posthogCapture },
    };
    expect(() => trackServerEvent('e', { k: 1 })).not.toThrow();
    expect(posthogCapture).toHaveBeenCalledTimes(1);
  });

  it('notifie l’un sans l’autre (posthog seul)', () => {
    (globalThis as Record<string, unknown>).window = { posthog: { capture: posthogCapture } };
    trackServerEvent('login');
    expect(posthogCapture).toHaveBeenCalledWith('login', undefined);
    expect(umamiTrack).not.toHaveBeenCalled();
  });
});
