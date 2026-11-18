import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Durcissement du noyau SDK (lot L06a) : origine de l'API résolue sans domaine
// en dur, délai d'appel borné, variables d'environnement lues à l'appel, et
// détection d'expiration de session qui ne confond plus un id avec un 401.

const mockFetch = vi.fn();

vi.mock('@qoe/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'fake-jwt' } },
      }),
    },
  }),
}));

import { QoeApiClient, resolveApiBaseUrl, DEFAULT_REQUEST_TIMEOUT_MS } from '../client';
import {
  DEFAULT_GO_TIMEOUT_MS,
  goApiUrl,
  goFetch,
  goTimeoutMs,
  isGoEnabled,
} from '../actions/utils/go-client';
import { isUnauthorizedError } from '../utils/authError';

function okResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: async () => body,
  };
}

describe('resolveApiBaseUrl — portabilité', () => {
  const saved = {
    next: process.env.NEXT_PUBLIC_API_URL,
    expo: process.env.EXPO_PUBLIC_API_URL,
  };

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_API_URL;
    delete process.env.EXPO_PUBLIC_API_URL;
  });

  afterEach(() => {
    if (saved.next === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = saved.next;
    if (saved.expo === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = saved.expo;
  });

  it('préfère la config explicite et retire les slashs finaux', () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://env.example';
    expect(resolveApiBaseUrl('https://api.example///')).toBe('https://api.example');
  });

  it('retombe sur l’env publique web puis mobile', () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://web.example/';
    expect(resolveApiBaseUrl()).toBe('https://web.example');

    delete process.env.NEXT_PUBLIC_API_URL;
    process.env.EXPO_PUBLIC_API_URL = 'https://mob.example';
    expect(resolveApiBaseUrl()).toBe('https://mob.example');
  });

  it('sans env ni navigateur, vise le port par défaut du backend Go (8090)', () => {
    expect(resolveApiBaseUrl()).toBe('http://localhost:8090');
  });
});

describe('QoeApiClient — délai borné', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(okResponse({ data: [] }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('pose un signal d’annulation par défaut', async () => {
    const client = new QoeApiClient({ baseUrl: 'https://api.example' });
    await client.getFeed();
    const init = mockFetch.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('respecte un signal fourni par l’appelant', async () => {
    const client = new QoeApiClient({ baseUrl: 'https://api.example' });
    const controller = new AbortController();
    await client.getFeed();
    // Le signal explicite prime : vérifié via le chemin public `request`.
    await (
      client as unknown as {
        request: (p: string, o: RequestInit) => Promise<unknown>;
      }
    ).request('/v1/feed', { signal: controller.signal });
    const init = mockFetch.mock.calls.at(-1)![1] as RequestInit;
    expect(init.signal).toBe(controller.signal);
  });

  it('expose un délai par défaut non nul', () => {
    expect(DEFAULT_REQUEST_TIMEOUT_MS).toBeGreaterThan(0);
  });
});

describe('go-client — configuration lue à l’appel', () => {
  const savedUrl = process.env.QOE_API_URL;
  const savedTimeout = process.env.QOE_API_TIMEOUT_MS;

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(okResponse({ ok: true }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (savedUrl === undefined) delete process.env.QOE_API_URL;
    else process.env.QOE_API_URL = savedUrl;
    if (savedTimeout === undefined) delete process.env.QOE_API_TIMEOUT_MS;
    else process.env.QOE_API_TIMEOUT_MS = savedTimeout;
  });

  it('voit une URL posée après le chargement du module', () => {
    delete process.env.QOE_API_URL;
    expect(isGoEnabled()).toBe(false);
    expect(goApiUrl()).toBeNull();

    process.env.QOE_API_URL = 'https://go.example/';
    expect(isGoEnabled()).toBe(true);
    expect(goApiUrl()).toBe('https://go.example');
  });

  it('applique le timeout configuré et le borne à une valeur exploitable', () => {
    delete process.env.QOE_API_TIMEOUT_MS;
    expect(goTimeoutMs()).toBe(DEFAULT_GO_TIMEOUT_MS);

    process.env.QOE_API_TIMEOUT_MS = '2500';
    expect(goTimeoutMs()).toBe(2500);

    process.env.QOE_API_TIMEOUT_MS = 'nope';
    expect(goTimeoutMs()).toBe(DEFAULT_GO_TIMEOUT_MS);
  });

  it('envoie le jeton et un signal borné sur chaque appel', async () => {
    process.env.QOE_API_URL = 'http://localhost:8090';
    await goFetch('/v1/me');

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:8090/v1/me');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer fake-jwt');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.cache).toBe('no-store');
  });

  it('échoue explicitement quand l’API n’est pas configurée', async () => {
    delete process.env.QOE_API_URL;
    await expect(goFetch('/v1/me')).rejects.toThrow('QOE_API_URL non configuré');
  });
});

describe('isUnauthorizedError — pas de faux positif numérique', () => {
  it('ne classe pas un identifiant contenant 401 comme une session expirée', () => {
    expect(isUnauthorizedError(new Error('Article 401 introuvable'))).toBe(false);
  });

  it('reconnaît un vrai 401 et les codes d’authentification explicites', () => {
    expect(isUnauthorizedError({ status: 401 })).toBe(true);
    expect(isUnauthorizedError(new Error('HTTP 401: Unauthorized'))).toBe(true);
    expect(isUnauthorizedError(new Error('UNAUTHORIZED'))).toBe(true);
  });
});
