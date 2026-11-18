import { beforeEach, describe, expect, it, vi } from 'vitest';

// Les opérations Auth de la console exigent le client service-role : sans ces
// variables, l'action échoue explicitement (c'est le comportement testé aussi).
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';

// L06d : la console admin mélange deux systèmes (base Go = vérité, Supabase
// Auth = bannissement). Un échec de l'un ne doit jamais laisser l'autre dans
// un état incohérent, et aucune opération privilégiée ne part avant le 200 Go.

const { goFetch, updateUserById, revalidatePath } = vi.hoisted(() => ({
  goFetch: vi.fn(),
  updateUserById: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('../actions/utils/go-client', () => ({ goFetch }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { admin: { updateUserById } } }),
}));
vi.mock('@qoe/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'admin-1', email: 'admin@qoe.fi' } },
        error: null,
      }),
    },
  }),
}));

import { suspendUserAction, unsuspendUserAction } from '../actions/admin';

describe('suspendUserAction', () => {
  beforeEach(() => {
    goFetch.mockReset();
    updateUserById.mockReset();
    revalidatePath.mockReset();
  });

  it('bannit Auth seulement après le 200 du Go et rafraîchit /admin/users', async () => {
    goFetch.mockResolvedValue({ success: true });
    updateUserById.mockResolvedValue({ error: null });

    const res = await suspendUserAction({ userId: 'u1', reason: 'spam' });

    expect(res.ok).toBe(true);
    expect(goFetch).toHaveBeenCalledTimes(1);
    expect(updateUserById).toHaveBeenCalledWith('u1', { ban_duration: '876000h' });
    expect(revalidatePath).toHaveBeenCalledWith('/admin/users');
  });

  it('n’appelle jamais Auth quand le Go refuse (403)', async () => {
    goFetch.mockRejectedValue(Object.assign(new Error('Refusé'), { status: 403 }));

    const res = await suspendUserAction({ userId: 'u1', reason: 'spam' });

    expect(res.ok).toBe(false);
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('rétablit la base quand le bannissement Auth échoue', async () => {
    goFetch.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: true });
    updateUserById.mockResolvedValue({ error: { message: 'auth down' } });

    const res = await suspendUserAction({ userId: 'u1', reason: 'spam' });

    expect(res.ok).toBe(false);
    const compensation = goFetch.mock.calls[1];
    expect(compensation[0]).toBe('/v1/admin/users/u1');
    expect(compensation[1]?.body).toEqual({ isSuspended: false, suspendReason: null });
  });
});

describe('unsuspendUserAction', () => {
  beforeEach(() => {
    goFetch.mockReset();
    updateUserById.mockReset();
  });

  it('signale explicitement un ban Auth qui survit au rétablissement', async () => {
    goFetch.mockResolvedValue({ success: true });
    updateUserById.mockResolvedValue({ error: { message: 'auth down' } });

    const res = await unsuspendUserAction('u1');

    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error.message).toContain('bannissement Auth subsiste');
  });

  it('réussit quand les deux systèmes répondent', async () => {
    goFetch.mockResolvedValue({ success: true });
    updateUserById.mockResolvedValue({ error: null });

    const res = await unsuspendUserAction('u1');

    expect(res.ok).toBe(true);
    expect(updateUserById).toHaveBeenCalledWith('u1', { ban_duration: 'none' });
  });
});
