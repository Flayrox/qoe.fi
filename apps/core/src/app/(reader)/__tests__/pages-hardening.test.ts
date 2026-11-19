/**
 * L20b2b1 — résilience des pages lecteur hors foyer.
 *
 * Ces pages appellent Go (lecture, facturation, onboarding, consentements) :
 * une panne du backend ne doit pas transformer la page en 500. Les composants
 * serveur sont appelés directement (pas de rendu React) : on prouve le
 * comportement de chargement, pas le HTML.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error('NOT_FOUND');
  }),
  createClient: vi.fn(),
  goFetch: vi.fn(),
  fetchMeProfile: vi.fn(),
  fetchPendingAcceptances: vi.fn(),
  getPostThreadAction: vi.fn(),
  getRequestDbUser: vi.fn(),
  getLanguage: vi.fn(async () => 'fr'),
  getStudioAppUrl: vi.fn(() => 'https://studio.qoe.test'),
  headers: vi.fn(async () => new Headers({ host: 'qoe.test' })),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
vi.mock('next/headers', () => ({ headers: mocks.headers }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/link', () => ({ default: () => null }));
vi.mock('@qoe/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@qoe/sdk/actions/utils/go-client', () => ({ goFetch: mocks.goFetch }));
vi.mock('@/lib/me', () => ({ fetchMeProfile: mocks.fetchMeProfile }));
vi.mock('@/lib/cached-queries', () => ({ getRequestDbUser: mocks.getRequestDbUser }));
vi.mock('@qoe/sdk/actions/legal', () => ({
  fetchPendingAcceptances: mocks.fetchPendingAcceptances,
  fetchLegalDocumentsToAccept: vi.fn(async () => []),
}));
vi.mock('@qoe/sdk/actions/feed', () => ({ getPostThreadAction: mocks.getPostThreadAction }));
vi.mock('@qoe/i18n/server', () => ({
  getLanguage: mocks.getLanguage,
  initI18n: mocks.getLanguage,
  getStaticTranslations: vi.fn(async () => ({ loadTranslations: async () => ({}) })),
}));
vi.mock('@qoe/config', () => ({
  getStudioAppUrl: mocks.getStudioAppUrl,
  URLS: { LANDING: 'https://hi.qoe.test' },
}));
vi.mock('@qoe/config/routes', () => ({
  routes: {
    feed: {
      home: () => '/home',
      thought: (handle: string, id: string) => `/${handle}/thought/${id}`,
      profile: (handle: string) => `/${handle}`,
    },
  },
  getArticleUrl: () => '/article',
}));

// Les composants d'interface ne sont pas le sujet : on les remplace pour que
// les modules serveur s'importent sans DOM ni CSS.
vi.mock('@qoe/ui', () => ({
  SafeImage: () => null,
  LegalConsentGate: () => null,
  ExitInterstitialProvider: () => null,
  ExternalLinkInterceptor: () => null,
  OnboardingFlow: () => null,
  NotFoundView: () => null,
  SafeAvatar: () => null,
}));
vi.mock('@qoe/ui/toast', () => ({ Toaster: () => null, toast: { info: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/layout/AppSidebar', () => ({ AppSidebar: () => null }));
vi.mock('@/components/layout/ReaderNavOverlay', () => ({ ReaderNavOverlay: () => null }));
vi.mock('@/components/layout/MainContentWrapper', () => ({
  MainContentWrapper: () => null,
}));
vi.mock('@/components/article-overlay/ArticleOverlayProvider', () => ({
  ArticleOverlayProvider: () => null,
}));
vi.mock('@/components/thought-overlay/ThoughtOverlayProvider', () => ({
  ThoughtOverlayProvider: () => null,
}));
vi.mock('@/features/upcoming/provider', () => ({ FeatureAnnouncements: () => null }));
vi.mock('@/components/banners/DynamicBannerSlot', () => ({ DynamicBannerSlot: () => null }));
vi.mock('@/app/login/actions', () => ({ logout: vi.fn() }));

function authedClient(user: Record<string, unknown> = { id: 'usr_1', email: 'alice@qoe.fi' }) {
  return { auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) } };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getLanguage.mockResolvedValue('fr');
});

describe('page /thought/[...slug] (L20b2b1)', () => {
  it('ne re-décode pas un segment déjà décodé par Next', async () => {
    mocks.getPostThreadAction.mockResolvedValue({
      ok: true,
      data: { post: { id: 'abc%def', content: 'Salut', author: { username: 'camille' } } },
    });
    const { default: ThoughtCatchAllPage } = await import('../thought/[...slug]/page');

    // Un identifiant contenant « % » est déjà décodé par Next : le redécoder
    // lève « URI malformed » et casse la redirection vers le fil.
    await expect(
      ThoughtCatchAllPage({ params: Promise.resolve({ slug: ['abc%def'] }) })
    ).rejects.toThrow('REDIRECT:/camille/thought/abc%def');
  });
});

describe('page /history (L20b2b1)', () => {
  it("affiche l'état vide quand l'historique Go est indisponible", async () => {
    mocks.createClient.mockResolvedValue(authedClient());
    mocks.goFetch.mockRejectedValue(new Error('Go API 503'));
    const { default: ReadingHistoryPage } = await import('../history/page');

    await expect(ReadingHistoryPage()).resolves.toBeTruthy();
  });
});

describe('page /billing (L20b2b1)', () => {
  it('rend un portefeuille vide plutôt qu’une erreur 500 quand Go tombe', async () => {
    mocks.createClient.mockResolvedValue(authedClient());
    mocks.goFetch.mockRejectedValue(new Error('Go API 503'));
    const { default: BillingPage } = await import('../billing/page');

    await expect(BillingPage()).resolves.toBeTruthy();
  });
});

describe('page /onboarding (L20b2b1)', () => {
  it('reste accessible quand le profil Go est indisponible', async () => {
    mocks.createClient.mockResolvedValue(authedClient());
    mocks.fetchMeProfile.mockRejectedValue(new Error('Go API 503'));
    mocks.goFetch.mockResolvedValue({ categories: [], suggestedCreators: [] });
    const { default: OnboardingPage } = await import('../onboarding/page');

    await expect(OnboardingPage()).resolves.toBeTruthy();
  });

  it('affiche le parcours avec des listes vides si les suggestions Go manquent', async () => {
    mocks.createClient.mockResolvedValue(authedClient());
    mocks.fetchMeProfile.mockResolvedValue({ hasCompletedOnboarding: false });
    mocks.goFetch.mockRejectedValue(new Error('Go API 503'));
    const { default: OnboardingPage } = await import('../onboarding/page');

    await expect(OnboardingPage()).resolves.toBeTruthy();
  });
});

describe('layout (reader) (L20b2b1)', () => {
  it('rend la coquille même si les consentements légaux sont indisponibles', async () => {
    mocks.createClient.mockResolvedValue(authedClient());
    mocks.getRequestDbUser.mockResolvedValue(null);
    mocks.fetchPendingAcceptances.mockRejectedValue(new Error('Go API 503'));
    const { default: MainLayout } = await import('../layout');

    await expect(MainLayout({ children: null })).resolves.toBeTruthy();
  });
});
