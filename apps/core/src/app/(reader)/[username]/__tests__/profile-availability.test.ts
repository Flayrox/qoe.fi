// =====================================================================
// 🧪 Profil — un 404 Go ne doit pas se confondre avec une panne
// =====================================================================
// `safeAction` réserve `error.code === 'NOT_FOUND'` au vrai 404 du backend
// (cf. packages/sdk/src/actions/utils/safe-action.ts). Les trois pages du
// profil appelaient `notFound()` sur n'importe quel échec : une panne Go
// devenait « profil introuvable » et un 404 pour les moteurs de recherche.
// =====================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockResolveProfile, mockGetPostThread } = vi.hoisted(() => ({
  mockResolveProfile: vi.fn(),
  mockGetPostThread: vi.fn(),
}));

// `notFound()` lève une exception de contrôle dans Next (NEXT_HTTP_ERROR_FALLBACK) :
// on la reproduit pour distinguer un vrai 404 d'une panne.
vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_HTTP_ERROR_FALLBACK;404');
  }),
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
}));
vi.mock('@qoe/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}));
vi.mock('@qoe/sdk/actions/utils/go-client', () => ({ goFetch: vi.fn() }));
vi.mock('@qoe/sdk/actions/feed', () => ({
  resolveProfileAction: mockResolveProfile,
  getPostThreadAction: mockGetPostThread,
}));
vi.mock('@qoe/ui', () => ({
  JsonLd: () => null,
  buildPersonSchema: () => ({}),
}));
vi.mock('@qoe/i18n/server', () => ({ getLanguage: async () => 'fr' }));
vi.mock('@/lib/cached-queries', () => ({ getRequestDbUser: vi.fn() }));
vi.mock('@/components/layout/ReaderPageLayout', () => ({
  ReaderPageLayout: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/app/(reader)/home/components/ThoughtThreadView', () => ({
  ThoughtThreadView: () => null,
}));
vi.mock('../components/ProfileView', () => ({ ProfileView: () => null }));

import * as navigation from 'next/navigation';
import UserProfilePage from '../page';
import UserProfileTabPage from '../[tab]/page';
import ThoughtPage from '../thought/[id]/page';

const OUTAGE = { ok: false as const, error: { code: 'INTERNAL_ERROR', message: 'Go API 503' } };

describe('pages profil — panne Go vs 404 réel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ne transforme pas une panne Go en 404 sur /:username', async () => {
    mockResolveProfile.mockResolvedValue(OUTAGE);

    await expect(
      UserProfilePage({ params: Promise.resolve({ username: 'auteur' }) })
    ).rejects.toThrow('Go API 503');
    expect(navigation.notFound).not.toHaveBeenCalled();
  });

  it('ne transforme pas une panne Go en 404 sur /:username/:tab', async () => {
    mockResolveProfile.mockResolvedValue(OUTAGE);

    await expect(
      UserProfileTabPage({ params: Promise.resolve({ username: 'auteur', tab: 'thoughts' }) })
    ).rejects.toThrow('Go API 503');
    expect(navigation.notFound).not.toHaveBeenCalled();
  });

  it('ne transforme pas une panne Go en 404 sur /:username/thought/:id', async () => {
    mockGetPostThread.mockResolvedValue(OUTAGE);

    await expect(
      ThoughtPage({ params: Promise.resolve({ username: 'auteur', id: 'post-1' }) })
    ).rejects.toThrow('Go API 503');
    expect(navigation.notFound).not.toHaveBeenCalled();
  });

  it('conserve le 404 quand le backend dit vraiment NOT_FOUND', async () => {
    mockResolveProfile.mockResolvedValue({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'profil inconnu' },
    });

    await expect(
      UserProfilePage({ params: Promise.resolve({ username: 'fantome' }) })
    ).rejects.toThrow('NEXT_HTTP_ERROR_FALLBACK');
    expect(navigation.notFound).toHaveBeenCalled();
  });
});
