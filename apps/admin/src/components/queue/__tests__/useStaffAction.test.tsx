// @vitest-environment jsdom
// =====================================================================
// 🧪 useStaffAction — le contrat dont dépendent les `if (res)`
// =====================================================================
// Neuf écrans écrivent `if (res) { …fermer le formulaire… }` autour de
// `run(...)`. Ce test fige le contrat du hook : un refus rend `null` (jamais
// un objet truthy) et n'émet pas de toast de succès ; un succès rend le
// résultat. Si le hook rendait un jour le refus tel quel, ce test tombe.
// =====================================================================

import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@qoe/ui/toast', () => ({
  toast: { success: toastSuccess, error: toastError },
}));
vi.mock('@/components/security/step-up', () => ({ requestStepUp: vi.fn(async () => false) }));

import { useStaffAction } from '../useStaffAction';

let outcome: unknown = null;

function Harness({ action }: { action: () => Promise<{ ok: boolean; error?: string }> }) {
  const { run } = useStaffAction<string>();
  const [, setTick] = useState(0);
  return (
    <button
      onClick={() => {
        void run('ligne', action, { ok: 'Fait' }).then((res) => {
          outcome = res;
          setTick((t) => t + 1);
        });
      }}
    >
      lancer
    </button>
  );
}

describe('useStaffAction', () => {
  beforeEach(() => {
    outcome = 'untouched';
    toastSuccess.mockClear();
    toastError.mockClear();
  });
  afterEach(() => cleanup());

  it('rend null et n’annonce pas un succès quand l’action est refusée', async () => {
    const action = vi.fn(async () => ({
      ok: false,
      error: 'Capacité admin.subscriptions.write requise',
    }));
    render(<Harness action={action} />);

    fireEvent.click(screen.getByText('lancer'));

    await waitFor(() => expect(outcome).toBe(null));
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(toastError).toHaveBeenCalled();
  });

  it('rend le résultat quand l’action réussit', async () => {
    const action = vi.fn(async () => ({ ok: true }));
    render(<Harness action={action} />);

    fireEvent.click(screen.getByText('lancer'));

    await waitFor(() => expect(outcome).toEqual({ ok: true }));
    expect(toastSuccess).toHaveBeenCalledWith('Fait');
  });

  it('rend null quand l’action lève (réseau coupé)', async () => {
    const action = vi.fn(async (): Promise<{ ok: boolean; error?: string }> => {
      throw new Error('connect ECONNREFUSED');
    });
    render(<Harness action={action} />);

    fireEvent.click(screen.getByText('lancer'));

    await waitFor(() => expect(outcome).toBe(null));
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
