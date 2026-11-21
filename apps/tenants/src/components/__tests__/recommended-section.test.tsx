// @vitest-environment jsdom
// =====================================================================
// 🧪 RecommendedSection — lien stable au rendu + refus qui se voit
// =====================================================================
// Rouge mesuré avant correctif :
//  1. `window.location.host` était lu PENDANT le rendu : le serveur peignait
//     `href="#"` et le client une URL absolue — deux arbres différents, donc
//     une erreur d'hydratation (et un lien mort pour les crawlers).
//  2. `if (res.ok)` sans `else` : un refus d'abonnement (email invalide,
//     cadence) ne produisait aucun message — la modale restait ouverte sans
//     explication.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { toastError, subscribeAction } = vi.hoisted(() => ({
  toastError: vi.fn(),
  subscribeAction: vi.fn(async () => ({ ok: false, error: { message: 'Adresse invalide' } })),
}));

vi.mock('@qoe/ui/toast', () => ({ toast: { error: toastError, success: vi.fn() } }));
vi.mock('@qoe/sdk/actions/tenant', () => ({ subscribeToNewsletterAction: subscribeAction }));
vi.mock('@qoe/ui', () => ({ SafeAvatar: () => null }));

import { RecommendedSection } from '../RecommendedSection';

const PUB = {
  id: 'pub_1',
  name: 'Le Média',
  slug: 'le-media',
  subdomain: 'le-media',
  customDomain: null,
  logoUrl: null,
  description: 'Un média',
  articlesCount: 3,
  subscribersCount: 12,
};

describe('RecommendedSection', () => {
  beforeEach(() => {
    toastError.mockClear();
    subscribeAction.mockClear();
  });
  afterEach(() => cleanup());

  // Le lien est calculé depuis l'hôte lu APRÈS hydratation (effet) : un test
  // jsdom de `renderToString` ne peut pas prouver la divergence d'hydratation
  // (window y existe pendant le rendu serveur). Constat documenté, non concluant.

  it('affiche le refus d’abonnement au lieu de ne rien dire', async () => {
    render(<RecommendedSection recommendations={[PUB]} />);

    fireEvent.click(screen.getByRole('button', { name: /S'abonner/ }));
    fireEvent.change(screen.getByPlaceholderText(/Votre adresse email/), {
      target: { value: 'lecteur@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Confirmer l'abonnement/ }));

    await waitFor(() => expect(subscribeAction).toHaveBeenCalled());
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Adresse invalide'));
  });
});
