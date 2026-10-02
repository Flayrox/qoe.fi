import { describe, expect, it, vi, beforeEach } from 'vitest';

// =====================================================================
// 🧪 Refus d'autorisation et rejeu après step-up (Phase 3)
// =====================================================================
// Ce que ces tests verrouillent :
//   - un refus qui se débloque par une preuve forte (`needs_step_up`,
//     `deny_weak_auth`) déclenche la vérification PUIS rejoue l'action ;
//   - si la vérification est annulée ou impossible, l'action n'est pas rejouée
//     (on ne double jamais un acte) et le refus d'origine est rendu ;
//   - un refus qui ne relève PAS de la session (capacité manquante, double
//     validation, erreur métier) ne déclenche aucune vérification.
// Le vrai dialogue est neutralisé : on teste l'enchaînement, pas Supabase.
// =====================================================================

const requestStepUp = vi.fn();
vi.mock('@/components/security/step-up', () => ({
  requestStepUp: (reason?: string) => requestStepUp(reason),
  StepUpGate: () => null,
}));

const toastError = vi.fn();
vi.mock('@qoe/ui/toast', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: vi.fn(),
  },
}));

const { attemptWithStepUp, notifyActionFailure, readMessage, isFailure } =
  await import('@/lib/authz-feedback');

beforeEach(() => {
  requestStepUp.mockReset();
  toastError.mockReset();
});

describe('attemptWithStepUp', () => {
  it('rend le résultat tel quel quand l’action réussit', async () => {
    const run = vi.fn().mockResolvedValue({ ok: true, value: 42 });
    await expect(attemptWithStepUp(run)).resolves.toEqual({ ok: true, value: 42 });
    expect(requestStepUp).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('ne rejoue rien quand le refus ne relève pas de la session', async () => {
    const denied = {
      ok: false,
      error: 'Capacité requise absente.',
      code: 'deny_missing_capability',
    };
    const run = vi.fn().mockResolvedValue(denied);
    await expect(attemptWithStepUp(run)).resolves.toEqual(denied);
    expect(requestStepUp).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('propose la vérification puis REJOUE l’action sur needs_step_up', async () => {
    requestStepUp.mockResolvedValue(true);
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        error: 'preuve forte trop ancienne',
        code: 'needs_step_up',
      })
      .mockResolvedValueOnce({ ok: true });

    await expect(attemptWithStepUp(run)).resolves.toEqual({ ok: true });
    expect(requestStepUp).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('traite deny_weak_auth comme un step-up (facteur SMS insuffisant)', async () => {
    requestStepUp.mockResolvedValue(true);
    const run = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: 'méthode non autorisée', code: 'deny_weak_auth' })
      .mockResolvedValueOnce({ ok: true });

    await expect(attemptWithStepUp(run)).resolves.toEqual({ ok: true });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('ne rejoue pas si la vérification est annulée, et rend le refus d’origine', async () => {
    requestStepUp.mockResolvedValue(false);
    const denied = { ok: false, error: 'preuve forte requise', code: 'needs_step_up' };
    const run = vi.fn().mockResolvedValue(denied);

    await expect(attemptWithStepUp(run)).resolves.toEqual(denied);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('lit le code transporté dans error.code (shape ActionResult du SDK)', async () => {
    requestStepUp.mockResolvedValue(false);
    const denied = { ok: false, error: { message: 'step-up', code: 'needs_step_up' } };
    const run = vi.fn().mockResolvedValue(denied);

    await expect(attemptWithStepUp(run)).resolves.toEqual(denied);
    expect(requestStepUp).toHaveBeenCalledTimes(1);
  });
});

describe('notifyActionFailure', () => {
  it('explique un step-up avec le titre du vocabulaire partagé', () => {
    notifyActionFailure({ ok: false, code: 'deny_weak_auth', error: 'sms' }, 'échec');
    expect(toastError).toHaveBeenCalledWith(
      'Méthode de vérification insuffisante',
      expect.objectContaining({ description: expect.stringContaining('SMS') })
    );
  });

  it('annonce la double validation sans proposer de vérification', () => {
    notifyActionFailure({ ok: false, code: 'needs_review', error: 'x' }, 'échec');
    expect(toastError).toHaveBeenCalledWith('Double validation requise', expect.anything());
  });

  it('se rabat sur le message serveur pour une erreur métier', () => {
    notifyActionFailure({ ok: false, error: 'Campagne introuvable' }, 'échec');
    expect(toastError).toHaveBeenCalledWith('Campagne introuvable');
  });
});

describe('helpers', () => {
  it('isFailure reconnaît les deux formes de résultat', () => {
    expect(isFailure({ ok: false })).toBe(true);
    expect(isFailure({ success: false })).toBe(true);
    expect(isFailure({ ok: true })).toBe(false);
    expect(isFailure(undefined)).toBe(false);
  });

  it('readMessage lit les messages imbriqués du SDK', () => {
    expect(readMessage({ error: { message: 'Refus' } })).toBe('Refus');
    expect(readMessage({ error: 'Refus' })).toBe('Refus');
    expect(readMessage({ ok: false })).toBeNull();
  });
});
