// @vitest-environment jsdom
// =====================================================================
// 🧪 Cockpit sécurité — un recalcul qui échoue ne fige pas l'écran
// =====================================================================
// `handleRecompute` n'avait ni `try` ni `finally` : une action qui LÈVE
// (réseau, garde hors enveloppe) laissait `isSubmitting` à `true`, donc le
// bouton et le champ définitivement désactivés, sans message. Et un échec dont
// `error` est un objet faisait rendre cet objet à React.
// =====================================================================

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const recompute = vi.fn();

vi.mock('@/lib/admin-security-actions', () => ({
  recomputeUserTrustAction: (...args: unknown[]) => recompute(...(args as [])),
}));
vi.mock('@/lib/authz-feedback', async () => {
  const actual = await import('@/lib/authz-feedback');
  return { ...actual, notifyActionFailure: () => undefined };
});
vi.mock('@qoe/ui/toast', () => ({
  toast: { error: () => undefined, success: () => undefined },
}));
vi.mock('@/components/shell/DataGrid', () => ({ DataGrid: () => null }));
vi.mock('@/components/shell/CopyableId', () => ({ CopyableId: () => null }));

import { SecurityCockpit } from '../SecurityCockpit';

const overview = {
  authzEnforceEnabled: true,
  shadowbannedCount: 0,
  suspendedCount: 0,
  metrics: {
    openQueue: 0,
    humanReviews: 0,
    humanDismissed: 0,
    dismissalRate: 0.1,
    topSubjects: [],
  },
  policyV3: [],
} as unknown as Parameters<typeof SecurityCockpit>[0]['overview'];

function submit(userId: string) {
  fireEvent.change(screen.getByLabelText('Identifiant utilisateur pour recalcul Trust'), {
    target: { value: userId },
  });
  fireEvent.click(screen.getByRole('button', { name: /Recalculer Trust|Recalcul/ }));
}

describe('SecurityCockpit — recalcul Trust', () => {
  afterEach(() => {
    cleanup();
    recompute.mockReset();
  });

  it('rend la main et dit l’erreur quand l’action lève', async () => {
    recompute.mockRejectedValue(new Error('Réseau coupé'));
    render(<SecurityCockpit overview={overview} canDecide />);

    submit('00000000-0000-0000-0000-000000000001');

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Réseau coupé');
    const button = screen.getByRole('button', { name: /Recalculer Trust/ });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  });

  it('affiche le message d’un échec dont `error` est un objet', async () => {
    recompute.mockResolvedValue({ success: false, error: { message: 'Refus du garde' } });
    render(<SecurityCockpit overview={overview} canDecide />);

    submit('00000000-0000-0000-0000-000000000002');

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Refus du garde');
  });
});
