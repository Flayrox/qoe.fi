// =====================================================================
// 🧪 admin-legal-actions — un refus du garde reste expliquable
// =====================================================================
// `createLegalDocumentAction` appelait `verifySuperadmin()` AVANT son `try` :
// un 403 (capacité manquante, step-up exigé) sortait en promesse rejetée, donc
// sans le contrat `{ success:false, error, code? }` que tous les écrans savent
// lire — et sans le code qui déclenche la vérification de facteur.
//
// De plus `verifySuperadmin` de ce module jetait `new Error('Forbidden')` en
// perdant `code`/`level` de l'enveloppe du garde (contrairement à celui de
// `admin-aux-actions`) : l'écran ne pouvait pas proposer le step-up.
// =====================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

const goFetch = vi.fn();

vi.mock('@qoe/sdk/actions/utils/go-client', () => ({
  goFetch: (...args: unknown[]) => goFetch(...args),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { createLegalDocumentAction } from '../admin-legal-actions';

const denial = Object.assign(new Error('forbidden'), {
  status: 403,
  code: 'needs_step_up',
  level: 'N2',
});

beforeEach(() => {
  goFetch.mockReset().mockImplementation((path: string) => {
    if (path === '/v1/admin/me') {
      return Promise.resolve({
        userId: 'staff_1',
        roles: ['superadmin'],
        capabilities: ['admin.legal.write', 'admin.legal.read'],
      });
    }
    return Promise.resolve({ ok: true });
  });
});

describe('createLegalDocumentAction', () => {
  it('rend un échec explicite, avec le code du garde, quand la preuve manque', async () => {
    goFetch.mockImplementation((path: string) => {
      if (path === '/v1/admin/me') {
        return Promise.resolve({
          userId: 'staff_1',
          roles: ['superadmin'],
          capabilities: ['admin.legal.write', 'admin.legal.read'],
        });
      }
      return Promise.reject(denial);
    });

    const result = await createLegalDocumentAction({
      slug: 'cgu',
      category: 'legal',
      audience: 'all',
      requiresAcceptance: true,
    });

    expect(result).toMatchObject({ success: false, code: 'needs_step_up', level: 'N2' });
  });

  it('réussit quand le serveur accepte', async () => {
    await expect(
      createLegalDocumentAction({
        slug: 'cgu',
        category: 'legal',
        audience: 'all',
        requiresAcceptance: true,
      })
    ).resolves.toMatchObject({ success: true });
  });
});
