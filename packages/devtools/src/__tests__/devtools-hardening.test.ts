import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ── Doublures minimales des frontières externes ───────────────────────
// `@qoe/supabase/server` (Auth + service role) et `fetch` (API Go) sont
// remplacés ; toute la logique de `@qoe/devtools` s'exécute réellement.
const supabaseMock = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
  adminCreateUser: vi.fn(),
  adminListUsers: vi.fn(),
  adminUpdateUserById: vi.fn(),
}));

vi.mock('@qoe/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'jwt-token' } } }),
      signInWithPassword: supabaseMock.signInWithPassword,
      signOut: supabaseMock.signOut,
    },
  }),
  createServiceClient: () => ({
    auth: {
      admin: {
        createUser: supabaseMock.adminCreateUser,
        listUsers: supabaseMock.adminListUsers,
        updateUserById: supabaseMock.adminUpdateUserById,
      },
    },
  }),
}));

function jsonResponse(payload: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => payload } as Response;
}

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe('@qoe/devtools — client Go (L17)', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.QOE_API_URL;
    delete process.env.QOE_INTERNAL_SECRET;
  });

  it("lit QOE_API_URL au moment de l'appel, pas au chargement du module", async () => {
    const client = await import('../go-client');
    expect(client.isGoEnabled()).toBe(false);

    process.env.QOE_API_URL = 'https://api.test';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ ok: true }))
    );

    expect(client.isGoEnabled()).toBe(true);
    await expect(client.goFetch('/v1/devtools/data')).resolves.toEqual({ ok: true });
  });

  it("borne l'appel Go par un AbortSignal", async () => {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () =>
      jsonResponse({ ok: true })
    );
    vi.stubGlobal('fetch', fetchMock);
    process.env.QOE_API_URL = 'https://api.test';

    const { goFetch } = await import('../go-client');
    await goFetch('/v1/devtools/data');

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("n'envoie jamais la clé service role en production", async () => {
    process.env.NODE_ENV = 'production';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-secret';
    process.env.QOE_API_URL = 'https://api.test';
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () =>
      jsonResponse({ ok: true })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { goFetch } = await import('../go-client');
    await goFetch('/v1/devtools/data');

    const headers = (fetchMock.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;
    expect(headers['x-qoe-internal-secret']).toBeUndefined();
    // Le JWT Supabase reste la seule authentification en production.
    expect(headers.Authorization).toBe('Bearer jwt-token');
  });

  it('garde le secret de dev hors production', async () => {
    process.env.NODE_ENV = 'development';
    process.env.QOE_INTERNAL_SECRET = 'dev-secret';
    process.env.QOE_API_URL = 'https://api.test';
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () =>
      jsonResponse({ ok: true })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { goFetch } = await import('../go-client');
    await goFetch('/v1/devtools/data');

    const headers = (fetchMock.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>;
    expect(headers['x-qoe-internal-secret']).toBe('dev-secret');
  });

  it("expose le message d'erreur Go et son statut", async () => {
    process.env.QOE_API_URL = 'https://api.test';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: 'Accès réservé au superadmin.' }, false, 403))
    );

    const { goFetch } = await import('../go-client');
    await expect(goFetch('/v1/devtools/data')).rejects.toMatchObject({
      message: 'Accès réservé au superadmin.',
      status: 403,
    });
  });
});

