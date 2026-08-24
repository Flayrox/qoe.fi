import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QoeApiClient } from '../client';

// Le client lit `fetch` global : on le remplace intégralement.
const mockFetch = vi.fn();

function okResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
  };
}

function errResponse(status: number, statusText = 'Error', body: unknown = {}) {
  return {
    ok: false,
    status,
    statusText,
    json: async () => body,
  };
}

describe('QoeApiClient — transport HTTP universel', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    mockFetch.mockReset();
  });

  it('baseUrl par défaut : localhost:8080 hors navigateur', () => {
    const client = new QoeApiClient();
    // On vérifie via l'URL réellement appelée.
    mockFetch.mockResolvedValueOnce(okResponse({ data: [] }));
    void client.getFeed();
    expect(mockFetch.mock.calls[0][0]).toBe('http://localhost:8080/v1/feed');
  });

  it('normalise un baseUrl avec slash final et un path sans slash initial', async () => {
    const client = new QoeApiClient({ baseUrl: 'https://api.qoe.fi/' });
    mockFetch.mockResolvedValueOnce(okResponse({ data: [] }));
    await client.getFeed();
    expect(mockFetch.mock.calls[0][0]).toBe('https://api.qoe.fi/v1/feed');
  });

  it('déplie l’enveloppe Go {data: …}', async () => {
    const client = new QoeApiClient();
    mockFetch.mockResolvedValueOnce(okResponse({ data: { post: { id: 'p1' } } }));

    const res = await client.getThought('p1');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual({ post: { id: 'p1' } });
  });

  it('renvoie le JSON brut quand il n’y a pas d’enveloppe {data}', async () => {
    const client = new QoeApiClient();
    mockFetch.mockResolvedValueOnce(okResponse({ hits: [], estimatedTotalHits: 0 }));

    const res = await client.searchArticles('q');
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual({ hits: [], estimatedTotalHits: 0 });
  });

  it('ajoute le header Authorization quand getAuthToken fournit un token', async () => {
    const client = new QoeApiClient({
      baseUrl: 'https://api.qoe.fi',
      getAuthToken: () => 'tok-123',
    });
    mockFetch.mockResolvedValueOnce(okResponse({ data: [] }));

    await client.getFeed();
    const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer tok-123');
  });

  it("n'ajoute pas de header Authorization si le token est vide", async () => {
    const client = new QoeApiClient({
      baseUrl: 'https://api.qoe.fi',
      getAuthToken: () => null,
    });
    mockFetch.mockResolvedValueOnce(okResponse({ data: [] }));

    await client.getFeed();
    const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('getAuthToken asynchrone est attendu', async () => {
    const client = new QoeApiClient({
      baseUrl: 'https://api.qoe.fi',
      getAuthToken: async () => 'async-tok',
    });
    mockFetch.mockResolvedValueOnce(okResponse({ data: [] }));

    await client.getFeed();
    const headers = mockFetch.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer async-tok');
  });

  it('erreur 4xx : pas de retry, message JSON prioritaire, statut attaché', async () => {
    const client = new QoeApiClient();
    mockFetch.mockResolvedValueOnce(
      errResponse(404, 'Not Found', { error: 'Article introuvable' })
    );

    const res = await client.getArticle('missing', 'pub-x');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ ok: false, error: 'Article introuvable', status: 404 });
  });

  it('retombe sur json.message puis HTTP <status> si pas de champ error', async () => {
    const client = new QoeApiClient();

    mockFetch.mockResolvedValueOnce(
      errResponse(400, 'Bad Request', { message: 'payload invalide' })
    );
    const r1 = await client.createThought('x');
    expect(r1.ok === false && r1.error).toBe('payload invalide');

    mockFetch.mockResolvedValueOnce(errResponse(403, 'Forbidden'));
    const r2 = await client.toggleLike('y');
    expect(r2.ok === false && r2.error).toBe('HTTP 403: Forbidden');
  });

  it('429 sur GET : retente puis réussit (backoff)', async () => {
    const client = new QoeApiClient();
    mockFetch
      .mockResolvedValueOnce(errResponse(429, 'Too Many Requests'))
      .mockResolvedValueOnce(okResponse({ data: ['ok'] }));

    const promise = client.getFeed();
    await vi.advanceTimersByTimeAsync(500); // backoff 400ms du 1er retry
    const res = await promise;

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(res).toEqual({ ok: true, data: ['ok'] });
  });

  it('5xx persistant sur GET : épuise les 3 tentatives et renvoie la dernière erreur', async () => {
    const client = new QoeApiClient();
    mockFetch
      .mockResolvedValueOnce(errResponse(503, 'Service Unavailable'))
      .mockResolvedValueOnce(errResponse(503, 'Service Unavailable'))
      .mockResolvedValueOnce(errResponse(503, 'Service Unavailable'));

    const promise = client.getFeed();
    await vi.advanceTimersByTimeAsync(2000);
    const res = await promise;

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(503);
  });

  it('mutation POST : échec réseau immédiat, aucun retry', async () => {
    const client = new QoeApiClient();
    mockFetch.mockRejectedValueOnce(new Error('boom'));

    const res = await client.createThought('salut');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ ok: false, error: 'boom' });
  });

  it('échec réseau non-Error sur GET : retente puis renvoie Network Error', async () => {
    const client = new QoeApiClient();
    mockFetch.mockRejectedValue('not-an-error-object');

    const promise = client.getFeed();
    await vi.advanceTimersByTimeAsync(2000);
    const res = await promise;

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('Network Error');
  });

  it('getFeed transmet cursor/limit/tab en querystring', async () => {
    const client = new QoeApiClient({ baseUrl: 'https://api.qoe.fi' });
    mockFetch.mockResolvedValueOnce(okResponse({ data: [] }));

    await client.getFeed({ cursor: 'c1', limit: 10, tab: 'following' });
    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('/v1/feed?');
    expect(url).toContain('cursor=c1');
    expect(url).toContain('limit=10');
    expect(url).toContain('tab=following');
  });

  it('getThread encode l’id du post', async () => {
    const client = new QoeApiClient({ baseUrl: 'https://api.qoe.fi' });
    mockFetch.mockResolvedValueOnce(okResponse({ data: { post: {} } }));

    await client.getThread('id avec espace');
    expect(mockFetch.mock.calls[0][0]).toBe(
      'https://api.qoe.fi/v1/posts/id%20avec%20espace/thread'
    );
  });
});
