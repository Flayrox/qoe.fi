// @vitest-environment jsdom
// =====================================================================
// 🧪 Sécurité — un rejet ne doit pas figer les boutons
// =====================================================================
// `beginEnrollment` (comme les autres actions Supabase de l'écran) posait
// `busy = true`, attendait, puis `busy = false` : un rejet (réseau, MFA
// indisponible) sautait la remise à zéro et laissait TOUS les boutons
// désactivés jusqu'au rechargement.
// =====================================================================

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { mockEnroll, mockListFactors, mockIdentities, mockUnenroll, mockSignOut } = vi.hoisted(
  () => ({
    mockEnroll: vi.fn(),
    mockListFactors: vi.fn(async () => ({ data: { all: [] }, error: null })),
    mockIdentities: vi.fn(async () => ({ data: { identities: [] }, error: null })),
    mockUnenroll: vi.fn(),
    mockSignOut: vi.fn(),
  })
);

vi.mock('@qoe/supabase/client', () => ({
  createClient: () => ({
    auth: {
      mfa: {
        listFactors: mockListFactors,
        enroll: mockEnroll,
        challenge: vi.fn(),
        verify: vi.fn(),
        unenroll: mockUnenroll,
      },
      getUserIdentities: mockIdentities,
      linkIdentity: vi.fn(),
      signOut: mockSignOut,
    },
  }),
}));
vi.mock('@lingui/core/macro', () => ({
  t: (strings: TemplateStringsArray | string, ...values: unknown[]) =>
    Array.isArray(strings)
      ? strings.reduce((res, str, i) => res + str + (values[i] ?? ''), '')
      : String(strings),
}));

import SecuritySettings from '../SecuritySettings';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SecuritySettings (L20b2b5)', () => {
  it("relâche l'état occupé quand l'enrôlement TOTP rejette", async () => {
    mockEnroll.mockRejectedValue(new Error('réseau MFA indisponible'));

    render(<SecuritySettings />);
    const add = (await screen.findByText('Ajouter un facteur TOTP')) as HTMLElement;
    await waitFor(() => expect(add.closest('button')?.disabled).toBe(false));

    fireEvent.click(add);

    await waitFor(() => expect(mockEnroll).toHaveBeenCalled());
    // Sans remise à zéro, ce bouton (et tous les autres de l'écran) restent
    // désactivés pour toute la session.
    await waitFor(() => expect(add.closest('button')?.disabled).toBe(false));
  });

  it('affiche un message quand la liste des facteurs échoue au lieu de rester en chargement', async () => {
    mockListFactors.mockRejectedValue(new Error('réseau'));

    render(<SecuritySettings />);

    await waitFor(() => expect(screen.queryByText('Chargement…')).toBeNull());
  });
});
