import { describe, it, expect, vi, beforeEach } from 'vitest';

const goFetch = vi.fn();
const mockCookies = vi.fn();

vi.mock('next/headers', () => ({
  cookies: () => mockCookies(),
}));

vi.mock('../actions/utils/go-client', () => ({
  goFetch: (...args: unknown[]) => goFetch(...args),
}));

import { getActiveWorkspaceContext } from '../actions/workspace';

type Call = [path: string, init?: { method?: string; body?: unknown }];

function calls(): Call[] {
  return goFetch.mock.calls as unknown as Call[];
}

beforeEach(() => {
  goFetch.mockReset();
  mockCookies.mockReset();
  mockCookies.mockReturnValue({
    get: vi.fn().mockReturnValue(undefined),
  });
});

describe('getActiveWorkspaceContext', () => {
  it('ne fait PAS de second appel à /v1/me/publication si ws.publicationId est renseigné en PERSONAL', async () => {
    goFetch.mockResolvedValue({
      type: 'PERSONAL',
      publicationId: 'pub_perso_123',
      name: 'Mon Blog',
      slug: 'mon-blog',
      logoUrl: null,
      permissions: ['read', 'write'],
    });

    const ctx = await getActiveWorkspaceContext();
    expect(calls()).toHaveLength(1);
    expect(calls()[0][0]).toBe('/v1/workspaces/active');
    expect(ctx.publicationId).toBe('pub_perso_123');
    expect(ctx.type).toBe('PERSONAL');
  });

  it('appelle /v1/me/publication si ws.publicationId est vide en PERSONAL', async () => {
    goFetch
      .mockResolvedValueOnce({
        type: 'PERSONAL',
        publicationId: '',
        name: null,
        slug: null,
        logoUrl: null,
        permissions: [],
      })
      .mockResolvedValueOnce({
        publicationId: 'pub_created_456',
      });

    const ctx = await getActiveWorkspaceContext();
    expect(calls()).toHaveLength(2);
    expect(calls()[0][0]).toBe('/v1/workspaces/active');
    expect(calls()[1][0]).toBe('/v1/me/publication');
    expect(ctx.publicationId).toBe('pub_created_456');
    expect(ctx.type).toBe('PERSONAL');
  });
});
