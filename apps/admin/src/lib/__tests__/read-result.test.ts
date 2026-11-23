// =====================================================================
// 🧪 read-result — une lecture réussie, ou déclarée illisible (R161)
// =====================================================================
// Le défaut mesuré : `catch { return [] }` faisait passer une panne Go pour
// une base vide. `readOr` rend le fait observable (`ok: false`) et journalise
// l'objet métier ; un refus d'autorisation, lui, n'est pas une panne et doit
// continuer de remonter.
// =====================================================================

import { afterEach, describe, expect, it, vi } from 'vitest';

import { readData, readOr } from '../read-result';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('readOr', () => {
  it('rend la donnée lue quand la lecture aboutit', async () => {
    await expect(readOr('la file support', async () => [1, 2])).resolves.toEqual({
      ok: true,
      data: [1, 2],
    });
  });

  it('rend « illisible » quand la lecture échoue, et journalise l’objet métier', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      readOr('la file support', async () => {
        throw new Error('go indisponible');
      })
    ).resolves.toEqual({ ok: false });

    // Sans ce libellé, une panne de la console serait muette côté serveur.
    expect(logged).toHaveBeenCalledWith(
      '[admin] lecture impossible — la file support :',
      expect.any(Error)
    );
  });

  it('laisse remonter un refus d’autorisation : un 403 n’est pas une panne', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const forbidden = Object.assign(new Error('forbidden'), { status: 403 });

    await expect(
      readOr('le journal d’audit', async () => {
        throw forbidden;
      })
    ).rejects.toThrow('forbidden');
  });
});

describe('readData', () => {
  it('rend la donnée lue ou le repli, sans jamais confondre les deux', () => {
    expect(readData({ ok: true, data: ['a'] }, [])).toEqual(['a']);
    expect(readData({ ok: false }, [])).toEqual([]);
  });
});
