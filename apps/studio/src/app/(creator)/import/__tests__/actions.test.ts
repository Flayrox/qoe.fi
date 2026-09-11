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

import { importSubscribersCsvAction, importRssFeedAction } from '../actions';

describe('importSubscribersCsvAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({
      data: { user: { id: 'u_creator_1', email: 'creator@qoe.fi' } },
    });
    mocks.getActivePublicationId.mockResolvedValue('pub_test_123');
    mocks.goFetch.mockResolvedValue({ success: true });
  });

  it('rejette un CSV vide', async () => {
    const res = await importSubscribersCsvAction('');
    expect(res.success).toBe(false);
    expect(res.error).toBe('Fichier CSV vide');
  });

  it('parse et importe un fichier CSV type Substack avec déduplication', async () => {
    const csvContent = `email,created_at,type
alice@example.com,2024-01-01,free
bob@example.com,2024-01-02,paid
ALICE@EXAMPLE.COM,2024-01-03,free
invalid-email,2024-01-04,free
charlie@domain.org,2024-01-05,free`;

    const res = await importSubscribersCsvAction(csvContent);
    expect(res.success).toBe(true);
    expect(res.count).toBe(3); // alice, bob, charlie (alice dédupliquée en minuscule)
    expect(mocks.goFetch).toHaveBeenCalledTimes(3);
    expect(mocks.goFetch).toHaveBeenCalledWith('/v1/home/subscribe', {
      method: 'POST',
      body: { email: 'alice@example.com', publicationId: 'pub_test_123' },
    });
  });

  it('supporte les formats avec délimiteur point-virgule et en-tête français', async () => {
    const csvContent = `Nom;Adresse Email;Date
Dupont;jean.dupont@test.fr;2024-02-01
Durand;marie.durand@test.fr;2024-02-02`;

    const res = await importSubscribersCsvAction(csvContent);
    expect(res.success).toBe(true);
    expect(res.count).toBe(2);
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
