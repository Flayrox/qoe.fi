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
  it('ne fait PAS de second appel à /v1/me/publisher si ws.publisherId est renseigné en PERSONAL', async () => {
    goFetch.mockResolvedValue({
      type: 'PERSONAL',
      publisherId: 'pub_perso_123',
      name: 'Mon Blog',
      slug: 'mon-blog',
      logoUrl: null,
      permissions: ['read', 'write'],
    });

    const ctx = await getActiveWorkspaceContext();
    expect(calls()).toHaveLength(1);
    expect(calls()[0][0]).toBe('/v1/workspaces/active');
    expect(ctx.publisherId).toBe('pub_perso_123');
    expect(ctx.type).toBe('PERSONAL');
  });

  it('appelle /v1/me/publisher si ws.publisherId est vide en PERSONAL', async () => {
    goFetch
      .mockResolvedValueOnce({
        type: 'PERSONAL',
        publisherId: '',
        name: null,
        slug: null,
        logoUrl: null,
        permissions: [],
      })
      .mockResolvedValueOnce({
        publisherId: 'pub_created_456',
      });

    const ctx = await getActiveWorkspaceContext();
    expect(calls()).toHaveLength(2);
    expect(calls()[0][0]).toBe('/v1/workspaces/active');
    expect(calls()[1][0]).toBe('/v1/me/publisher');
    expect(ctx.publisherId).toBe('pub_created_456');
    expect(ctx.type).toBe('PERSONAL');
  });
});
