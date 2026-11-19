import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  pathname: '/feed',
  refresh: vi.fn(),
  record: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock('@qoe/sdk/actions/legal', () => ({
  recordLegalConsentAction: mocks.record,
  recordCookieConsentAction: vi.fn().mockResolvedValue({ success: true }),
}));

import { LegalConsentGate } from '../legal/LegalConsentGate';
import { CookiePreferencesCenter } from '../legal/CookieConsentBanner';
import { defaultChoice } from '@qoe/utils/cookie-consent';

const PENDING = [{ slug: 'terms', title: 'Conditions', version: '2.0' }];

/** Vrai si l'élément est retiré de l'arbre d'accessibilité (inerte pour l'AT). */
function hiddenFromAssistiveTech(element: Element): boolean {
  return element.closest('[aria-hidden="true"]') !== null || element.closest('[inert]') !== null;
}

describe('⚖️ LegalConsentGate — portail de consentement', () => {
  beforeEach(() => {
    mocks.pathname = '/feed';
    mocks.refresh.mockClear();
  });

  it('s’affiche sur une route qui contient « legal » sans être une page légale', () => {
    // F132 — `pathname.includes('/legal')` masquait le portail sur toute route
    // dont un segment commence par « legal » (/legality, /legal-notice…).
    mocks.pathname = '/legality-report';
    render(<LegalConsentGate pending={PENDING} locale="fr" />);

    expect(screen.getByRole('dialog', { name: 'Mise à jour des conditions' })).not.toBeNull();
  });

  it('laisse lire les pages légales elles-mêmes', () => {
    mocks.pathname = '/legal/terms';
    render(<LegalConsentGate pending={PENDING} locale="fr" />);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('concentre le focus dans le portail et rend la page inerte', async () => {
    // F133 — `aria-modal="true"` était déclaré sans modalité réelle : le focus
    // restait dans la page, et un lecteur d'écran continuait à la parcourir.
    const { container } = render(
      <>
        <main>
          <button type="button">contenu derrière</button>
        </main>
        <LegalConsentGate pending={PENDING} locale="fr" />
      </>
    );

    const dialog = await screen.findByRole('dialog', { name: 'Mise à jour des conditions' });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    // La page derrière n'est plus parcourable : le bouton existe toujours dans
    // le DOM, mais il est retiré de l'arbre d'accessibilité.
    expect(hiddenFromAssistiveTech(screen.getByText('contenu derrière'))).toBe(true);
    expect(hiddenFromAssistiveTech(container)).toBe(true);
    // Le portail ne se referme pas par accident : une acceptation est requise.
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Mise à jour des conditions' })).not.toBeNull();
  });
});

describe('🍪 CookiePreferencesCenter — modalité', () => {
  function renderCenter(onClose = vi.fn()) {
    render(
      <CookiePreferencesCenter
        locale="fr"
        choice={defaultChoice()}
        onToggle={() => {}}
        onSave={() => {}}
        onAcceptAll={() => {}}
        onRejectAll={() => {}}
        onClose={onClose}
      />
    );
    return { onClose };
  }

  it('prend le focus et se referme à Échap', async () => {
    // F133 — même famille : `role="dialog"` posé à la main, sans piège du
    // focus ni fermeture au clavier.
    const { onClose } = renderCenter();

    const dialog = screen.getByRole('dialog', { name: 'Préférences de traceurs' });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
