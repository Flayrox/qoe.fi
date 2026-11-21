// @vitest-environment jsdom
// =====================================================================
// 🧪 StepUpGate — ne jamais affirmer « aucun facteur » sur une panne
// =====================================================================
// `readFactors` peut échouer (réseau, fournisseur indisponible). L'écran
// annonçait alors « Aucun facteur fort compatible n’est enregistré sur ce
// compte » : une affirmation fausse qui pousse l'utilisateur à ré-enrôler un
// facteur alors qu'il en possède un. On vérifie les deux issues.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const supabaseClient = vi.hoisted(() => ({
  auth: {
    mfa: {
      listFactors: vi.fn(),
      challengeAndVerify: vi.fn(),
    },
  },
}));
const settingsActions = vi.hoisted(() => ({ enrollAccountSecurityMfaAction: vi.fn() }));

vi.mock('@/lib/supabase/client', () => ({ createClient: () => supabaseClient }));
vi.mock('@/features/settings/actions', () => settingsActions);
vi.mock('@qoe/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { StepUpGate, requestStepUp } from '../step-up';

// jsdom + react-aria : sans ces API, la boîte de dialogue ne s'ouvre pas.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Element.prototype.scrollIntoView ??= function scrollIntoView() {};
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {
    return false;
  },
})) as typeof window.matchMedia;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('StepUpGate', () => {
  it('propose le champ de code quand un facteur vérifié existe', async () => {
    supabaseClient.auth.mfa.listFactors.mockResolvedValue({
      data: { totp: [{ id: 'f1', friendly_name: 'Téléphone' }], all: [] },
      error: null,
    });

    render(<StepUpGate />);
    void requestStepUp('Sensible');

    await waitFor(() =>
      expect(screen.getByText(/Code de votre application d’authentification/)).toBeDefined()
    );
    // Le champ n'accepte que les chiffres : le fournisseur refuse le reste et
    // l'utilisateur lit « Code refusé » pour une simple faute de frappe.
    const input = screen.getByPlaceholderText('123456');
    fireEvent.change(input, { target: { value: 'ab12cd34' } });
    expect((input as HTMLInputElement).value).toBe('1234');
  });

  it('dit la vérité quand la liste des facteurs ne peut pas être lue', async () => {
    supabaseClient.auth.mfa.listFactors.mockResolvedValue({
      data: null,
      error: { message: 'network down' },
    });

    render(<StepUpGate />);
    void requestStepUp('Sensible');

    await waitFor(() => expect(screen.getByText(/Vérification de vos facteurs/)).toBeDefined());
    await waitFor(() => expect(screen.queryByText(/Vérification de vos facteurs/)).toBeNull());

    expect(screen.queryByText(/Aucun facteur fort compatible/)).toBeNull();
    expect(screen.getByText(/Impossible de lire vos facteurs/)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeDefined();
  });
});
