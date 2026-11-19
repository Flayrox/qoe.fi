// =====================================================================
// 🧪 routes & handlers — apps/core/src/app (L20b1)
// =====================================================================
// Un handler de route n'échoue pas bruyamment : il renvoie un statut. Un
// mauvais statut, un succès mensonger ou une URL d'API figée se voient en
// production, pas en CI. On verrouille donc ici les contrats HTTP réels.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const goFetchMock = vi.hoisted(() => vi.fn());
const uploadAndProcessMock = vi.hoisted(() => vi.fn());
const getUserMock = vi.hoisted(() => vi.fn());

vi.mock('@qoe/sdk/actions/utils/go-client', () => ({
  goFetch: goFetchMock,
  goFetchBinary: vi.fn(),
  goFetchUpload: vi.fn(),
}));

vi.mock('@qoe/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: getUserMock } }),
}));

vi.mock('@qoe/supabase/media-engine', () => ({
  uploadAndProcessMedia: uploadAndProcessMock,
  IMAGE_FOLDERS: { thoughts: 'thoughts', avatars: 'avatars' },
}));

vi.mock('@qoe/config', () => ({
  getLandingAppUrl: () => 'https://landing.qoe.fi',
}));

function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  goFetchMock.mockReset();
  uploadAndProcessMock.mockReset();
  getUserMock.mockReset();
});

describe('POST /api/analytics/reading-session (L20b1)', () => {
  it('ne prétend pas avoir enregistré la session quand Go échoue', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    goFetchMock.mockRejectedValue(new Error('Go down'));
    const { POST } = await import('../api/analytics/reading-session/route');

    const res = await POST(post({ articleId: 'art-1', status: 'READ_PARTIAL' }));
    const body = await res.json();

    // Un échec backend n'est pas un succès : le client ne doit pas croire que
    // la lecture a été enregistrée, et aucune valeur inventée ne doit sortir.
    expect(res.status).toBe(502);
    expect(body.success).toBe(false);
    expect(body.updatedCompletionRate).toBeUndefined();
  });
});

describe('POST /api/upload (L20b1)', () => {
  function uploadRequest(): NextRequest {
    const form = new FormData();
    form.set('file', new File([new Uint8Array([1, 2, 3])], 'photo.png', { type: 'image/png' }));
    form.set('folder', 'thoughts');
    return new NextRequest('http://localhost/api/upload', { method: 'POST', body: form });
  }

  it('renvoie 500 (pas 400) quand le pipeline serveur casse', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    uploadAndProcessMock.mockRejectedValue(new Error('sharp: decoder interne'));
    const { POST } = await import('../api/upload/route');

    const res = await POST(uploadRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    // Le détail interne (Sharp, chemins, stack) ne sort pas dans une réponse.
    expect(body.error).not.toContain('sharp');
  });
});

describe('GET /api/reading-history (L20b1)', () => {
  it("retombe sur 14 jours quand `days` n'est pas un nombre", async () => {
    goFetchMock.mockResolvedValue({ sessions: [], count: 0 });
    const { GET } = await import('../api/reading-history/route');

    await GET(new NextRequest('http://localhost/api/reading-history?days=abc'));

    expect(goFetchMock).toHaveBeenCalledWith('/v1/me/reading-history?days=14');
  });
});

describe('sitemap-lib — client Go (L20b1)', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.QOE_API_URL;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ items: [], total: 0 }) }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.QOE_API_URL;
  });

  it("lit QOE_API_URL à l'appel, pas au chargement du module", async () => {
    const lib = await import('../sitemap-lib');
    process.env.QOE_API_URL = 'https://api.test';

    await lib.articleUrls(0, 10);

    const url = String(vi.mocked(fetch).mock.calls[0]?.[0]);
    expect(url.startsWith('https://api.test/')).toBe(true);
  });

  it("borne l'appel de sitemap par un AbortSignal", async () => {
    const lib = await import('../sitemap-lib');
    await lib.articleUrls(0, 10);

    const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});

describe('GET /api/articles/[slug] (L20b1)', () => {
  it("n'autorise pas un cache partagé sur une réponse qui dépend du lecteur", async () => {
    goFetchMock.mockResolvedValue({
      id: 'art-1',
      slug: 'mon-article',
      isPremium: true,
      isTruncated: false,
      accessGranted: true,
      paywallMeta: null,
    });
    const { GET } = await import('../api/articles/[slug]/route');

    const res = await GET(new NextRequest('http://localhost/api/articles/mon-article'), {
      params: Promise.resolve({ slug: 'mon-article' }),
    });

    // Le corps dépend de la session (accessGranted, troncature paywall) : un
    // cache public le servirait à un autre lecteur.
    expect(res.headers.get('Cache-Control') ?? '').toContain('private');
  });
});

describe('page /l/[code] (L20b1)', () => {
  it('ne décode pas une seconde fois le paramètre déjà décodé par Next', async () => {
    vi.doMock('next/navigation', () => ({
      notFound: () => {
        throw new Error('NOT_FOUND');
      },
      permanentRedirect: () => {
        throw new Error('REDIRECT');
      },
    }));
    goFetchMock.mockResolvedValue({ id: 'a1', slug: 'mon-article', username: 'alice' });
    const { default: ShortArticlePage } = await import('../l/[code]/page');

    // Next passe `code` déjà décodé : un `%` isolé ne doit pas lever
    // d'URIError (500) mais simplement être utilisé tel quel.
    await expect(ShortArticlePage({ params: Promise.resolve({ code: 'bad%' }) })).rejects.toThrow(
      'REDIRECT'
    );

    vi.doUnmock('next/navigation');
  });
});
