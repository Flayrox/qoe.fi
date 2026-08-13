// =====================================================================
// 🧪 PaywallCut — component test
// =====================================================================
// 📖 Le composant client qui rend le contenu tronqué serveur + l'overlay
//    de déverrouillage. Teste les branches critiques :
//    - rendu teaser si pas premium
//    - redirect login si non connecté
//    - message INSUFFICIENT_FUNDS
//    - reload si succès
// =====================================================================

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mocks = vi.hoisted(() => ({
  unlockArticleWithWalletAction: vi.fn(),
  getCurrentUserWalletAction: vi.fn(),
}));

vi.mock('@qoe/api-client/actions/tenant', () => ({
  unlockArticleWithWalletAction: mocks.unlockArticleWithWalletAction,
  getCurrentUserWalletAction: mocks.getCurrentUserWalletAction,
}));

import { PaywallCut } from '@/app/tenant/[domain]/article/[slug]/PaywallCut';

const baseProps = {
  contentHtml: '<p>Teaser content</p>',
  isPremium: true,
  name: 'My Publication',
  isBrutalist: false,
  accentColor: '#EE4B2B',
  mainAppUrl: 'https://qoe.fi',
  creatorId: 'u-creator-1',
};

describe('PaywallCut', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no logged-in user
    mocks.getCurrentUserWalletAction.mockResolvedValue({
      ok: false,
      data: null,
      error: null,
    });
    // Reset window.location between tests (reload/redirect side effects)
    Object.defineProperty(window, 'location', {
      value: { ...window.location, href: 'https://test.qoe.fi/article/test' },
      writable: true,
      configurable: true,
    });
  });

  it("rend le contenu complet quand l'article n'est pas premium", () => {
    render(<PaywallCut {...baseProps} isPremium={false} />);

    // Le contenu teaser est rendu, PAS d'overlay paywall
    expect(screen.getByText('Teaser content')).toBeInTheDocument();
    expect(screen.queryByText('Histoire Premium')).not.toBeInTheDocument();
    expect(screen.queryByText('Débloquer pour 2,00 €')).not.toBeInTheDocument();
  });

  it("rend l'overlay paywall avec le bouton de déverrouillage pour un article premium", () => {
    render(<PaywallCut {...baseProps} />);

    expect(screen.getByText('Histoire Premium')).toBeInTheDocument();
    expect(screen.getByText('Débloquer pour 2,00 €')).toBeInTheDocument();
    expect(screen.getByText("Voir les formules d'abonnement")).toBeInTheDocument();
  });

  it("redirige vers le login si l'utilisateur n'est pas connecté et clique Débloquer", async () => {
    mocks.getCurrentUserWalletAction.mockResolvedValue({ ok: false, data: null, error: null });
    render(<PaywallCut {...baseProps} />);

    await waitFor(() => expect(mocks.getCurrentUserWalletAction).toHaveBeenCalled());

    const user = userEvent.setup();
    await user.click(screen.getByText('Débloquer pour 2,00 €'));

    // window.location.href doit être mis à jour avec le redirect login
    expect(window.location.href).toContain('/login?redirect=');
    expect(mocks.unlockArticleWithWalletAction).not.toHaveBeenCalled();
  });

  it('affiche le message de solde insuffisant', async () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, href: 'https://test.qoe.fi/article/x', reload: reloadMock },
      writable: true,
      configurable: true,
    });

    mocks.getCurrentUserWalletAction.mockResolvedValue({
      ok: true,
      data: { walletBalanceCents: 50, name: 'Jean' },
      error: null,
    });
    mocks.unlockArticleWithWalletAction.mockResolvedValue({
      ok: false,
      data: null,
      error: { code: 'INSUFFICIENT_FUNDS', message: 'Soldes insuffisants' },
    });

    render(<PaywallCut {...baseProps} />);
    await waitFor(() => expect(mocks.getCurrentUserWalletAction).toHaveBeenCalled());

    const user = userEvent.setup();
    await user.click(screen.getByText('Débloquer pour 2,00 €'));

    await waitFor(() =>
      expect(screen.getByText(/Solde insuffisant dans votre portefeuille/)).toBeInTheDocument()
    );
    // Pas de reload en erreur
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('reload la page après un déverrouillage réussi', async () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, href: 'https://test.qoe.fi/article/x', reload: reloadMock },
      writable: true,
      configurable: true,
    });

    mocks.getCurrentUserWalletAction.mockResolvedValue({
      ok: true,
      data: { walletBalanceCents: 2000, name: 'Jean' },
      error: null,
    });
    mocks.unlockArticleWithWalletAction.mockResolvedValue({
      ok: true,
      data: { success: true },
      error: null,
    });

    render(<PaywallCut {...baseProps} />);
    await waitFor(() => expect(mocks.getCurrentUserWalletAction).toHaveBeenCalled());

    const user = userEvent.setup();
    await user.click(screen.getByText('Débloquer pour 2,00 €'));

    await waitFor(() => expect(reloadMock).toHaveBeenCalled());
  });

  it('affiche le solde du portefeuille quand connecté', async () => {
    mocks.getCurrentUserWalletAction.mockResolvedValue({
      ok: true,
      data: { walletBalanceCents: 1234, name: 'Jean' },
      error: null,
    });

    render(<PaywallCut {...baseProps} />);

    await waitFor(() => expect(screen.getByText(/Solde actuel : 12\.34 €/)).toBeInTheDocument());
    expect(screen.getByText(/Connecté en tant que/)).toBeInTheDocument();
  });
});
