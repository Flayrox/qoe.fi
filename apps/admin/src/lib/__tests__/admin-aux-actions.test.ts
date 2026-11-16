// =====================================================================
// 🧪 admin-aux-actions — normalisation, validation, refus explicable
// =====================================================================
// Ces actions écrivent la configuration de la plateforme (flags, domaines
// réservés, coupure API, annonces). Un échec doit toujours revenir comme un
// résultat — jamais comme une promesse rejetée — sinon l'écran n'affiche rien.
// =====================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  goFetch: vi.fn(),
  revalidatePath: vi.fn(),
  assertCapability: vi.fn(),
}));

vi.mock('@qoe/sdk/actions/utils/go-client', () => ({ goFetch: mocks.goFetch }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@/lib/admin-identity', () => ({ assertCapability: mocks.assertCapability }));

import {
  addAllowlistAction,
  addTrend,
  deleteTrend,
  getGlobalAnnouncementAction,
  retryAllFailedDeliveriesAction,
  saveApiDisabledEndpointsAction,
  saveMultipleFrontendConfigs,
  savePromo,
  setSystemConfigAction,
  toggleFeaturedArticle,
} from '../admin-aux-actions';

/** Le garde appelle `/v1/admin/dashboard` : on le fait réussir par défaut. */
function routeGuardToSuccess() {
  mocks.goFetch.mockImplementation((url: string) => {
    if (url === '/v1/admin/dashboard') return Promise.resolve({ ok: true });
    return Promise.resolve({});
  });
}

describe('admin-aux-actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    routeGuardToSuccess();
    mocks.assertCapability.mockResolvedValue(undefined);
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('préfixe un hashtag sans « # » et refuse un hashtag vide', async () => {
    await addTrend('  silence  ', 12);
    expect(mocks.goFetch).toHaveBeenCalledWith('/v1/admin/widgets/trends', {
      method: 'POST',
      body: { hashtag: '#silence', count: 12 },
    });

    mocks.goFetch.mockClear();
    const res = await addTrend('#', 1);
    expect(res).toEqual({ success: false, error: 'Hashtag invalide' });
    // Seul l'appel du garde a lieu, aucune écriture.
    expect(mocks.goFetch).not.toHaveBeenCalledWith('/v1/admin/widgets/trends', expect.anything());
  });

  it('rend un échec explicable quand le garde refuse, avec son code', async () => {
    mocks.goFetch.mockImplementation((url: string) => {
      if (url === '/v1/admin/dashboard') {
        return Promise.reject(
          Object.assign(new Error('forbidden'), {
            status: 403,
            code: 'deny_missing_capability',
            level: 'N2',
          })
        );
      }
      return Promise.resolve({});
    });

    const res = await toggleFeaturedArticle('art_1');

    expect(res).toMatchObject({
      success: false,
      error: 'Forbidden',
      code: 'deny_missing_capability',
      level: 'N2',
    });
    expect(mocks.goFetch).not.toHaveBeenCalledWith('/v1/admin/widgets/featured', expect.anything());
  });

  it('exige un titre et une description pour une promo', async () => {
    const res = await savePromo(null, '  ', 'desc', null, null, true);

    expect(res).toEqual({ success: false, error: 'Titre et description requis' });
    expect(mocks.goFetch).toHaveBeenCalledTimes(1); // garde uniquement
  });

  it('normalise la clé de configuration (majuscules, sans espaces)', async () => {
    await setSystemConfigAction({ key: '  api_base_url ', value: ' https://api.qoe.fi ' });

    expect(mocks.goFetch).toHaveBeenLastCalledWith('/v1/admin/config', {
      method: 'PUT',
      body: [{ key: 'API_BASE_URL', value: 'https://api.qoe.fi', description: null }],
    });
  });

  it('refuse une invitation sans adresse valide', async () => {
    const res = await addAllowlistAction('pas-un-email');

    expect(res).toEqual({ success: false, error: 'Email invalide' });
    expect(mocks.goFetch).not.toHaveBeenCalledWith(
      '/v1/admin/registrations/allowlist',
      expect.anything()
    );
  });

  it('nettoie la liste des endpoints coupés (préfixes, doublons)', async () => {
    const res = await saveApiDisabledEndpointsAction([
      ' /v1/articles ',
      'v1/articles',
      '/v1/articles',
      '/v1/admin',
    ]);

    expect(res).toMatchObject({ success: true, patterns: ['/v1/articles', '/v1/admin'] });
    expect(mocks.goFetch).toHaveBeenLastCalledWith('/v1/admin/config', {
      method: 'PUT',
      body: expect.objectContaining({
        key: 'API_DISABLED_ENDPOINTS',
        value: JSON.stringify(['/v1/articles', '/v1/admin']),
      }),
    });
  });

  it('rejette un JSON invalide sans rien écrire, avec un message localisé', async () => {
    const res = await saveMultipleFrontendConfigs({
      hero_reader_items_fr: { value: '[{ "type": ' },
      footer_baseline: { value: 'Une phrase libre' },
    });

    expect(res).toEqual(
      expect.objectContaining({
        success: false,
        error: expect.stringContaining('hero_reader_items_fr'),
      })
    );
    expect(mocks.goFetch).toHaveBeenCalledTimes(1); // garde uniquement
  });

  it('enregistre plusieurs configs valides en un seul appel', async () => {
    const res = await saveMultipleFrontendConfigs({
      hero_reader_items_fr: { value: '[{"type":"title","text":"Silence"}]' },
      footer_sections_fr: { value: '[]', description: 'Pied de page' },
    });

    expect(res).toEqual({ success: true });
    expect(mocks.goFetch).toHaveBeenLastCalledWith('/v1/admin/config', {
      method: 'PUT',
      body: [
        {
          key: 'hero_reader_items_fr',
          value: '[{"type":"title","text":"Silence"}]',
          description: null,
        },
        { key: 'footer_sections_fr', value: '[]', description: 'Pied de page' },
      ],
    });
  });

  it('relance l’outbox avec une raison par défaut et sans canal', async () => {
    mocks.goFetch.mockImplementation((url: string) => {
      if (url === '/v1/admin/dashboard') return Promise.resolve({});
      if (url === '/v1/admin/outbox/retry-all') {
        return Promise.resolve({ success: true, retriedCount: 4 });
      }
      return Promise.resolve({});
    });

    const res = await retryAllFailedDeliveriesAction('   ');

    expect(res).toEqual({ success: true, retriedCount: 4 });
    expect(mocks.assertCapability).toHaveBeenCalledWith('admin.deliveries.retry');
    expect(mocks.goFetch).toHaveBeenCalledWith('/v1/admin/outbox/retry-all', {
      method: 'POST',
      body: { reason: 'Relance manuelle globale', channel: undefined },
    });
  });

  it('remonte un compteur à zéro si le serveur ne le fournit pas', async () => {
    mocks.goFetch.mockImplementation((url: string) => {
      if (url === '/v1/admin/dashboard') return Promise.resolve({});
      if (url === '/v1/admin/outbox/retry-all') return Promise.resolve({ success: true });
      return Promise.resolve({});
    });

    expect(await retryAllFailedDeliveriesAction()).toEqual({ success: true, retriedCount: 0 });
  });

  it('échappe l’identifiant dans le chemin de suppression', async () => {
    await deleteTrend('trend/1');

    expect(mocks.goFetch).toHaveBeenLastCalledWith('/v1/admin/widgets/trends/trend%2F1', {
      method: 'DELETE',
    });
  });

  it('rend null quand l’annonce globale est illisible', async () => {
    mocks.goFetch.mockImplementation((url: string) => {
      if (url === '/v1/admin/dashboard') return Promise.resolve({});
      return Promise.reject(new Error('503'));
    });

    expect(await getGlobalAnnouncementAction()).toBeNull();
  });
});
