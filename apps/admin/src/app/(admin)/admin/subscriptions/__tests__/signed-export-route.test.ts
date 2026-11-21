// @vitest-environment node
// =====================================================================
// 🧪 /admin/subscriptions/signed-export — le corps JSON est filtré
// =====================================================================
// La branche formulaire bornait et listait ses champs ; la branche JSON
// recopiait le corps tel quel. Un appelant pouvait donc transmettre
// n'importe quelle clé (filtres internes, champs d'audit) et des valeurs de
// taille arbitraire, relayées telles quelles au backend.
// =====================================================================

import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { goFetchRaw } = vi.hoisted(() => ({
  goFetchRaw: vi.fn(async (..._args: unknown[]) => ({
    status: 200,
    headers: {},
    text: '{"ok":true}',
    contentType: 'application/json',
    contentDisposition: '',
  })),
}));

vi.mock('@/lib/admin-identity', () => ({
  getAdminIdentity: vi.fn(async () => ({
    userId: 'staff_1',
    capabilities: ['admin.subscriptions.read'],
  })),
  hasCapability: vi.fn(() => true),
}));
vi.mock('@qoe/sdk/actions/utils/go-client', () => ({ goFetchRaw }));

import { POST } from '../signed-export/route';

describe('/admin/subscriptions/signed-export', () => {
  afterEach(() => goFetchRaw.mockClear());

  it('ne relaie que les champs prévus, bornés', async () => {
    const request = new NextRequest('https://admin.test/admin/subscriptions/signed-export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reason: 'Audit CNIL',
        publisherId: 'pub_1',
        status: 'ACTIVE',
        injected: 'x'.repeat(5000),
        subject: 's'.repeat(400),
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    const call = goFetchRaw.mock.calls[0] as unknown as [string, { body: Record<string, unknown> }];
    const sent = call[1];
    expect(Object.keys(sent.body).sort()).toEqual(['publisherId', 'reason', 'status', 'subject']);
    expect(String(sent.body.subject)).toHaveLength(200);
  });
});
