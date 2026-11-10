import { beforeEach, describe, it, expect, vi } from 'vitest';
import { parseCookie } from '@/lib/active-workspace';

describe('workspace cookie parser', () => {
  it('returns null when cookie is missing or empty', () => {
    expect(parseCookie(undefined)).toBeNull();
    expect(parseCookie(null)).toBeNull();
    expect(parseCookie('')).toBeNull();
  });

  it('returns null when JSON is invalid or malformed', () => {
    expect(parseCookie('not-json')).toBeNull();
    expect(parseCookie('{invalid:json}')).toBeNull();
  });

  it('returns null when type or id is missing', () => {
    const withoutId = encodeURIComponent(JSON.stringify({ type: 'MEDIA' }));
    expect(parseCookie(withoutId)).toBeNull();

    const withoutType = encodeURIComponent(JSON.stringify({ id: 'med_123' }));
    expect(parseCookie(withoutType)).toBeNull();

    const emptyObj = encodeURIComponent(JSON.stringify({}));
    expect(parseCookie(emptyObj)).toBeNull();
  });

  it('correctly parses a valid encoded MEDIA workspace cookie', () => {
    const payload = { type: 'MEDIA', id: 'med_abcdef123456' };
    const raw = encodeURIComponent(JSON.stringify(payload));
    const result = parseCookie(raw);

    expect(result).toEqual({
      type: 'MEDIA',
      id: 'med_abcdef123456',
    });
  });

  it('correctly parses a valid encoded PERSONAL workspace cookie', () => {
    const payload = { type: 'PERSONAL', id: 'usr_7890' };
    const raw = encodeURIComponent(JSON.stringify(payload));
    const result = parseCookie(raw);

    expect(result).toEqual({
      type: 'PERSONAL',
      id: 'usr_7890',
    });
  });

  it('handles unencoded JSON strings gracefully', () => {
    const payload = JSON.stringify({ type: 'MEDIA', id: 'med_plain' });
    const result = parseCookie(payload);

    expect(result).toEqual({
      type: 'MEDIA',
      id: 'med_plain',
    });
  });
});

const mockGoFetch = vi.fn();
const mockCookies = vi.fn();

vi.mock('@qoe/sdk/actions/utils/go-client', () => ({
  goFetch: (...args: unknown[]) => mockGoFetch(...args),
}));

vi.mock('next/headers', () => ({
  cookies: () => mockCookies(),
}));

// `cache()` de React mémoïse par requête via le dispatcher Next ; hors rendu
// (tests) il garderait le résultat entre les cas. On le neutralise pour tester
// la logique de résolution, pas la mémoïsation.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T>(fn: T) => fn,
}));

import { getActiveWorkspace, getActivePublisherId } from '@/lib/active-workspace';

describe('getActiveWorkspace & getActivePublisherId', () => {
  beforeEach(() => {
    mockGoFetch.mockReset();
    mockCookies.mockReset();
  });

  it('returns MEDIA workspace when cookie has MEDIA and Go succeeds', async () => {
    const cookieVal = encodeURIComponent(JSON.stringify({ type: 'MEDIA', id: 'med_456' }));
    mockCookies.mockResolvedValue({
      get: (key: string) => (key === 'qoe_active_workspace' ? { value: cookieVal } : undefined),
    });
    mockGoFetch.mockResolvedValue({
      type: 'MEDIA',
      publisherId: 'pub_media_1',
      name: 'Media Actu',
      slug: 'media-actu',
      logoUrl: null,
      mediaId: 'med_456',
      mediaRole: 'editor',
      permissions: ['media:create_articles'],
    });

    const ws = await getActiveWorkspace('usr_1');
    expect(ws.publisherId).toBe('pub_media_1');
    expect(ws.type).toBe('MEDIA');
    expect(ws.permissions).toEqual(['media:create_articles']);
    expect(mockGoFetch).toHaveBeenCalledWith('/v1/workspaces/active?mediaId=med_456');

    const pubId = await getActivePublisherId('usr_1');
    expect(pubId).toBe('pub_media_1');
  });

  it('resolves the real personal publication (never the userId) when no media cookie', async () => {
    mockCookies.mockResolvedValue({ get: () => undefined });
    mockGoFetch.mockResolvedValueOnce({
      type: 'PERSONAL',
      publisherId: 'usr_1',
      name: 'Ada',
      slug: 'ada',
      logoUrl: null,
    });
    mockGoFetch.mockResolvedValueOnce({ publisherId: 'pub_personal_1' });

    const ws = await getActiveWorkspace('usr_1');
    expect(ws).toEqual({
      type: 'PERSONAL',
      publisherId: 'pub_personal_1',
      name: 'Ada',
      slug: 'ada',
      logoUrl: null,
      permissions: [],
    });
    expect(mockGoFetch).toHaveBeenNthCalledWith(2, '/v1/me/publisher');
  });

  it('flags a stale MEDIA cookie instead of silently pretending it is active', async () => {
    const cookieVal = encodeURIComponent(JSON.stringify({ type: 'MEDIA', id: 'med_gone' }));
    mockCookies.mockResolvedValue({
      get: (key: string) => (key === 'qoe_active_workspace' ? { value: cookieVal } : undefined),
    });
    mockGoFetch.mockResolvedValueOnce({
      type: 'PERSONAL',
      publisherId: 'usr_1',
      name: 'Ada',
      slug: 'ada',
      logoUrl: null,
    });
    mockGoFetch.mockResolvedValueOnce({ publisherId: 'pub_personal_1' });

    const ws = await getActiveWorkspace('usr_1');
    expect(ws.type).toBe('PERSONAL');
    expect(ws.publisherId).toBe('pub_personal_1');
    expect(ws.fallbackFromMediaId).toBe('med_gone');
  });

  it('propagates Go failures instead of inventing a publication id', async () => {
    mockCookies.mockResolvedValue({ get: () => undefined });
    mockGoFetch.mockRejectedValue(new Error('Network error'));

    await expect(getActiveWorkspace('usr_fallback')).rejects.toThrow('Network error');
  });
});
