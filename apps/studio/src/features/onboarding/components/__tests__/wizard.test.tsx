// @vitest-environment jsdom
// =====================================================================
// 🧪 OnboardingWizard — la touche Entrée ne doit pas avaler le clavier
// =====================================================================
// L'écouteur global intercepte Entrée partout dans la fenêtre et appelle
// `preventDefault()`. Résultat : sur le lien d'un document légal, Entrée ne
// suit plus le lien — elle crée l'espace à la place. Un utilisateur au
// clavier ne peut donc pas lire ce qu'il accepte.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const dashboardActions = vi.hoisted(() => ({
  checkSubdomainAvailabilityAction: vi.fn(),
  completeOnboardingAction: vi.fn(),
}));
const legalActions = vi.hoisted(() => ({ acceptLegalConsentsAction: vi.fn() }));

vi.mock('@qoe/sdk/actions/dashboard', () => dashboardActions);
vi.mock('@qoe/sdk/actions/legal', () => legalActions);
vi.mock('@qoe/config/legal', () => ({
  getLegalDocumentUrl: (slug: string) => `https://qoe.test/legal/${slug}`,
}));
vi.mock('@qoe/ui/toast', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { OnboardingWizard } from '../wizard';

const CONSENT = [
  { slug: 'creator-terms', title: 'Accord créateur', version: '1', versionId: 'v1' },
];

beforeEach(() => {
  vi.clearAllMocks();
  dashboardActions.checkSubdomainAvailabilityAction.mockResolvedValue({
    ok: true,
    data: { available: true },
  });
  dashboardActions.completeOnboardingAction.mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
});

describe('OnboardingWizard', () => {
  it('laisse Entrée activer le lien d’un document légal', () => {
    render(<OnboardingWizard initialName="Alex" consentDocuments={CONSENT as never} locale="fr" />);

    const link = screen.getByRole('link', { name: 'Accord créateur' });
    const notPrevented = fireEvent.keyDown(link, { key: 'Enter' });

    expect(notPrevented).toBe(true);
    expect(dashboardActions.completeOnboardingAction).not.toHaveBeenCalled();
  });

  it('lance la création quand Entrée vient du champ du nom', async () => {
    render(<OnboardingWizard initialName="Alex" consentDocuments={CONSENT as never} locale="fr" />);

    fireEvent.keyDown(screen.getByPlaceholderText('Ton nom ou pseudo'), { key: 'Enter' });

    await waitFor(() => expect(dashboardActions.completeOnboardingAction).toHaveBeenCalled());
  });
});
