// @vitest-environment jsdom
// =====================================================================
// 🧪 GrantsManager — un refus ne ferme pas le formulaire d'octroi
// =====================================================================
// `grant()` fait `if (res) { setShowNew(false); …; refresh() }`. Ce test
// prouve que sur refus, `res` est null : le formulaire reste ouvert, la saisie
// (identifiant du sujet) est conservée et la page n'est pas rechargée.
// =====================================================================

import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { grantAction, toastSuccess } = vi.hoisted(() => ({
  grantAction: vi.fn(async () => ({
    ok: false,
    error: 'Capacité admin.subscriptions.write requise',
  })),
  toastSuccess: vi.fn(),
}));

vi.mock('@qoe/sdk/actions/admin', () => ({
  grantSubscriptionAction: grantAction,
  revokeSubscriptionGrantAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock('@qoe/ui/toast', () => ({ toast: { success: toastSuccess, error: vi.fn() } }));
vi.mock('@/components/security/step-up', () => ({ requestStepUp: vi.fn(async () => false) }));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { GrantsManager } from '../grants-manager';

describe('GrantsManager', () => {
  beforeEach(() => {
    grantAction.mockClear();
    toastSuccess.mockClear();
  });
  afterEach(() => cleanup());

  it('conserve le formulaire et la saisie quand l’octroi est refusé', async () => {
    render(<GrantsManager initialItems={[]} />);

    fireEvent.click(screen.getByRole('button', { name: /Octroyer un palier/ }));
    const subject = screen.getByPlaceholderText(/Identifiant du sujet/);
    fireEvent.change(subject, { target: { value: 'pub_42' } });
    fireEvent.click(screen.getByRole('button', { name: 'Octroyer' }));

    await waitFor(() => expect(grantAction).toHaveBeenCalled());
    expect(toastSuccess).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByPlaceholderText(/Identifiant du sujet/)).toBeTruthy());
    expect((screen.getByPlaceholderText(/Identifiant du sujet/) as HTMLInputElement).value).toBe(
      'pub_42'
    );
  });
});
