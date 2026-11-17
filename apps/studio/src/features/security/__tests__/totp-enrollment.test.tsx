// @vitest-environment jsdom
// =====================================================================
// 🧪 TotpEnrollment — enrôler un second facteur sans se faire piéger
// =====================================================================
// Le parcours affiche un QR code fourni par le fournisseur d'identité et
// valide le code depuis le navigateur (seul moyen de passer la session en
// `aal2`). On vérifie les états réels, le refus d'un QR porteur de code, et
// ce qui est envoyé au fournisseur.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const settingsActions = vi.hoisted(() => ({ enrollAccountSecurityMfaAction: vi.fn() }));
const supabaseClient = vi.hoisted(() => ({
  auth: { mfa: { challengeAndVerify: vi.fn() } },
}));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));

vi.mock('@/features/settings/actions', () => settingsActions);
vi.mock('@/lib/supabase/client', () => ({ createClient: () => supabaseClient }));
vi.mock('@qoe/ui/toast', () => ({ toast: toastMock }));

import { TotpEnrollment } from '../totp-enrollment';

const QR = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="8" height="8"/></svg>';

function enrollResult(overrides: Record<string, unknown> = {}) {
  return {
    id: 'factor-1',
    totp: {
      qr_code: QR,
      secret: 'JBSWY3DPEHPK3PXP',
      uri: 'otpauth://totp/qoe?secret=JBSWY3DPEHPK3PXP',
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  settingsActions.enrollAccountSecurityMfaAction.mockResolvedValue(enrollResult());
  supabaseClient.auth.mfa.challengeAndVerify.mockResolvedValue({ error: null });
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

afterEach(() => {
  cleanup();
});

describe('TotpEnrollment', () => {
  it('crée le facteur puis affiche le QR, le secret et le lien', async () => {
    render(<TotpEnrollment onVerified={vi.fn()} />);

    expect(screen.getByText('Préparation du facteur…')).toBeDefined();

    await waitFor(() => expect(document.querySelector('div.w-44 svg')).not.toBeNull());
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeDefined();
    expect(screen.getByRole('button', { name: /Copier le lien otpauth/ })).toBeDefined();
    expect(settingsActions.enrollAccountSecurityMfaAction).toHaveBeenCalledTimes(1);
  });

  it('refuse d’afficher un QR porteur de code et propose le repli manuel', async () => {
    settingsActions.enrollAccountSecurityMfaAction.mockResolvedValue(
      enrollResult({
        totp: {
          qr_code: '<svg onload="alert(1)"><script>alert(2)</script></svg>',
          secret: 'SECRET2',
          uri: 'otpauth://totp/qoe?secret=SECRET2',
        },
      })
    );
    render(<TotpEnrollment onVerified={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('SECRET2')).toBeDefined());
    // La zone du QR reste vide : aucun SVG n'y est injecté.
    expect(document.querySelector('div.w-44')).toBeNull();
    expect(screen.getByText(/Ajoutez le compte à la main/)).toBeDefined();
  });

  it('copie le secret', async () => {
    render(<TotpEnrollment onVerified={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Copier$/ }));

    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('JBSWY3DPEHPK3PXP')
    );
    expect(toastMock.success).toHaveBeenCalledWith('Secret copié.');
  });

  it('exige six chiffres avant de vérifier', async () => {
    render(<TotpEnrollment onVerified={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeDefined());

    const input = screen.getByLabelText('Code à 6 chiffres');
    fireEvent.change(input, { target: { value: '123' } });

    expect((screen.getByRole('button', { name: 'Vérifier' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(supabaseClient.auth.mfa.challengeAndVerify).not.toHaveBeenCalled();
  });

  it('ignore les caractères non numériques saisis', async () => {
    render(<TotpEnrollment onVerified={vi.fn()} />);
    await waitFor(() => expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeDefined());

    const input = screen.getByLabelText('Code à 6 chiffres') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '12a34b56' } });

    expect(input.value).toBe('123456');
  });

  it('vérifie le code auprès du fournisseur puis signale la réussite', async () => {
    const onVerified = vi.fn();
    render(<TotpEnrollment onVerified={onVerified} />);
    await waitFor(() => expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeDefined());

    fireEvent.change(screen.getByLabelText('Code à 6 chiffres'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier' }));

    await waitFor(() =>
      expect(supabaseClient.auth.mfa.challengeAndVerify).toHaveBeenCalledWith({
        factorId: 'factor-1',
        code: '123456',
      })
    );
    expect(onVerified).toHaveBeenCalledTimes(1);
  });

  it('affiche le refus du code et vide le champ', async () => {
    supabaseClient.auth.mfa.challengeAndVerify.mockResolvedValue({
      error: { message: 'Code invalide' },
    });
    const onVerified = vi.fn();
    render(<TotpEnrollment onVerified={onVerified} />);
    await waitFor(() => expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeDefined());

    const input = screen.getByLabelText('Code à 6 chiffres') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Vérifier' }));

    await waitFor(() => expect(screen.getByText('Code invalide')).toBeDefined());
    expect(input.value).toBe('');
    expect(onVerified).not.toHaveBeenCalled();
  });

  it('reprend un facteur existant sans en créer un nouveau', async () => {
    render(<TotpEnrollment factorId="factor-9" onVerified={vi.fn()} />);

    expect(screen.getByLabelText('Code à 6 chiffres')).toBeDefined();
    expect(settingsActions.enrollAccountSecurityMfaAction).not.toHaveBeenCalled();
    expect(screen.queryByText('Préparation du facteur…')).toBeNull();
  });

  it('affiche l’erreur de création et permet de réessayer', async () => {
    settingsActions.enrollAccountSecurityMfaAction.mockRejectedValueOnce(
      new Error('Fournisseur indisponible')
    );
    render(<TotpEnrollment onVerified={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('Fournisseur indisponible')).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /Réessayer/ }));

    await waitFor(() =>
      expect(settingsActions.enrollAccountSecurityMfaAction).toHaveBeenCalledTimes(2)
    );
    await waitFor(() => expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeDefined());
  });

  it('propose d’annuler quand le parcours peut être quitté', async () => {
    const onCancel = vi.fn();
    render(<TotpEnrollment factorId="factor-9" onVerified={vi.fn()} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
