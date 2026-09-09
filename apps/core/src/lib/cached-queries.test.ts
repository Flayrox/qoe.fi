import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getRequestDbUser,
  getCachedSystemConfig,
  getCachedTrends,
  getCachedPromos,
} from './cached-queries';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { fetchMeProfile } from './me';

vi.mock('@qoe/sdk/actions/utils/go-client', () => ({
  goFetch: vi.fn(),
}));

vi.mock('./me', () => ({
  fetchMeProfile: vi.fn(),
}));

describe('cached-queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getRequestDbUser', () => {
    it('récupère le profil lecteur et projette les champs attendus', async () => {
      const mockProfile = {
        id: 'u-123',
        email: 'lecteur@qoe.fi',
        name: 'Camille Dubois',
        username: 'camille',
        logoUrl: 'https://cdn.qoe.fi/avatar.jpg',
        onboardingText: 'Passionné de philosophie et tech.',
        pronouns: 'iel',
        role: 'user',
        walletBalanceCents: 2500,
        hasCompletedOnboarding: true,
        createdAt: '2026-01-01T00:00:00Z',
        followsCount: 15,
        mutedWordsCount: 2,
      };

      vi.mocked(fetchMeProfile).mockResolvedValueOnce(
        mockProfile as unknown as Awaited<ReturnType<typeof fetchMeProfile>>
      );

      const user = await getRequestDbUser('u-123');

      expect(user).toEqual({
        id: 'u-123',
        name: 'Camille Dubois',
        email: 'lecteur@qoe.fi',
        role: 'user',
        logoUrl: 'https://cdn.qoe.fi/avatar.jpg',
        username: 'camille',
        walletBalanceCents: 2500,
        onboardingText: 'Passionné de philosophie et tech.',
        hasCompletedOnboarding: true,
      });
      expect(fetchMeProfile).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCachedSystemConfig', () => {
    it('appelle le endpoint /v1/home/config', async () => {
      const mockConfig = { maintenance: 'false', banner: 'Bienvenue sur Qoe' };
      vi.mocked(goFetch).mockResolvedValueOnce(mockConfig);

      const config = await getCachedSystemConfig();
      expect(config).toEqual(mockConfig);
      expect(goFetch).toHaveBeenCalledWith('/v1/home/config');
    });
  });

  describe('getCachedTrends', () => {
    it('appelle /v1/home/trends?limit=5', async () => {
      const mockTrends = [
        { id: 't1', hashtag: '#philosophie', count: 42 },
        { id: 't2', hashtag: '#ia2026', count: 38 },
      ];
      vi.mocked(goFetch).mockResolvedValueOnce(mockTrends);

      const trends = await getCachedTrends();
      expect(trends).toEqual(mockTrends);
      expect(goFetch).toHaveBeenCalledWith('/v1/home/trends?limit=5');
    });
  });

  describe('getCachedPromos', () => {
    it('appelle /v1/home/promos?limit=3', async () => {
      const mockPromos = [
        {
          id: 'p1',
          title: 'Abonnement Annuel',
          description: 'Profitez de 2 mois offerts.',
          ctaText: 'Découvrir',
          ctaUrl: '/billing',
          imageUrl: null,
          isActive: true,
        },
      ];
      vi.mocked(goFetch).mockResolvedValueOnce(mockPromos);

      const promos = await getCachedPromos();
      expect(promos).toEqual(mockPromos);
      expect(goFetch).toHaveBeenCalledWith('/v1/home/promos?limit=3');
    });
  });
});
