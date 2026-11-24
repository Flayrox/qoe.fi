import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROLES } from '@qoe/config';

const supabaseMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getSession: vi.fn(),
}));
const nextNavMocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    const err = new Error(`NEXT_REDIRECT:${url}`) as Error & { url: string };
    err.url = url;
    throw err;
  }),
}));
const nextHeadersMock = vi.hoisted(() => vi.fn());

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  };
});

vi.mock('@qoe/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: supabaseMocks.getUser,
      getSession: supabaseMocks.getSession,
    },
  }),
}));

vi.mock('next/navigation', () => nextNavMocks);
vi.mock('next/headers', () => ({ headers: nextHeadersMock }));

import { isCreator, isSuperadmin } from '../roles';
import { canEditMediaArticle, isMediaAdmin, requireMedia } from '../media';
import { fetchMeWithSync, goFetch } from '../go-client';
import {
  getAuthUser,
  getCurrentUser,
  requireCreator,
  requirePermission,
  requireRole,
  requireSuperadmin,
  requireUser,
} from '../current-user';
import { PermissionError } from '../permissions';

describe('@qoe/auth — roles et permissions média', () => {
  it('distingue isSuperadmin et isCreator selon la hiérarchie', () => {
    expect(isSuperadmin(ROLES.SUPERADMIN)).toBe(true);
    expect(isSuperadmin(ROLES.CREATOR)).toBe(false);
    expect(isSuperadmin(null)).toBe(false);

    expect(isCreator(ROLES.SUPERADMIN)).toBe(true);
    expect(isCreator(ROLES.CREATOR)).toBe(true);
    expect(isCreator(ROLES.USER)).toBe(false);
    expect(isCreator(null)).toBe(false);
  });

  it('applique requireMedia, canEditMediaArticle et isMediaAdmin', () => {
    const owner = { role: 'owner', status: 'active' };
    const editor = { role: 'editor', status: 'active' };
    const writer = { role: 'writer', status: 'active' };

    expect(() => requireMedia(owner, 'media:view_analytics')).not.toThrow();
    expect(() => requireMedia(writer, 'media:view_analytics')).toThrow(/Permission insuffisante/);

    expect(canEditMediaArticle(null, { authorId: 'u1' }, 'u1')).toBe(false);
    expect(canEditMediaArticle(editor, { authorId: 'other' }, 'u2')).toBe(true);
    expect(canEditMediaArticle(writer, { authorId: 'u3' }, 'u3')).toBe(true);
    expect(canEditMediaArticle(writer, { authorId: 'other' }, 'u3')).toBe(false);

    expect(isMediaAdmin(null)).toBe(false);
    expect(isMediaAdmin(editor)).toBe(true);
    expect(isMediaAdmin(writer)).toBe(false);
  });
});

describe('@qoe/auth — go-client (Bearer + fetchMeWithSync)', () => {
  const prevApiUrl = process.env.QOE_API_URL;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMocks.getSession.mockResolvedValue({ data: { session: { access_token: 'jwt_tok' } } });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (prevApiUrl === undefined) delete process.env.QOE_API_URL;
    else process.env.QOE_API_URL = prevApiUrl;
  });

  it('refuse goFetch sans QOE_API_URL et attache status + Bearer sinon', async () => {
    delete process.env.QOE_API_URL;
    await expect(goFetch('/v1/me')).rejects.toThrow(/QOE_API_URL non configuré/);

    process.env.QOE_API_URL = 'https://api.qoe.test';
    globalThis.fetch = vi.fn(async (_url, init) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer jwt_tok');
      return new Response(JSON.stringify({ error: 'Interdit' }), { status: 403 });
    }) as unknown as typeof fetch;

    await expect(goFetch('/v1/admin/x', { method: 'POST', body: { a: 1 } })).rejects.toMatchObject({
      message: 'Interdit',
      status: 403,
    });
  });

  it('synchronise via POST /v1/me/sync si GET /v1/me répond 404', async () => {
    process.env.QOE_API_URL = 'https://api.qoe.test';
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ created: true }), { status: 201 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'u1', role: 'user' }), { status: 200 })
      );
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const me = await fetchMeWithSync<{ id: string }>();
    expect(me.id).toBe('u1');
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });
});

describe('@qoe/auth — current-user & gardes serveur', () => {
  const prevApiUrl = process.env.QOE_API_URL;
  const prevNodeEnv = process.env.NODE_ENV;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.QOE_API_URL = 'https://api.qoe.test';
    supabaseMocks.getSession.mockResolvedValue({ data: { session: { access_token: 'tok' } } });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (prevApiUrl === undefined) delete process.env.QOE_API_URL;
    else process.env.QOE_API_URL = prevApiUrl;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
  });

  it('getAuthUser et getCurrentUser retournent null sur 401/403/404 et relancent sur 500', async () => {
    supabaseMocks.getUser.mockResolvedValueOnce({ data: { user: null } });
    expect(await getAuthUser()).toBeNull();

    supabaseMocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    globalThis.fetch = vi.fn(async () => new Response('{}', { status: 401 })) as typeof fetch;
    expect(await getCurrentUser()).toBeNull();

    globalThis.fetch = vi.fn(async () => new Response('boom', { status: 500 })) as typeof fetch;
    await expect(getCurrentUser()).rejects.toMatchObject({ status: 500 });
  });

  it('requireUser redirige sans fuiter 0.0.0.0 et retombe sur /login si headers indisponible', async () => {
    supabaseMocks.getUser.mockResolvedValue({ data: { user: null } });
    nextHeadersMock.mockResolvedValueOnce(
      new Headers({ host: '0.0.0.0:3000', 'x-invoke-path': '/studio/settings' })
    );

    await expect(requireUser()).rejects.toThrow(/NEXT_REDIRECT:/);
    expect(nextNavMocks.redirect).toHaveBeenLastCalledWith(expect.not.stringContaining('0.0.0.0'));

    nextHeadersMock.mockRejectedValueOnce(new Error('static context'));
    await expect(requireUser()).rejects.toThrow('NEXT_REDIRECT:/login');
  });

  it('requirePermission, requireRole, requireSuperadmin et requireCreator appliquent le RBAC', async () => {
    supabaseMocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    globalThis.fetch = vi.fn(
      async () => new Response(JSON.stringify({ id: 'u1', role: ROLES.CREATOR }), { status: 200 })
    ) as typeof fetch;

    await expect(requireCreator()).resolves.toMatchObject({ id: 'u1' });
    await expect(requirePermission('article:create')).resolves.toMatchObject({ id: 'u1' });
    await expect(requireSuperadmin()).rejects.toBeInstanceOf(PermissionError);
    await expect(requireRole(ROLES.SUPERADMIN)).rejects.toThrow(/Forbidden/);
  });
});
