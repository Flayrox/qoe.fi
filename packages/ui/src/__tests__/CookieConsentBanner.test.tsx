import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  record: vi.fn().mockResolvedValue({ success: true }),
  recordCookie: vi.fn().mockResolvedValue({ success: true, id: 'rec-1' }),
  refresh: vi.fn(),
}));

vi.mock('@qoe/sdk/actions/legal', () => ({
  recordLegalConsentAction: mocks.record,
  recordCookieConsentAction: mocks.recordCookie,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

import { CookieConsentBanner } from '../legal/CookieConsentBanner';
import { openCookiePreferences, readLocalConsent } from '../legal/cookie-consent-storage';
import { COOKIE_CONSENT_COOKIE, COOKIE_CONSENT_KEY } from '@qoe/utils/cookie-consent';

// localStorage de Node 22 sans --localstorage-file shadowe celui de jsdom :
// on installe un stockage mémoire minimal pour tester la persistance.
if (!window.localStorage) {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      get length() {
        return store.size;
      },
    },
  });
}

describe('🍪 CookieConsentBanner', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.cookie = `${COOKIE_CONSENT_COOKIE}=; Max-Age=0; Path=/`;
    mocks.record.mockClear();
    mocks.recordCookie.mockClear();
    mocks.refresh.mockClear();
  });

  it('affiche la bannière au premier passage', async () => {
    render(<CookieConsentBanner locale="fr" />);
    expect(await screen.findByRole('dialog')).not.toBeNull();
  });

  it('propose refuser au même niveau qu’accepter', async () => {
    render(<CookieConsentBanner locale="fr" />);
    const accept = await screen.findByRole('button', { name: 'Tout accepter' });
    const refuse = screen.getByRole('button', { name: 'Tout refuser' });
    expect(accept.className).toContain('bg-foreground');
    expect(refuse.className).toContain('border');
  });

  it('refuse : enregistre le refus, masque la bannière et journalise le choix', async () => {
    render(<CookieConsentBanner locale="fr" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tout refuser' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(readLocalConsent()?.analytics).toBe(false);
    expect(window.localStorage.getItem(COOKIE_CONSENT_KEY)).toContain('"analytics":false');
    await waitFor(() => expect(mocks.recordCookie).toHaveBeenCalledTimes(1));
    // 🧾 La preuve serveur porte la catégorie refusée et un identifiant de
    // consentement — sans compte, c'est la seule trace opposable.
    const payload = mocks.recordCookie.mock.calls[0][0];
    expect(payload.categories).toEqual({
      necessary: true,
      analytics: false,
      functional: false,
      marketing: false,
    });
    expect(payload.source).toBe('cookie-banner');
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it('accepte : active la mesure d’audience uniquement', async () => {
    render(<CookieConsentBanner locale="fr" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tout accepter' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const stored = readLocalConsent();
    expect(stored?.analytics).toBe(true);
    expect(stored?.functional).toBe(true);
    // Aucune publicité comportementale n'existe : jamais activée.
    expect(stored?.marketing).toBe(false);
  });

  it('ne réaffiche pas la bannière quand un choix récent existe déjà', async () => {
    render(<CookieConsentBanner locale="fr" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tout refuser' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    render(<CookieConsentBanner locale="fr" />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('bascule la copie en anglais quand la locale le demande', async () => {
    render(<CookieConsentBanner locale="en" />);
    expect(await screen.findByRole('dialog', { name: 'Cookie preferences' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Reject all' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Accept all' })).not.toBeNull();
  });

  it('se rouvre via « Gérer mes cookies »', async () => {
    render(<CookieConsentBanner locale="fr" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tout refuser' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    act(() => openCookiePreferences());
    expect(await screen.findByRole('dialog')).not.toBeNull();
  });

  it('ouvre le centre de préférences avec les catégories et le registre de traceurs', async () => {
    render(<CookieConsentBanner locale="fr" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Personnaliser' }));

    const center = await screen.findByRole('dialog', { name: 'Préférences de traceurs' });
    expect(center).not.toBeNull();
    // Les quatre catégories sont expliquées, y compris celle qui ne sert pas
    // encore (publicité) : c'est la transparence qui rend le choix crédible.
    expect(screen.getByText('Strictement nécessaires')).not.toBeNull();
    expect(screen.getByText('Mesure d’audience')).not.toBeNull();
    expect(screen.getByText('Préférences de confort')).not.toBeNull();
    expect(screen.getByText('Publicité et réseaux sociaux')).not.toBeNull();
    // Le registre affiche les traceurs réellement déposés.
    expect(screen.getByText('umami')).not.toBeNull();
    // Catégorie repliée par défaut : on la déplie pour vérifier le registre.
    fireEvent.click(screen.getAllByRole('button', { name: /Traceurs de cette catégorie/ })[0]);
    expect(await screen.findByText('qoe_cookie_consent')).not.toBeNull();
  });

  it('permet de n’accepter qu’une seule catégorie optionnelle', async () => {
    render(<CookieConsentBanner locale="fr" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Personnaliser' }));
    await screen.findByRole('dialog', { name: 'Préférences de traceurs' });

    // Seule la mesure d’audience est cochée, puis enregistrée.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mesure d’audience' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer mes choix' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const stored = readLocalConsent();
    expect(stored?.analytics).toBe(true);
    expect(stored?.functional).toBe(false);
    expect(mocks.recordCookie).toHaveBeenCalledTimes(1);
    expect(mocks.recordCookie.mock.calls[0][0].categories.analytics).toBe(true);
    expect(mocks.recordCookie.mock.calls[0][0].categories.functional).toBe(false);
  });
});
