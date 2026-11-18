import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openQoeSubscribePopup, subscribeEmail } from '../embed/browser';

// Durcissement de la couche navigateur de l'embed :
// - la popup ne se laisse clore que par SA fenêtre et depuis l'origine qoe.fi ;
// - l'inscription par e-mail possède un délai borné même sans signal appelant.

const mockFetch = vi.fn();

function ok(body: unknown = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  };
}

describe('subscribeEmail — transport borné', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(ok());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('pose un signal d’annulation par défaut', async () => {
    await subscribeEmail({ apiBase: 'https://api.qoe.fi', publisher: 'alice', email: 'a@b.co' });
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('respecte le signal fourni par l’appelant', async () => {
    const controller = new AbortController();
    await subscribeEmail({
      apiBase: 'https://api.qoe.fi',
      publisher: 'alice',
      email: 'a@b.co',
      signal: controller.signal,
    });
    expect((mockFetch.mock.calls[0][1] as RequestInit).signal).toBe(controller.signal);
  });

  it('valide localement avant tout appel réseau', async () => {
    await expect(
      subscribeEmail({ apiBase: 'javascript:alert(1)', publisher: 'alice', email: 'a@b.co' })
    ).rejects.toThrow('apiBase invalide');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('openQoeSubscribePopup — preuve d’origine et de fenêtre', () => {
  type Listener = (event: { origin: string; data: unknown; source: unknown }) => void;
  let listeners: Listener[];
  let popup: { closed: boolean; close: () => void };

  beforeEach(() => {
    listeners = [];
    popup = { closed: false, close: vi.fn() };
    vi.stubGlobal('window', {
      screenX: 0,
      screenY: 0,
      outerWidth: 1200,
      outerHeight: 800,
      open: vi.fn(() => popup),
      addEventListener: (_type: string, fn: Listener) => listeners.push(fn),
      removeEventListener: vi.fn(),
      setInterval: vi.fn(() => 1),
      clearInterval: vi.fn(),
      setTimeout: vi.fn(() => 2),
      clearTimeout: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('ignore une origine étrangère et une autre fenêtre de la même origine', async () => {
    const pending = openQoeSubscribePopup({ appBase: 'https://qoe.fi', publisher: 'alice' });
    let settled = false;
    void pending.then(() => {
      settled = true;
    });

    listeners[0]({ origin: 'https://evil.example', data: { ok: true }, source: popup });
    listeners[0]({ origin: 'https://qoe.fi', data: { ok: true }, source: {} });
    await Promise.resolve();
    expect(settled).toBe(false);

    listeners[0]({ origin: 'https://qoe.fi', data: { ok: true }, source: popup });
    await expect(pending).resolves.toEqual({ result: { ok: true } });
  });

  it('rejette un message trophée porteur de données supplémentaires', async () => {
    const pending = openQoeSubscribePopup({ appBase: 'https://qoe.fi', publisher: 'alice' });
    listeners[0]({
      origin: 'https://qoe.fi',
      data: { ok: true, accessToken: 'volé' },
      source: popup,
    });
    listeners[0]({ origin: 'https://qoe.fi', data: { cancelled: true }, source: popup });
    await expect(pending).resolves.toEqual({ result: { cancelled: true } });
  });

  it('signale une popup bloquée sans naviguer', async () => {
    (window.open as unknown as { mockReturnValue: (v: unknown) => void }).mockReturnValue(null);
    await expect(
      openQoeSubscribePopup({ appBase: 'https://qoe.fi', publisher: 'alice' })
    ).resolves.toEqual({ popupBlocked: true });
  });
});
