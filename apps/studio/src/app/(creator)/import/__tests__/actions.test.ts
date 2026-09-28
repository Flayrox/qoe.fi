import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  goFetch: vi.fn(),
  getActivePublicationId: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('@qoe/supabase/server', () => ({
  createClient: () => ({
    auth: {
      getUser: mocks.getUser,
    },
  }),
}));

vi.mock('@qoe/sdk/actions/utils/go-client', () => ({
  goFetch: mocks.goFetch,
}));

vi.mock('@/lib/active-workspace', () => ({
  getActivePublicationId: mocks.getActivePublicationId,
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import {
  importSubscribersCsvAction,
  importRssFeedAction,
  type SubscriberImportOptions,
} from '../actions';

// Déclarations complètes : prérequis du dépôt, revérifié côté serveur Go.
const DECLARATIONS: SubscriberImportOptions['declarations'] = {
  noPurchased: true,
  noScraped: true,
  noUnsubscribed: true,
  suppressionListIdentified: true,
  consentPurpose: 'recevoir la newsletter hebdomadaire',
};

const OPTIONS: SubscriberImportOptions = { source: 'substack', declarations: DECLARATIONS };

describe('importSubscribersCsvAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'u_creator_1', email: 'creator@qoe.fi' } },
    });
    mocks.getActivePublicationId.mockResolvedValue('pub_test_123');
    mocks.goFetch.mockResolvedValue({
      id: 'batch_1',
      status: 'submitted',
      stats: { received: 3, valid: 3, invalid: 0, duplicates: 1, pendingConfirmation: 2 },
    });
  });

  it('rejette un CSV vide', async () => {
    const res = await importSubscribersCsvAction('', OPTIONS);
    expect(res.success).toBe(false);
    expect(res.error).toBe('Fichier CSV vide');
    expect(mocks.goFetch).not.toHaveBeenCalled();
  });

  it('refuse de déposer sans déclarations de provenance complètes', async () => {
    const csv = 'email\nalice@example.com\n';
    for (const incomplete of [
      { ...DECLARATIONS, noPurchased: false },
      { ...DECLARATIONS, noScraped: false },
      { ...DECLARATIONS, noUnsubscribed: false },
      { ...DECLARATIONS, suppressionListIdentified: false },
      { ...DECLARATIONS, consentPurpose: '   ' },
    ]) {
      vi.clearAllMocks();
      mocks.getUser.mockResolvedValue({ data: { user: { id: 'u_creator_1' } } });
      mocks.getActivePublicationId.mockResolvedValue('pub_test_123');

      const res = await importSubscribersCsvAction(csv, { declarations: incomplete });
      expect(res.success).toBe(false);
      expect(mocks.goFetch).not.toHaveBeenCalled();
    }
  });

  // Invariant central : déposer une liste n'envoie rien et ne crée aucun
  // contact. Auparavant cette action appelait POST /v1/home/subscribe **une
  // fois par adresse**, ce qui créait des abonnés `confirmedAt = now()` — donc
  // des destinataires de la campagne suivante sans consentement démontrable.
  it('dépose le lot en quarantaine en un seul appel, sans jamais activer d’abonné', async () => {
    const csvContent = `email,created_at,type
alice@example.com,2024-01-01,free
bob@example.com,2024-01-02,paid
ALICE@EXAMPLE.COM,2024-01-03,free
invalid-email,2024-01-04,free
charlie@domain.org,2024-01-05,free`;

    const res = await importSubscribersCsvAction(csvContent, OPTIONS);

    expect(res.success).toBe(true);
    expect(res.batchId).toBe('batch_1');
    expect(res.status).toBe('submitted');
    expect(mocks.goFetch).toHaveBeenCalledTimes(1);

    const [url, init] = mocks.goFetch.mock.calls[0] as [
      string,
      { method: string; body: Record<string, unknown> },
    ];
    expect(url).toBe('/v1/import/publications/pub_test_123/subscribers');
    expect(init.method).toBe('POST');
    expect(init.body.content).toBe(csvContent);
    expect(init.body.declarations).toEqual(DECLARATIONS);

    const calls = JSON.stringify(mocks.goFetch.mock.calls);
    expect(calls).not.toContain('/v1/home/subscribe');
    expect(calls).not.toContain('email"'); // aucune adresse envoyée à l'unité
  });

  it('transmet la provenance déclarée au dossier de revue', async () => {
    await importSubscribersCsvAction('email\na@b.fr\n', {
      source: 'ghost',
      sourceDetail: 'export Ghost 5',
      collectionPeriod: 'mars 2019 – juin 2024',
      optInMethod: 'formulaire avec double confirmation',
      declarations: DECLARATIONS,
    });

    const [, init] = mocks.goFetch.mock.calls[0] as [string, { body: Record<string, unknown> }];
    expect(init.body.source).toBe('ghost');
    expect(init.body.sourceDetail).toBe('export Ghost 5');
    expect(init.body.collectionPeriod).toBe('mars 2019 – juin 2024');
    expect(init.body.optInMethod).toBe('formulaire avec double confirmation');
  });

  it('remonte le bilan agrégé renvoyé par le serveur', async () => {
    const res = await importSubscribersCsvAction('email\na@b.fr\n', OPTIONS);
    expect(res.stats).toMatchObject({ pendingConfirmation: 2, duplicates: 1 });
  });

  it('remonte l’erreur du serveur (déclarations refusées, lot déjà en revue…)', async () => {
    mocks.goFetch.mockRejectedValue(
      new Error('Trop de lots en attente de revue pour cette publication.')
    );
    const res = await importSubscribersCsvAction('email\na@b.fr\n', OPTIONS);
    expect(res.success).toBe(false);
    expect(res.error).toContain('Trop de lots');
  });
});

describe('importRssFeedAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'u_creator_1', email: 'creator@qoe.fi' } },
    });
    mocks.getActivePublicationId.mockResolvedValue('pub_test_123');
  });

  it('bloque immédiatement les URLs SSRF locales et metadata', async () => {
    const ssrfUrls = [
      'http://localhost:15407/admin',
      'http://127.0.0.1:5432/rss',
      'http://169.254.169.254/latest/meta-data',
      'http://10.0.0.1/feed',
      'file:///etc/passwd',
    ];

    for (const badUrl of ssrfUrls) {
      const res = await importRssFeedAction(badUrl);
      expect(res.success).toBe(false);
      expect(res.error).toBeDefined();
    }
  });
});
