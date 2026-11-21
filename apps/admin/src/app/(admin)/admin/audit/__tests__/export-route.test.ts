// @vitest-environment node
// =====================================================================
// 🧪 /admin/audit/export — une panne d'export est enveloppée
// =====================================================================
// Le handler relaie le flux CSV du Go sans try/catch : un réseau coupé ou un
// délai dépassé faisait remonter l'exception brute (500 sans corps). Un export
// qui échoue doit répondre une erreur lisible, pas une page blanche.
// =====================================================================

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/admin-identity', () => ({
  getAdminIdentity: vi.fn(async () => ({ userId: 'staff_1', capabilities: ['admin.audit.read'] })),
  hasCapability: vi.fn(() => true),
}));
vi.mock('@qoe/supabase/server', () => ({
  createClient: async () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: 'jwt_test' } } }) },
  }),
}));
vi.mock('@qoe/sdk/actions/utils/go-client', () => ({
  goApiUrl: () => 'https://api.test',
  goTimeoutMs: () => 1000,
}));

import { GET } from '../export/route';
import { NextRequest } from 'next/server';

describe('/admin/audit/export', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('répond une erreur enveloppée quand le backend est injoignable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connect ECONNREFUSED');
      })
    );

    const response = await GET(new NextRequest('https://admin.test/admin/audit/export'));

    expect(response.status).toBe(503);
    expect(await response.text()).toContain('Export impossible');
  });
});
