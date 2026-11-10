import { describe, it, expect, vi, beforeEach } from 'vitest';

const goFetch = vi.fn();

vi.mock('../actions/utils/go-client', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../actions/utils/go-client');
  return {
    ...actual,
    goFetch: (...args: unknown[]) => goFetch(...args),
  };
});

import {
  recordFeatureSignalAction,
  getFeatureCatalogAction,
  unsubscribeFeatureAction,
  getMyFeatureNotificationsAction,
} from '../actions/features';

type Call = [path: string, init?: { method?: string; body?: unknown }];

function calls(): Call[] {
  return goFetch.mock.calls as unknown as Call[];
}

beforeEach(() => {
  goFetch.mockReset();
  goFetch.mockResolvedValue({});
});

describe('📡 actions/features — Contrat serveur', () => {
  it('toutes les fonctions exportées sont asynchrones', () => {
    expect(recordFeatureSignalAction.constructor.name).toBe('AsyncFunction');
    expect(getFeatureCatalogAction.constructor.name).toBe('AsyncFunction');
    expect(unsubscribeFeatureAction.constructor.name).toBe('AsyncFunction');
    expect(getMyFeatureNotificationsAction.constructor.name).toBe('AsyncFunction');
  });

  describe('recordFeatureSignalAction', () => {
    it('enregistre un signal notify avec source studio par défaut', async () => {
      goFetch.mockResolvedValue({ success: true, notified: true });
      const res = await recordFeatureSignalAction('custom-domain', 'notify');
      expect(calls()[0][0]).toBe('/v1/features/signals');
      expect(calls()[0][1]).toEqual({
        method: 'POST',
        body: {
          feature: 'custom-domain',
          kind: 'notify',
          source: 'studio',
        },
      });
      expect(res).toEqual({ success: true, notified: true });
    });

    it('enregistre un signal view avec source et publisherId personnalisés', async () => {
      goFetch.mockResolvedValue({ success: true, notified: false });
      const res = await recordFeatureSignalAction('monetization', 'view', 'site', 'pub_123');
      expect(calls()[0][0]).toBe('/v1/features/signals');
      expect(calls()[0][1]).toEqual({
        method: 'POST',
        body: {
          feature: 'monetization',
          kind: 'view',
          source: 'site',
          publisherId: 'pub_123',
        },
      });
      expect(res).toEqual({ success: true, notified: false });
    });

    it('ignore silencieusement les erreurs pour kind=view', async () => {
      goFetch.mockRejectedValue(new Error('Network error'));
      const res = await recordFeatureSignalAction('broken-feature', 'view');
      expect(res).toEqual({ success: false, notified: false });
    });

    it('propage l’erreur pour kind=notify', async () => {
      goFetch.mockRejectedValue(new Error('Backend error'));
      await expect(recordFeatureSignalAction('broken-feature', 'notify')).rejects.toThrow(
        'Backend error'
      );
    });
  });

  describe('getFeatureCatalogAction', () => {
    it('renvoie les features reçues de l’API', async () => {
      const mockFeatures = [
        { key: 'custom-domain', status: 'available', notifyEnabled: true, notified: false },
      ];
      goFetch.mockResolvedValue({ features: mockFeatures });
      const res = await getFeatureCatalogAction();
      expect(calls()[0][0]).toBe('/v1/features/catalog');
      expect(res).toEqual(mockFeatures);
    });

    it('retourne un tableau vide en cas d’erreur', async () => {
      goFetch.mockRejectedValue(new Error('Catalog unavailable'));
      const res = await getFeatureCatalogAction();
      expect(res).toEqual([]);
    });
  });

  describe('unsubscribeFeatureAction', () => {
    it('appelle l’endpoint de désabonnement et retourne success: true', async () => {
      goFetch.mockResolvedValue({ success: true });
      const res = await unsubscribeFeatureAction('custom-domain');
      expect(calls()[0][0]).toBe('/v1/features/interests/unsubscribe');
      expect(calls()[0][1]).toEqual({
        method: 'POST',
        body: { feature: 'custom-domain' },
      });
      expect(res).toEqual({ success: true });
    });
  });

  describe('getMyFeatureNotificationsAction', () => {
    it('renvoie les notifications enregistrées pour l’utilisateur', async () => {
      goFetch.mockResolvedValue({ features: ['custom-domain', 'monetization'] });
      const res = await getMyFeatureNotificationsAction();
      expect(calls()[0][0]).toBe('/v1/features/signals/state');
      expect(res).toEqual(['custom-domain', 'monetization']);
    });

    it('retourne un tableau vide en cas d’erreur', async () => {
      goFetch.mockRejectedValue(new Error('API unavailable'));
      const res = await getMyFeatureNotificationsAction();
      expect(res).toEqual([]);
    });
  });
});
