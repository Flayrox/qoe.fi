// @vitest-environment jsdom
// =====================================================================
// 🧪 Inscriptions — une suppression refusée remet l'invitation en place
// =====================================================================
// `handleDelete` retirait la ligne de la liste avant de demander la
// suppression, et ne la remettait jamais : sur refus (garde, réseau, capacité),
// le message d'erreur s'affichait sous une liste qui n'avait plus l'adresse.
// L'invitation restait valide côté serveur, mais l'écran affirmait le
// contraire — et un second clic sur « Inviter » ne changeait rien d'autre que
// l'ordre d'affichage.
// =====================================================================

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const deleteInvite = vi.fn();

vi.mock('@/lib/admin-aux-actions', () => ({
  setRegistrationsOpenAction: async () => ({ success: true }),
  addAllowlistAction: async () => ({ success: true }),
  deleteAllowlistAction: (email: string) => deleteInvite(email),
}));

import { RegistrationsControl } from '../components/RegistrationsControl';

const entry = {
  email: 'ancien@qoe.fi',
  note: null,
  invitedBy: null,
  usedAt: null,
  usedBy: null,
  createdAt: '2026-11-01T10:00:00.000Z',
};

describe('RegistrationsControl — retrait d’une invitation', () => {
  afterEach(() => {
    cleanup();
    deleteInvite.mockReset();
    vi.unstubAllGlobals();
  });

  it('remet l’invitation quand le serveur refuse', async () => {
    deleteInvite.mockResolvedValue({ success: false, error: 'Preuve forte récente requise' });

    render(<RegistrationsControl initialOpen={false} initialAllowlist={[entry]} />);

    fireEvent.click(screen.getByTitle("Retirer l'invitation"));
    // Le retrait se confirme dans le dialogue du design system (R163).
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Retirer' })
    );

    await waitFor(() => expect(deleteInvite).toHaveBeenCalledWith('ancien@qoe.fi'));
    expect(await screen.findByText(/Preuve forte récente requise/)).toBeTruthy();
    expect(await screen.findByText('ancien@qoe.fi')).toBeTruthy();
  });
});
