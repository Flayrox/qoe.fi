// @vitest-environment jsdom
// =====================================================================
// 🧪 Placements — une action qui lève ne reste pas sans réponse
// =====================================================================
// Les trois gestes (créer, basculer, supprimer) appelaient la server-action
// directement dans une transition : un rejet — réseau, garde hors enveloppe —
// partait en rejet non géré. Rien à l'écran : ni message, ni ligne modifiée,
// ni trace que l'acte n'avait pas eu lieu.
// =====================================================================

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const createPlacement = vi.fn();
const toastError = vi.fn();

vi.mock('@/lib/admin-aux-actions', () => ({
  createPlacementAdminAction: (input: unknown) => createPlacement(input),
  updatePlacementAdminAction: async () => ({ success: true }),
  deletePlacementAdminAction: async () => ({ success: true }),
}));
vi.mock('@qoe/ui/toast', () => ({
  toast: { error: (...args: unknown[]) => toastError(...args), success: vi.fn() },
}));

import { PlacementsManager } from '../PlacementsManager';

describe('PlacementsManager — création', () => {
  afterEach(() => {
    cleanup();
    createPlacement.mockReset();
    toastError.mockReset();
  });

  it('dit l’erreur quand la création lève', async () => {
    createPlacement.mockRejectedValue(new Error('Réseau coupé'));

    render(<PlacementsManager initialPlacements={[]} />);

    fireEvent.click(screen.getByRole('button', { name: /Nouveau placement/ }));
    fireEvent.click(screen.getByRole('button', { name: /Déployer sur la plateforme/ }));

    await waitFor(() => expect(createPlacement).toHaveBeenCalled());
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(String(toastError.mock.calls[0]?.[0])).toContain('Réseau coupé');
  });
});
