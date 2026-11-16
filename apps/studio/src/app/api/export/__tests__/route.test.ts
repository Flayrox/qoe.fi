import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

import { createClient } from '@qoe/supabase/server';
import { getActiveWorkspace } from '@/lib/active-workspace';

import { GET } from '../route';

vi.mock('@qoe/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/active-workspace', () => ({ getActiveWorkspace: vi.fn() }));

const mockSupabase = vi.mocked(createClient);
const mockWorkspace = vi.mocked(getActiveWorkspace);

function sessionFor(user: { id: string } | null, token = 'jwt_abc') {
  return {
    auth: {
      getSession: async () => ({ data: { session: user ? { user, access_token: token } : null } }),
    },
  };
}

describe('/api/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('QOE_API_URL', 'https://api.test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('refuse un visiteur non authentifié sans contacter l’API', async () => {
    mockSupabase.mockResolvedValue(sessionFor(null) as never);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('répond 503 quand l’API n’est pas configurée', async () => {
    vi.stubEnv('QOE_API_URL', '');
    mockSupabase.mockResolvedValue(sessionFor({ id: 'user_1' }) as never);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET();

    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('relaie le statut d’erreur amont au lieu de renvoyer un ZIP vide', async () => {
    mockSupabase.mockResolvedValue(sessionFor({ id: 'user_1' }) as never);
    mockWorkspace.mockResolvedValue({ publisherId: 'pub_1' } as never);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('boom', { status: 502 }))
    );

    const response = await GET();

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Export impossible' });
  });

  it('signe la requête amont et verrouille le cache de l’archive', async () => {
    mockSupabase.mockResolvedValue(sessionFor({ id: 'user_1' }, 'jwt_abc') as never);
    mockWorkspace.mockResolvedValue({ publisherId: 'pub 1/équipe' } as never);
    const fetchMock = vi.fn(
      async () =>
        new Response(new Uint8Array([80, 75, 3, 4]), {
          status: 200,
          headers: { 'Content-Disposition': 'attachment; filename="qoe-2026.zip"' },
        })
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await GET();

    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.test/v1/creator/export?publisherId=pub%201%2F%C3%A9quipe');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer jwt_abc');
    expect(response.headers.get('Content-Type')).toBe('application/zip');
    expect(response.headers.get('Content-Disposition')).toBe('attachment; filename="qoe-2026.zip"');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('replie sur un nom de fichier par défaut si l’amont n’en fournit pas', async () => {
    mockSupabase.mockResolvedValue(sessionFor({ id: 'user_1' }) as never);
    mockWorkspace.mockResolvedValue({ publisherId: 'pub_1' } as never);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(new Uint8Array([1]), { status: 200 }))
    );

    const response = await GET();

    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="qoe-export.zip"'
    );
  });
});
