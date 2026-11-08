import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.QOE_API_URL = 'http://localhost:8080';

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

import { fetchMeWithSync } from '../actions/utils/go-client';

function okResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: async () => body,
  };
}

function errorResponse(status: number, errorMsg = 'Not found') {
  return {
    ok: false,
    status,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: async () => ({ error: errorMsg }),
  };
}

describe('fetchMeWithSync', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renvoie directement le profil si /v1/me réussit', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ id: 'u1', email: 'test@qoe.fi' }));

    const user = await fetchMeWithSync();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:8080/v1/me');
    expect(user).toEqual({ id: 'u1', email: 'test@qoe.fi' });
  });

  it('appelle /v1/me/sync puis re-exécute /v1/me si 404', async () => {
    mockFetch
      .mockResolvedValueOnce(errorResponse(404, 'User not found'))
      .mockResolvedValueOnce(okResponse({ created: true }))
      .mockResolvedValueOnce(okResponse({ id: 'u1', email: 'test@qoe.fi' }));

    const user = await fetchMeWithSync();
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:8080/v1/me');
    expect(mockFetch.mock.calls[1][0]).toBe('http://localhost:8080/v1/me/sync');
    expect(mockFetch.mock.calls[1][1]?.method).toBe('POST');
    expect(mockFetch.mock.calls[2][0]).toBe('http://localhost:8080/v1/me');
    expect(user).toEqual({ id: 'u1', email: 'test@qoe.fi' });
  });

  it('propage l’erreur si le status n’est pas 404', async () => {
    mockFetch.mockResolvedValueOnce(errorResponse(500, 'Server error'));

    await expect(fetchMeWithSync()).rejects.toThrow('Server error');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
