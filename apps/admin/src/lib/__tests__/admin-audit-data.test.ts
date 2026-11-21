// =====================================================================
// 🧪 audit — un mode d'autorisation illisible ne se devine pas
// =====================================================================
// `getAuditLog` et `getAuthzDecisions` retombaient sur `mode: 'observe'` quand
// l'API ne répondait pas. L'écran d'audit affichait alors le bandeau
// « Mode OBSERVATION — les refus sont journalisés mais pas appliqués » : une
// affirmation sur la posture de sécurité de la plateforme, sans aucune donnée.
// Quand le mode est inconnu, il doit être dit inconnu.
// =====================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@qoe/sdk/actions/utils/go-client', () => ({ goFetch: vi.fn() }));

import { goFetch } from '@qoe/sdk/actions/utils/go-client';
import { getAuditLog, getAuthzDecisions } from '../admin-audit-data';

const mockGoFetch = vi.mocked(goFetch);

describe('getAuditLog', () => {
  beforeEach(() => {
    mockGoFetch.mockReset();
  });

  it('rend le mode du serveur quand il répond', async () => {
    mockGoFetch.mockResolvedValue({ items: [], mode: 'enforce' });
    await expect(getAuditLog()).resolves.toEqual({ items: [], mode: 'enforce' });
  });

  it('rend un mode inconnu (null) quand l’API échoue', async () => {
    mockGoFetch.mockRejectedValue(new Error('go indisponible'));
    await expect(getAuditLog()).resolves.toEqual({ items: [], mode: null });
  });

  it('laisse remonter un refus d’autorisation explicite', async () => {
    mockGoFetch.mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 }));
    await expect(getAuditLog()).rejects.toThrow(/admin\.audit\.read/);
  });
});

describe('getAuthzDecisions', () => {
  beforeEach(() => {
    mockGoFetch.mockReset();
  });

  it('rend un mode inconnu (null) quand l’API échoue', async () => {
    mockGoFetch.mockRejectedValue(new Error('go indisponible'));
    await expect(getAuthzDecisions()).resolves.toEqual({ items: [], groups: [], mode: null });
  });
});
