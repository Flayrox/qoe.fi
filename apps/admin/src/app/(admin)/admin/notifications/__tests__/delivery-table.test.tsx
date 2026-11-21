// @vitest-environment jsdom
// =====================================================================
// 🧪 Livraisons — une relance refusée n'est pas une relance faite
// =====================================================================
// `retry` ignorait le retour de la server-action : un refus (capacité,
// preuve forte, route absente) s'affichait « Livraison … relancée », la ligne
// passait en QUEUED et l'erreur disparaissait — l'opérateur croyait l'e-mail
// reparti alors que rien n'avait été réarmé.
// =====================================================================

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const retryDelivery = vi.fn();
const refresh = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock('@/lib/admin-aux-actions', () => ({
  retryNotificationDeliveryAction: (id: string) => retryDelivery(id),
  batchRetryDeliveriesAction: async () => ({ success: true, retriedCount: 0 }),
}));
vi.mock('@/components/security/step-up', () => ({ requestStepUp: vi.fn(async () => false) }));
vi.mock('@qoe/ui/toast', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { DeliveryTable } from '../DeliveryTable';

const failedRow = {
  id: 'dlv_123456789',
  recipient: 'lecteur@qoe.test',
  status: 'FAILED',
  channel: 'email',
  attempts: 3,
  provider: 'smtp',
  lastError: '550 mailbox unavailable',
  createdAt: '2026-11-20T10:00:00.000Z',
  notification: { type: 'article.published', articleTitle: 'Un titre' },
};

describe('DeliveryTable — relance unitaire', () => {
  afterEach(() => {
    cleanup();
    retryDelivery.mockReset();
    refresh.mockReset();
  });

  it('affiche le refus et garde la ligne en échec', async () => {
    retryDelivery.mockResolvedValue({
      success: false,
      error: 'Preuve forte récente requise',
      code: 'needs_step_up',
    });

    render(<DeliveryTable rows={[failedRow]} />);

    // La relance part du menu de ligne (clic droit), comme à l'usage.
    fireEvent.contextMenu(screen.getByText('lecteur@qoe.test'));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Relancer l’envoi/ }));

    await waitFor(() => expect(retryDelivery).toHaveBeenCalledWith('dlv_123456789'));
    const status = await screen.findByRole('status');
    expect(status.textContent).toContain('Preuve forte récente requise');
    expect(status.textContent).not.toContain('relancée');
    expect(screen.getByText('Échec')).toBeTruthy();
  });
});
