// =====================================================================
// 🧪 Réglages — une panne n'est pas une déconnexion
// =====================================================================
// La page attrapait TOUTE erreur pour rediriger vers /login : un Go à 503
// déconnectait visuellement un utilisateur dont la session était valide.
// Seul un 401 (ou l'absence de session) justifie le retour au login.
// =====================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetSettings, mockGetUser, mockRedirect } = vi.hoisted(() => ({
  mockGetSettings: vi.fn(),
  mockGetUser: vi.fn(),
  mockRedirect: vi.fn(() => {
    throw new Error('NEXT_REDIRECT;replace;/login');
  }),
}));

vi.mock('next/navigation', () => ({ redirect: mockRedirect, notFound: vi.fn() }));
vi.mock('@qoe/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
}));
vi.mock('../actions', () => ({ getAccountSettingsAction: mockGetSettings }));
vi.mock('../SettingsPageClient', () => ({ default: () => null }));

import AccountSettingsRoute from '../page';

describe('page réglages — panne vs session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
  });

  it('ne redirige pas vers /login quand le backend est en panne', async () => {
    mockGetSettings.mockRejectedValue(Object.assign(new Error('Go API 503'), { status: 503 }));

    await expect(AccountSettingsRoute()).rejects.toThrow('Go API 503');
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('redirige vers /login sans session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    await expect(AccountSettingsRoute()).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/login?redirect=/settings');
  });

  it('redirige vers /login quand le backend répond 401', async () => {
    mockGetSettings.mockRejectedValue(Object.assign(new Error('session expirée'), { status: 401 }));

    await expect(AccountSettingsRoute()).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/login?redirect=/settings');
  });
});
