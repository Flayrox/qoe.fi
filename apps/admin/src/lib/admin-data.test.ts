// =====================================================================
// 🧪 admin-data — non-régression « items null » (crash This page couldn't load)
// =====================================================================
// Quand les tables SupportArticle/SubscriptionGrant sont vides, l'API Go
// renvoyait `{"items": null, "total": 0}` (slice non initialisée sérialisée
// en `null` par encoding/json). Le composant serveur admin crashe alors sur
// `data.items.filter(...)`. Ces tests verrouillent le contrat de la couche
// de données : TOUJOURS un tableau, jamais `null`.
// =====================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Les modules serveur / Next sont mockés : la couche de données est testée
// seule, sans requête réseau ni contexte Next.
vi.mock('@qoe/sdk/actions/utils/go-client', () => ({ goFetch: vi.fn() }));
vi.mock('@qoe/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@qoe/flags', () => ({ FLAGS: {} }));

import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import {
  getAdminSupportArticles,
  getAdminSubscriptionGrants,
  getAdminReports,
  getAdminAuditLog,
  getAdminLegalDocuments,
  getAdminLegalVersions,
  getAdminLegalAcceptances,
  getAdminLegalStats,
  getAdminLegalNotices,
} from './admin-data';

const mockGoFetch = vi.mocked(goFetch);

beforeEach(() => {
  mockGoFetch.mockReset();
});

describe('getAdminSupportArticles', () => {
  it('convertit items:null en tableau vide (table vide côté Go)', async () => {
    mockGoFetch.mockResolvedValue({ items: null, total: 0 });
    await expect(getAdminSupportArticles()).resolves.toEqual({ items: [], total: 0 });
  });

  it('garantit total:0 si l’API omet le compteur', async () => {
    mockGoFetch.mockResolvedValue({ items: null, total: null });
    await expect(getAdminSupportArticles()).resolves.toEqual({ items: [], total: 0 });
  });

  it('préserve les articles renvoyés', async () => {
    const article = {
      id: 'a1',
      slug: 'compte-perdu',
      titleFr: 'Compte perdu',
      titleEn: 'Lost account',
      bodyFr: 'Corps',
      bodyEn: 'Body',
      position: 1,
      published: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    };
    mockGoFetch.mockResolvedValue({ items: [article], total: 1 });
    await expect(getAdminSupportArticles()).resolves.toEqual({ items: [article], total: 1 });
  });

  it('retombe sur un tableau vide si l’API échoue', async () => {
    mockGoFetch.mockRejectedValue(new Error('go indisponible'));
    await expect(getAdminSupportArticles()).resolves.toEqual({ items: [], total: 0 });
  });
});

describe('getAdminSubscriptionGrants', () => {
  it('convertit items:null en tableau vide (table vide côté Go)', async () => {
    mockGoFetch.mockResolvedValue({ items: null, total: 0 });
    await expect(getAdminSubscriptionGrants()).resolves.toEqual({ items: [], total: 0 });
  });

  it('préserve les octrois renvoyés', async () => {
    const grant = {
      id: 'g1',
      subjectType: 'publication' as const,
      subjectId: 'pub_1',
      plan: 'pro' as const,
      startsAt: '2026-01-01T00:00:00Z',
      endsAt: null,
      grantedBy: 'staff',
      note: 'presse',
      createdAt: '2026-01-01T00:00:00Z',
      effective: true,
    };
    mockGoFetch.mockResolvedValue({ items: [grant], total: 1 });
    await expect(getAdminSubscriptionGrants()).resolves.toEqual({ items: [grant], total: 1 });
  });

  it('retombe sur un tableau vide si l’API échoue', async () => {
    mockGoFetch.mockRejectedValue(new Error('go indisponible'));
    await expect(getAdminSubscriptionGrants()).resolves.toEqual({ items: [], total: 0 });
  });
});

describe('getAdminReports', () => {
  it('convertit items:null en tableau vide, pending:null en 0', async () => {
    mockGoFetch.mockResolvedValue({ items: null, pending: null });
    await expect(getAdminReports()).resolves.toEqual({ items: [], pending: 0 });
  });

  it('passe le filtre de statut en query string', async () => {
    mockGoFetch.mockResolvedValue({ items: [], pending: 0 });
    await getAdminReports('pending');
    expect(mockGoFetch).toHaveBeenCalledWith('/v1/admin/reports?status=pending');
  });

  it('omet le filtre pour « all »', async () => {
    mockGoFetch.mockResolvedValue({ items: [], pending: 0 });
    await getAdminReports('all');
    expect(mockGoFetch).toHaveBeenCalledWith('/v1/admin/reports');
  });
});

describe('fetchers `{ items }` — jamais null', () => {
  it('getAdminAuditLog', async () => {
    mockGoFetch.mockResolvedValue({ items: null });
    await expect(getAdminAuditLog()).resolves.toEqual([]);
  });

  it('getAdminLegalDocuments', async () => {
    mockGoFetch.mockResolvedValue({ items: null });
    await expect(getAdminLegalDocuments()).resolves.toEqual([]);
  });

  it('getAdminLegalVersions', async () => {
    mockGoFetch.mockResolvedValue({ items: null });
    await expect(getAdminLegalVersions('doc-1')).resolves.toEqual([]);
  });

  it('getAdminLegalAcceptances', async () => {
    mockGoFetch.mockResolvedValue({ items: null });
    await expect(getAdminLegalAcceptances()).resolves.toEqual([]);
  });

  it('getAdminLegalStats', async () => {
    mockGoFetch.mockResolvedValue({ items: null });
    await expect(getAdminLegalStats()).resolves.toEqual([]);
  });

  it('getAdminLegalNotices', async () => {
    mockGoFetch.mockResolvedValue({ items: null });
    await expect(getAdminLegalNotices()).resolves.toEqual([]);
  });
});
