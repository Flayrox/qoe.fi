// =====================================================================
// 🧪 MfaPanel — enrôlement TOTP et facteurs restés non vérifiés
// =====================================================================
// Un facteur créé mais jamais confirmé ne débloque aucune action sensible et
// bloque même les tentatives suivantes. L'écran doit donc le dire clairement
// et proposer la saisie du code, sans inventer d'état quand l'identité est
// injoignable.
// =====================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const listMfa = vi.fn();
const unenrollMfa = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();

vi.mock('../../actions', () => ({
  getAccountSecurityMfaAction: () => listMfa(),
  unenrollAccountSecurityMfaAction: (id: string) => unenrollMfa(id),
}));

vi.mock('@/features/security/totp-enrollment', () => ({
  TotpEnrollment: ({ factorId, onCancel }: { factorId?: string; onCancel: () => void }) => (
    <div>
      <span>Enrôlement {factorId ?? 'nouveau'}</span>
      <button type="button" onClick={onCancel}>
        Annuler l’enrôlement
      </button>
    </div>
  ),
}));

vi.mock('@qoe/ui/toast', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

import { MfaPanel } from '../mfa-panel';

const verifiedFactor = {
  id: 'f1',
  friendly_name: 'Téléphone',
  status: 'verified',
  factor_type: 'totp',
};
const pendingFactor = {
  id: 'f2',
  friendly_name: 'Nouveau',
  status: 'unverified',
  factor_type: 'totp',
};

describe('MfaPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMfa.mockResolvedValue({ all: [], totp: [] });
    unenrollMfa.mockResolvedValue({ success: true });
  });

  it('affiche l’absence de facteur et l’explication qui va avec', async () => {
    render(<MfaPanel />);

    expect(await screen.findByText(/Aucun facteur enregistré/i)).toBeDefined();
    expect(screen.getByRole('button', { name: /Activer l’authentification forte/i })).toBeDefined();
  });

  it('ne prétend pas connaître les facteurs si le fournisseur échoue', async () => {
    listMfa.mockRejectedValue(new Error('GoTrue indisponible'));

    render(<MfaPanel />);

    expect(await screen.findByText(/Aucun facteur enregistré/i)).toBeDefined();
  });

  it('liste un facteur vérifié et le retire après confirmation', async () => {
    listMfa.mockResolvedValue({ all: [verifiedFactor] });

    render(<MfaPanel />);

    expect(await screen.findByText(/Téléphone · totp/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Retirer/i }));
    expect(screen.getByText('Retirer le facteur « Téléphone » ?')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Retirer le facteur' }));

    await waitFor(() => expect(unenrollMfa).toHaveBeenCalledWith('f1'));
    expect(toastSuccess).toHaveBeenCalledWith('Facteur retiré.');
  });

  it('n’appelle pas le serveur quand le retrait est annulé', async () => {
    listMfa.mockResolvedValue({ all: [verifiedFactor] });

    render(<MfaPanel />);
    await screen.findByText(/Téléphone · totp/);
    fireEvent.click(screen.getByRole('button', { name: /Retirer/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(unenrollMfa).not.toHaveBeenCalled();
  });

  it('signale un facteur non vérifié et permet de saisir un code', async () => {
    listMfa.mockResolvedValue({ all: [pendingFactor] });

    render(<MfaPanel />);

    expect(await screen.findByText(/a été créé mais jamais vérifié/i)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Saisir un code/i }));

    expect(screen.getByText('Enrôlement f2')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Annuler l’enrôlement/i }));
    expect(screen.queryByText('Enrôlement f2')).toBeNull();
  });

  it('explique l’échec d’un retrait au lieu de laisser croire qu’il a réussi', async () => {
    listMfa.mockResolvedValue({ all: [verifiedFactor] });
    unenrollMfa.mockRejectedValue(new Error('Preuve forte expirée'));

    render(<MfaPanel />);
    await screen.findByText(/Téléphone · totp/);
    fireEvent.click(screen.getByRole('button', { name: /Retirer/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Retirer le facteur' }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Preuve forte expirée'));
    expect(toastSuccess).not.toHaveBeenCalled();
  });
});
