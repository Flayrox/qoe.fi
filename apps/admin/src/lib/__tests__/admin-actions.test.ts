// =====================================================================
// 🧪 admin-actions — un bannissement à moitié fait doit le dire
// =====================================================================
// `suspendUserAction` écrit la suspension en base puis bannit la session dans
// Supabase Auth. Quand le bannissement échouait, l'action **jetait** une erreur
// brute : le contrat `{ success:false, error, code? }` était perdu en route (et
// l'écran n'avait plus de message à afficher). `unsuspendUserAction` faisait
// pire : elle ignorait l'erreur, donc annonçait un débannissement qui n'avait
// pas eu lieu. Les deux doivent rendre un échec explicite.
//
// La clé `SUPABASE_SERVICE_ROLE_KEY` est en plus affirmée non-nulle dans le
// client : sans elle, l'appel part avec `undefined` et échoue ailleurs.
// =====================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

const goFetch = vi.fn();
const updateUserById = vi.fn();
const createClient = vi.fn();

vi.mock('@qoe/sdk/actions/utils/go-client', () => ({
  goFetch: (...args: unknown[]) => goFetch(...args),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClient(...args),
}));
vi.mock('@qoe/supabase/url', () => ({ resolveSupabaseUrl: () => 'https://supabase.test' }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { suspendUserAction, unsuspendUserAction } from '../admin-actions';

beforeEach(() => {
  goFetch.mockReset().mockImplementation((path: string) => {
    if (path === '/v1/admin/me') {
      return Promise.resolve({
        userId: 'staff_1',
        roles: ['superadmin'],
        capabilities: ['admin.users.moderate'],
      });
    }
    return Promise.resolve({ ok: true });
  });
  updateUserById.mockReset();
  createClient.mockReset().mockReturnValue({ auth: { admin: { updateUserById } } });
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.test';
});

describe('suspendUserAction', () => {
  it('rend un échec explicite quand le bannissement Auth échoue', async () => {
    updateUserById.mockResolvedValue({ data: null, error: { message: 'auth down' } });

    const result = await suspendUserAction({ userId: 'user_1', reason: 'spam' });

    expect(result).toMatchObject({ success: false });
    if (!result.success) expect(result.error).toMatch(/bannissement Auth/i);
  });

  it('réussit quand les deux écritures passent', async () => {
    updateUserById.mockResolvedValue({ data: { user: { id: 'user_1' } }, error: null });

    await expect(suspendUserAction({ userId: 'user_1', reason: 'spam' })).resolves.toMatchObject({
      success: true,
    });
  });

  it('nomme la clé de service manquante au lieu de partir avec undefined', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    updateUserById.mockResolvedValue({ data: null, error: null });

    const result = await suspendUserAction({ userId: 'user_1', reason: 'spam' });

    expect(result).toMatchObject({ success: false });
    if (!result.success) expect(result.error).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe('unsuspendUserAction', () => {
  it('rend un échec explicite quand le débannissement Auth échoue', async () => {
    updateUserById.mockResolvedValue({ data: null, error: { message: 'auth down' } });

    const result = await unsuspendUserAction('user_1');

    expect(result).toMatchObject({ success: false });
    if (!result.success) expect(result.error).toMatch(/débannissement Auth/i);
  });
});
