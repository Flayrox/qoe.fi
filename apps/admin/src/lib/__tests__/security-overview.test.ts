// =====================================================================
// 🧪 Cockpit sécurité — un mode Authz non lu n'est pas « observation »
// =====================================================================
// Le défaut mesuré (R160) : `authzEnforceEnabled: Boolean(body?.…)` repliait
// l'absence de champ — et l'échec complet de la lecture — sur `false`, que
// l'écran affichait « observe ». Un cockpit sécurité annonçait donc un mode
// d'application que personne n'avait mesuré.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const goFetch = vi.hoisted(() => vi.fn());

vi.mock('@qoe/sdk/actions/utils/go-client', () => ({ goFetch }));

import { describeAuthzEnforcement, getSecurityOverview } from '../admin-security-data';

describe('getSecurityOverview — mode Authz', () => {
  beforeEach(() => {
    goFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lit un mode armé', async () => {
    goFetch.mockResolvedValue({ authzEnforceEnabled: true });

    await expect(getSecurityOverview()).resolves.toMatchObject({
      ok: true,
      data: { authzEnforceEnabled: true },
    });
  });

  it('lit un mode en observation', async () => {
    goFetch.mockResolvedValue({ authzEnforceEnabled: false });

    await expect(getSecurityOverview()).resolves.toMatchObject({
      ok: true,
      data: { authzEnforceEnabled: false },
    });
  });

  it('laisse le mode illisible quand la réponse est muette', async () => {
    goFetch.mockResolvedValue({});

    await expect(getSecurityOverview()).resolves.toMatchObject({
      ok: true,
      data: { authzEnforceEnabled: null },
    });
  });

  it('déclare le cockpit illisible quand la lecture échoue', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    goFetch.mockRejectedValue(new Error('go down'));

    // Plus de zéros peints comme des faits : l'écran sait qu'il n'a pas lu.
    await expect(getSecurityOverview()).resolves.toEqual({ ok: false });
  });
});

describe('describeAuthzEnforcement', () => {
  it('distingue armé, observation et illisible', () => {
    expect(describeAuthzEnforcement(true)).toEqual({
      value: 'enforce',
      tone: 'default',
      detail: 'refus armés',
    });
    expect(describeAuthzEnforcement(false)).toEqual({
      value: 'observe',
      tone: 'warn',
      detail: 'observation seule',
    });
    expect(describeAuthzEnforcement(null).value).toBe('—');
    expect(describeAuthzEnforcement(null).tone).toBe('default');
  });
});
