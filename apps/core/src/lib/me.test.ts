import { describe, it, expect, vi, beforeEach } from 'vitest';
import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { fetchMeProfile } from './me';
import type { MeProfile } from './cached-queries';

vi.mock('@qoe/sdk/actions/utils/go-client', () => ({
  goFetch: vi.fn(),
}));

const mockGoFetch = vi.mocked(goFetch);

const profile: MeProfile = {
  id: 'u1',
  email: 'alice@test.dev',
  name: 'Alice',
  username: 'alice',
  logoUrl: null,
  onboardingText: null,
  pronouns: null,
  role: 'user',
  walletBalanceCents: 0,
  hasCompletedOnboarding: false,
  createdAt: '2026-01-01T00:00:00Z',
  followsCount: 0,
  mutedWordsCount: 0,
};

const statusErr = (status: number) =>
  Object.assign(new Error('Utilisateur introuvable'), { status });

describe('fetchMeProfile', () => {
  beforeEach(() => mockGoFetch.mockReset());

  it('retourne le profil directement si /v1/me répond', async () => {
    mockGoFetch.mockResolvedValueOnce(profile);
    await expect(fetchMeProfile()).resolves.toBe(profile);
    expect(mockGoFetch).toHaveBeenCalledTimes(1);
  });

  it('`/v1/me` en 404 → auto-réparation : POST /v1/me/sync puis relit le profil', async () => {
    mockGoFetch
      .mockRejectedValueOnce(statusErr(404)) // GET /v1/me → ligne absente
      .mockResolvedValueOnce({ created: true }) // POST /v1/me/sync
      .mockResolvedValueOnce(profile); // GET /v1/me relu
    await expect(fetchMeProfile()).resolves.toBe(profile);
    expect(mockGoFetch.mock.calls.map((c) => [c[0], c[1]?.method])).toEqual([
      ['/v1/me', undefined],
      ['/v1/me/sync', 'POST'],
      ['/v1/me', undefined],
    ]);
  });

  it('propage les erreurs non-404 sans appeler /v1/me/sync', async () => {
    const err = new Error('Go API 500');
    mockGoFetch.mockRejectedValueOnce(err);
    await expect(fetchMeProfile()).rejects.toBe(err);
    expect(mockGoFetch).toHaveBeenCalledTimes(1);
  });
});
