import { describe, it, expect, vi, beforeEach } from 'vitest';

const requestStepUp = vi.fn();
const toastError = vi.fn();

vi.mock('@/features/security/step-up', () => ({
  requestStepUp: (reason?: string) => requestStepUp(reason),
}));

vi.mock('@qoe/ui/toast', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: vi.fn(),
  },
}));

const { attemptWithStepUp, notifyActionFailure } = await import('../authz-feedback');

/** Échec de server action tel que le produit `safeAction`. */
function denied(code: string) {
  return { ok: false as const, error: { code, message: `refusé: ${code}` } };
}

describe('attemptWithStepUp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renvoie le résultat sans rien demander quand l’action passe', async () => {
    const run = vi.fn().mockResolvedValue({ ok: true, data: 'ok' });

    const result = await attemptWithStepUp(run, { fallback: 'échec' });

    expect(result).toEqual({ ok: true, data: 'ok' });
    expect(run).toHaveBeenCalledTimes(1);
    expect(requestStepUp).not.toHaveBeenCalled();
  });

  it('vérifie un facteur puis rejoue automatiquement l’action', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce(denied('needs_step_up'))
      .mockResolvedValueOnce({ ok: true, data: 'enfin' });
    requestStepUp.mockResolvedValue(true);

    const result = await attemptWithStepUp(run, { fallback: 'échec' });

    expect(requestStepUp).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true, data: 'enfin' });
    expect(toastError).not.toHaveBeenCalled();
  });

  it('rejoue aussi après un refus pour méthode faible ou preuve trop ancienne', async () => {
    for (const code of ['deny_weak_auth', 'deny_stale_proof']) {
      vi.clearAllMocks();
      const run = vi.fn().mockResolvedValueOnce(denied(code)).mockResolvedValueOnce({ ok: true });
      requestStepUp.mockResolvedValue(true);

      const result = await attemptWithStepUp(run, { fallback: 'échec' });

      expect(run).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ ok: true });
    }
  });

  it('ne rejoue pas si l’utilisateur annule, et explique le blocage', async () => {
    const run = vi.fn().mockResolvedValue(denied('needs_step_up'));
    requestStepUp.mockResolvedValue(false);

    const result = await attemptWithStepUp(run, { fallback: 'échec' });

    expect(run).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: false,
      error: { code: 'needs_step_up', message: 'refusé: needs_step_up' },
    });
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it('ne rejoue jamais un refus de droits : vérifier un facteur n’y changerait rien', async () => {
    const run = vi.fn().mockResolvedValue(denied('deny_no_resource_permission'));

    await attemptWithStepUp(run, { fallback: 'échec' });

    expect(requestStepUp).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it('s’arrête après une seconde tentative pour ne pas boucler', async () => {
    const run = vi.fn().mockResolvedValue(denied('needs_step_up'));
    requestStepUp.mockResolvedValue(true);

    const result = await attemptWithStepUp(run, { fallback: 'échec' });

    expect(run).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      ok: false,
      error: { code: 'needs_step_up', message: 'refusé: needs_step_up' },
    });
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it('laisse passer les échecs qui ne viennent pas du garde', async () => {
    const failure = { ok: false as const, error: { code: 'INTERNAL', message: 'boom' } };
    const run = vi.fn().mockResolvedValue(failure);

    const result = await attemptWithStepUp(run, { fallback: 'échec' });

    expect(requestStepUp).not.toHaveBeenCalled();
    expect(result).toEqual(failure);
    expect(toastError).toHaveBeenCalledWith('boom');
  });

  it('accepte un prédicat d’échec maison (actions hors ActionResult)', async () => {
    const run = vi.fn().mockResolvedValue({ success: false, code: 'needs_step_up' });
    requestStepUp.mockResolvedValue(true);

    await attemptWithStepUp(run, {
      fallback: 'échec',
      failed: (result) => (result as { success: boolean }).success === false,
    });

    expect(run).toHaveBeenCalledTimes(2);
  });
});

describe('notifyActionFailure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('propose le parcours de vérification pour un refus de preuve', () => {
    notifyActionFailure(denied('needs_step_up'), 'échec');

    const [, options] = toastError.mock.calls[0] as [string, { action?: { label: string } }];
    expect(options.action?.label).toBe('Vérifier un facteur');
  });

  it('affiche le motif réel plutôt qu’un message générique', () => {
    notifyActionFailure(denied('deny_phone_not_verified'), 'échec');

    const [title] = toastError.mock.calls[0] as [string];
    expect(title).toBe('Numéro de téléphone requis');
  });

  it('retombe sur le message du serveur quand le code est inconnu du garde', () => {
    notifyActionFailure(
      { ok: false, error: { code: 'NOT_FOUND', message: 'introuvable' } },
      'échec'
    );

    expect(toastError).toHaveBeenCalledWith('introuvable');
  });
});
