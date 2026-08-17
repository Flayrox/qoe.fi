import { describe, it, expect, vi } from 'vitest';
import { createSupabaseVerifier } from './auth';

function mockFetch(status: number, body: unknown) {
  return vi.fn(async () => {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  });
}

describe('createSupabaseVerifier', () => {
  it('rejette un token vide ou absent', async () => {
    const verify = createSupabaseVerifier('https://x.supabase.co', mockFetch(200, {})).verify;
    await expect(verify('')).resolves.toBeNull();
  });

  it('retourne null si Supabase répond 401', async () => {
    const verify = createSupabaseVerifier('https://x.supabase.co', mockFetch(401, {})).verify;
    await expect(verify('token-expire')).resolves.toBeNull();
  });

  it('retourne l’utilisateur avec le nom depuis user_metadata', async () => {
    const verify = createSupabaseVerifier(
      'https://x.supabase.co/',
      mockFetch(200, {
        sub: 'user-123',
        email: 'a@b.co',
        user_metadata: { name: 'Alice' },
      })
    ).verify;
    await expect(verify('token-valide')).resolves.toEqual({
      id: 'user-123',
      name: 'Alice',
      email: 'a@b.co',
    });
  });

  it('retombe sur l’email puis sur un nom générique', async () => {
    const verify = createSupabaseVerifier(
      'https://x.supabase.co',
      mockFetch(200, { sub: 'user-2', email: 'b@c.co' })
    ).verify;
    await expect(verify('t')).resolves.toEqual({
      id: 'user-2',
      name: 'b@c.co',
      email: 'b@c.co',
    });

    const verify2 = createSupabaseVerifier(
      'https://x.supabase.co',
      mockFetch(200, { sub: 'user-3' })
    ).verify;
    await expect(verify2('t')).resolves.toEqual({
      id: 'user-3',
      name: 'Éditeur',
      email: undefined,
    });
  });

  it('appelle bien l’endpoint d’introspection avec le Bearer token', async () => {
    const fetchImpl = mockFetch(200, { sub: 'u', email: 'e@f.co' });
    await createSupabaseVerifier('https://x.supabase.co', fetchImpl).verify('mon-token');
    expect(fetchImpl).toHaveBeenCalledWith('https://x.supabase.co/auth/v1/user', {
      headers: { Authorization: 'Bearer mon-token', apikey: 'mon-token' },
    });
  });
});
