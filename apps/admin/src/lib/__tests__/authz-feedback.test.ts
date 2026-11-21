// =====================================================================
// 🧪 `attemptWithStepUp` — une action qui lève rend un échec, elle ne jette pas
// =====================================================================
// Les files de décision (signalements, recours, anti-abus, doubles validations,
// support, triage, comptes, effacement) attendent le résultat puis rendent la
// main (`setIsSubmitting(false)`). Une action qui LÈVE — réseau coupé, route
// absente, garde hors enveloppe — faisait sauter ce retour : boutons et champs
// restaient désactivés pour toujours, sans une ligne à l'écran.
// =====================================================================

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/components/security/step-up', () => ({
  requestStepUp: vi.fn(async () => true),
}));

import { attemptWithStepUp, isFailure, readMessage } from '../authz-feedback';

describe('attemptWithStepUp — contrat de non-rejet', () => {
  it('rend un échec lisible quand l’action lève', async () => {
    const result = await attemptWithStepUp(() => Promise.reject(new Error('Réseau coupé')));

    expect(isFailure(result)).toBe(true);
    expect(readMessage(result)).toBe('Réseau coupé');
  });

  it('rend un échec lisible quand le rejeu lève après la vérification', async () => {
    let calls = 0;
    const result = await attemptWithStepUp(async () => {
      calls += 1;
      if (calls === 1) {
        return { ok: false as const, error: 'Preuve forte requise', code: 'needs_step_up' };
      }
      throw new Error('Session expirée');
    });

    expect(calls).toBe(2);
    expect(isFailure(result)).toBe(true);
    expect(readMessage(result)).toBe('Session expirée');
  });

  it('laisse passer un succès inchangé', async () => {
    const result = await attemptWithStepUp(async () => ({ ok: true as const, value: 7 }));

    expect(result).toEqual({ ok: true, value: 7 });
  });
});