describe('@qoe/devtools — recherche du compte Supabase Auth (L17)', () => {
  const target = { id: 'auth-target', email: 'target@qoe.fi' };
  const fullPage = Array.from({ length: 1000 }, (_unused, index) => ({
    id: `u-${index}`,
    email: `user${index}@qoe.fi`,
  }));
  // Comportement réel de Supabase Auth admin : la pagination par défaut est de
  // 50 comptes, createUser sur un email existant échoue, et signInWithPassword
  // échoue tant que le mot de passe de démo n'a pas été réinitialisé.
  let passwordReset = false;

  beforeEach(() => {
    passwordReset = false;
    process.env.QOE_API_URL = 'https://api.test';
    process.env.NODE_ENV = 'test';
    supabaseMock.adminListUsers.mockReset();
    supabaseMock.adminListUsers.mockImplementation(
      async (params?: { page?: number; perPage?: number }) => {
        const page = params?.page ?? 1;
        if (page === 2 && (params?.perPage ?? 0) >= 1000) {
          return { data: { users: [target] }, error: null };
        }
        return { data: { users: fullPage }, error: null };
      }
    );
    supabaseMock.signInWithPassword.mockImplementation(async () =>
      passwordReset
        ? { error: null, data: { user: { id: target.id } } }
        : { error: { message: 'Invalid login credentials' }, data: null }
    );
    supabaseMock.adminCreateUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'A user with this email already exists' },
    });
    supabaseMock.adminUpdateUserById.mockImplementation(async () => {
      passwordReset = true;
      return { data: {}, error: null };
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({ id: target.id, email: target.email, name: 'Target', username: 'target' })
      )
    );
  });

  it('trouve un compte au-delà de la première page Auth', async () => {
    const { impersonateLoginAction } = await import('../index');

    const result = await impersonateLoginAction('target@qoe.fi');

    // La base de démo contient 500+ comptes : sans pagination, l'impersonation
    // échouait pour tous ceux qui ne sont pas dans les 50 premiers.
    expect(result.success).toBe(true);
    expect(supabaseMock.adminUpdateUserById).toHaveBeenCalledWith(target.id, expect.anything());
  });

  it("réutilise l'existant quand un compte Auth du même email existe déjà", async () => {
    supabaseMock.adminListUsers.mockResolvedValue({ data: { users: [target] }, error: null });

    const { createMockUserAction } = await import('../index');
    const result = await createMockUserAction({
      name: 'Target',
      email: 'target@qoe.fi',
      username: 'target',
      subdomain: 'target',
      role: 'creator',
    });

    expect(result.success).toBe(true);
    expect(result.userId).toBe(target.id);
  });

  it('retombe sur un UUID déterministe quand Auth est injoignable, et le signale', async () => {
    supabaseMock.adminCreateUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid API key' },
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { createMockUserAction } = await import('../index');
    const result = await createMockUserAction({
      name: 'Ghost',
      email: 'ghost@qoe.fi',
      username: 'ghost',
      subdomain: 'ghost',
      role: 'creator',
    });

    // L'avertissement doit rester visible dans le panneau : sinon l'admin croit
    // avoir un compte Auth alors qu'il n'en existe aucun.
    expect(result.success).toBe(true);
    expect(result.authWarning).toContain('Invalid API key');
    expect(result.userId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("@qoe/devtools — contrat des actions avec l'API Go (L17)", () => {
  let fetchMock: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>;

  beforeEach(() => {
    process.env.QOE_API_URL = 'https://api.test';
    process.env.NODE_ENV = 'test';
    delete process.env.QOE_INTERNAL_SECRET;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () =>
      jsonResponse({})
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  function lastCall() {
    const call = fetchMock.mock.calls.at(-1);
    return {
      url: String(call?.[0]),
      method: call?.[1]?.method ?? 'GET',
      body: call?.[1]?.body ? JSON.parse(String(call?.[1].body)) : undefined,
    };
  }

  it('lit les données et normalise une liste absente', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ stats: { users: 3, articles: 0, posts: 0, likes: 0, subscribers: 0 } })
    );
    const { getDevtoolsData } = await import('../index');

    const result = await getDevtoolsData();

    expect(result).toEqual({
      success: true,
      users: [],
      stats: { users: 3, articles: 0, posts: 0, likes: 0, subscribers: 0 },
    });
    expect(lastCall()).toMatchObject({ url: 'https://api.test/v1/devtools/data', method: 'GET' });
  });

  it('mappe un 401 en consigne actionnable', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Authentification requise' }, false, 401));
    const { getDevtoolsData } = await import('../index');

    const result = await getDevtoolsData();

    expect(result.success).toBe(false);
    expect('error' in result && result.error).toContain('Non autorisé');
  });

  it('mappe un 403 en refus superadmin', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: 'Accès réservé au superadmin.' }, false, 403)
    );
    const { getDevtoolsData } = await import('../index');

    const result = await getDevtoolsData();

    expect('error' in result && result.error).toContain('superadmin');
  });

  it('encode le jobId de progression', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: 'job-1', done: false, steps: [], progress: 0 }));
    const { seedTopProgressAction } = await import('../index');

    const result = await seedTopProgressAction('a/b c');

    expect(result.success).toBe(true);
    expect(lastCall().url).toBe('https://api.test/v1/devtools/seed-top-progress/a%2Fb%20c');
  });

  it('transmet les corps attendus par le module Go', async () => {
    const devtools = await import('../index');
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 'job-2' }));
    expect((await devtools.seedTopCompleteAction()).jobId).toBe('job-2');
    expect(lastCall()).toMatchObject({
      url: 'https://api.test/v1/devtools/seed-top-complete',
      method: 'POST',
    });

    fetchMock.mockResolvedValueOnce(jsonResponse({ total: 10, upserted: 4 }));
    expect(await devtools.reindexAction()).toEqual({ success: true, total: 10, upserted: 4 });

    await devtools.resetOnboardingAction('a@b.c');
    expect(lastCall()).toMatchObject({
      url: 'https://api.test/v1/devtools/reset-onboarding',
      body: { target: 'a@b.c' },
    });

    await devtools.resetOnboardingAction();
    expect(lastCall().body).toEqual({ target: '' });

    await devtools.simulateSubscriberAction({ publisherId: 'p1', email: 'a@b.c', ltvCents: 500 });
    expect(lastCall()).toMatchObject({
      url: 'https://api.test/v1/devtools/simulate-subscriber',
      body: { publisherId: 'p1', email: 'a@b.c', isPremium: false, ltvCents: 500 },
    });

    await devtools.simulateFollowAction({ readerId: 'r1', publisherId: 'p1' });
    expect(lastCall().body).toEqual({ readerId: 'r1', publisherId: 'p1' });

    await devtools.simulateLikeAction({ postId: 'post1', userId: 'u1' });
    expect(lastCall().body).toEqual({ postId: 'post1', userId: 'u1' });

    fetchMock.mockResolvedValueOnce(jsonResponse({ balanceCents: 1500 }));
    expect(await devtools.addMockFundsAction({ userId: 'u1', amountCents: 500 })).toEqual({
      success: true,
      balanceCents: 1500,
    });
    expect(lastCall()).toMatchObject({
      url: 'https://api.test/v1/devtools/add-funds',
      body: { userId: 'u1', amountCents: 500 },
    });

    await devtools.getEmbeddingDiagnosticAction();
    expect(lastCall().url).toBe('https://api.test/v1/devtools/embedding-diagnostic');

    await devtools.resetDatabaseAction();
    expect(lastCall()).toMatchObject({
      url: 'https://api.test/v1/devtools/reset',
      method: 'POST',
    });
  });

  it("remonte l'échec Go de chaque action en succès=false", async () => {
    const devtools = await import('../index');
    const failing = [
      () => devtools.resetDatabaseAction(),
      () => devtools.reindexAction(),
      () => devtools.seedTopCompleteAction(),
      () => devtools.seedTopProgressAction('job'),
      () => devtools.resetOnboardingAction(),
      () => devtools.simulateSubscriberAction({ publisherId: 'p', email: 'a@b.c' }),
      () => devtools.simulateFollowAction({ readerId: 'r', publisherId: 'p' }),
      () => devtools.simulateLikeAction({ postId: 'p', userId: 'u' }),
      () => devtools.addMockFundsAction({ userId: 'u', amountCents: 1 }),
      () => devtools.getEmbeddingDiagnosticAction(),
    ];

    for (const action of failing) {
      fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Boom interne' }, false, 500));
      const result = (await action()) as { success: boolean; error?: string };
      expect(result.success).toBe(false);
      expect(result.error).toBe('Boom interne');
    }
  });

  it('déconnecte la session Supabase', async () => {
    const { logoutAction } = await import('../index');

    await expect(logoutAction()).resolves.toEqual({ success: true });
    expect(supabaseMock.signOut).toHaveBeenCalledTimes(1);
  });
});
