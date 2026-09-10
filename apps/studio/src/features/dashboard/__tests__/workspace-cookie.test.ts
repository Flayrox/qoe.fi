import { describe, it, expect, vi } from 'vitest';
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

import { getActiveWorkspace, getActivePublicationId } from '@/lib/active-workspace';

describe('getActiveWorkspace & getActivePublicationId', () => {
  it('returns MEDIA workspace when cookie has MEDIA and Go succeeds', async () => {
    const cookieVal = encodeURIComponent(JSON.stringify({ type: 'MEDIA', id: 'med_456' }));
    mockCookies.mockResolvedValue({
      get: (key: string) => (key === 'qoe_active_workspace' ? { value: cookieVal } : undefined),
    });
    mockGoFetch.mockResolvedValue({
      type: 'MEDIA',
      publicationId: 'pub_media_1',
      name: 'Media Actu',
      slug: 'media-actu',
      logoUrl: null,
      mediaId: 'med_456',
    });

    const ws = await getActiveWorkspace('usr_1');
    expect(ws.publicationId).toBe('pub_media_1');
    expect(ws.type).toBe('MEDIA');
    expect(mockGoFetch).toHaveBeenCalledWith('/v1/workspaces/active?mediaId=med_456');

    const pubId = await getActivePublicationId('usr_1');
    expect(pubId).toBe('pub_media_1');
  });

  it('falls back to personal workspace when Go call fails', async () => {
    mockCookies.mockResolvedValue({
      get: () => undefined,
    });
    mockGoFetch.mockRejectedValue(new Error('Network error'));

    const ws = await getActiveWorkspace('usr_fallback');
    expect(ws).toEqual({
      type: 'PERSONAL',
      publicationId: 'usr_fallback',
      name: 'Profil Personnel',
      slug: 'personal',
      logoUrl: null,
    });
  });
});
