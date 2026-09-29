import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchPlusStatus, __resetPlusCacheForTests } from './plus-status';
import { getMyEntitlementsAction } from '@qoe/sdk';

vi.mock('@qoe/sdk', () => ({
  getMyEntitlementsAction: vi.fn(),
}));

// Statut Plus : UN SEUL appel par session (cache + dédupe concurrente),
// false par défaut et en erreur (dégradation ouverte).

describe('fetchPlusStatus', () => {
  beforeEach(() => {
    __resetPlusCacheForTests();
    vi.mocked(getMyEntitlementsAction).mockReset();
  });

  it('vrai quand octroyé', async () => {
    vi.mocked(getMyEntitlementsAction).mockResolvedValue({ ok: true, data: { plus: true } });
    await expect(fetchPlusStatus()).resolves.toBe(true);
  });

  it('un seul appel malgré les concurrents (déduplication)', async () => {
    let resolve!: (v: { ok: true; data: { plus: boolean } }) => void;
    vi.mocked(getMyEntitlementsAction).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      })
    );
    const [a, b, c] = await Promise.all([
      fetchPlusStatus(),
      fetchPlusStatus(),
      (resolve({ ok: true, data: { plus: true } }), fetchPlusStatus()),
    ]);
    expect([a, b, c]).toEqual([true, true, true]);
    expect(getMyEntitlementsAction).toHaveBeenCalledTimes(1);
  });

  it('cache : le 2e appel ne refrappe pas', async () => {
    vi.mocked(getMyEntitlementsAction).mockResolvedValue({ ok: true, data: { plus: false } });
    await expect(fetchPlusStatus()).resolves.toBe(false);
    await expect(fetchPlusStatus()).resolves.toBe(false);
    expect(getMyEntitlementsAction).toHaveBeenCalledTimes(1);
  });

  it('erreur réseau = false (pas de blocage)', async () => {
    vi.mocked(getMyEntitlementsAction).mockRejectedValue(new Error('down'));
    await expect(fetchPlusStatus()).resolves.toBe(false);
  });

  it('réponse non-ok = false', async () => {
    vi.mocked(getMyEntitlementsAction).mockResolvedValue({
      ok: false,
      error: { code: 'x', message: 'y' },
    });
    await expect(fetchPlusStatus()).resolves.toBe(false);
  });
});
