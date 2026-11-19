import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  createClient: vi.fn(),
  fetchMeProfile: vi.fn(),
  goFetch: vi.fn(),
  logoutAction: vi.fn(),
  getCurrentUserAction: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@qoe/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/me', () => ({ fetchMeProfile: mocks.fetchMeProfile }));
vi.mock('@qoe/sdk/actions/utils/go-client', () => ({ goFetch: mocks.goFetch }));
vi.mock('@qoe/sdk/actions/auth', () => ({
  logoutAction: mocks.logoutAction,
  getCurrentUserAction: mocks.getCurrentUserAction,
}));

function supabaseWithSession(overrides: Record<string, unknown> = {}) {
  return {
    auth: {
      exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'usr_1' } } }),
      getSession: vi.fn().mockResolvedValue({
        data: { session: { access_token: 'access-token', refresh_token: 'refresh-token' } },
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      ...overrides,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.QOE_API_URL = 'https://api.test/';
});

describe('GET /auth/callback (L20b2a)', () => {
  it('synchronise le compte par le client Go unique (timeout + URL normalisée)', async () => {
    mocks.createClient.mockResolvedValue(supabaseWithSession());
    mocks.goFetch.mockResolvedValue({ needsOnboarding: false });
    const { GET } = await import('../auth/callback/route');

    const res = await GET(new Request('http://localhost/auth/callback?code=abc'));

    expect(mocks.goFetch).toHaveBeenCalledWith('/v1/me/sync', { method: 'POST' });
    expect(res.headers.get('location')).toBe('http://localhost/home');
  });

  it('coupe la session et explique le refus quand Go ferme les inscriptions (403)', async () => {
    const supabase = supabaseWithSession();
    mocks.createClient.mockResolvedValue(supabase);
    mocks.goFetch.mockRejectedValue(
      Object.assign(new Error('Inscriptions fermées pour le moment.'), { status: 403 })
    );
    const { GET } = await import('../auth/callback/route');

    const res = await GET(new Request('http://localhost/auth/callback?code=abc'));

    expect(supabase.auth.signOut).toHaveBeenCalled();
    const location = res.headers.get('location') ?? '';
    expect(location).toContain('/login?error=');
    expect(decodeURIComponent(location)).toContain('Inscriptions fermées');
  });

  it("n'oriente vers l'onboarding que si Go le demande", async () => {
    mocks.createClient.mockResolvedValue(supabaseWithSession());
    mocks.goFetch.mockResolvedValue({ needsOnboarding: true });
    const { GET } = await import('../auth/callback/route');

    const res = await GET(new Request('http://localhost/auth/callback?code=abc&next=/library'));

    expect(res.headers.get('location')).toBe('http://localhost/onboarding');
  });
});

describe('login (L20b2a)', () => {
  it("laisse entrer l'utilisateur quand le profil Go est indisponible", async () => {
    mocks.createClient.mockResolvedValue({
      auth: {
        signInWithPassword: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: 'usr_1' } }, error: null }),
      },
    });
    mocks.fetchMeProfile.mockRejectedValue(new Error('Go API 503'));
    const { login } = await import('../login/actions');

    const fd = new FormData();
    fd.set('email', 'alice@qoe.fi');
    fd.set('password', 'secret123');

    // Le profil n'est qu'une heuristique d'onboarding : sa panne ne doit pas
    // transformer une connexion valide en erreur 500.
    await expect(login(fd)).rejects.toThrow('REDIRECT:/home');
  });
});

describe('signup (L20b2a)', () => {
  function signupForm() {
    const fd = new FormData();
    fd.set('email', 'valid.user@gmail.com');
    fd.set('password', 'SecurePassword123!');
    fd.set('name', 'John Doe');
    fd.set('username', 'johndoe2026');
    return fd;
  }

  it('pré-contrôle les inscriptions par le client Go unique', async () => {
    mocks.goFetch.mockResolvedValue({ open: true, allowed: false });
    mocks.createClient.mockResolvedValue({
      auth: { signUp: vi.fn().mockResolvedValue({ data: { user: { id: 'usr_1' } } }) },
    });
    const { signup } = await import('../login/actions');

    await expect(signup(signupForm())).rejects.toThrow('REDIRECT:/onboarding');
    expect(mocks.goFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/auth/registration-status?email=')
    );
  });

  it("refuse l'inscription fermée sans créer de compte Auth", async () => {
    mocks.goFetch.mockResolvedValue({ open: false, allowed: false });
    const signUp = vi.fn().mockResolvedValue({ data: { user: { id: 'usr_1' } }, error: null });
    mocks.createClient.mockResolvedValue({ auth: { signUp } });
    const { signup } = await import('../login/actions');

    await expect(signup(signupForm())).rejects.toThrow(/REDIRECT:\/login\?error=/);
    expect(signUp).not.toHaveBeenCalled();
  });
});
