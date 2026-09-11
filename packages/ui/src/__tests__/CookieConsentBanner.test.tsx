import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  record: vi.fn().mockResolvedValue({ success: true }),
  refresh: vi.fn(),
}));

vi.mock('@qoe/sdk/actions/legal', () => ({
  recordLegalConsentAction: mocks.record,
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

  it('refuse : enregistre le refus, masque la bannière et trace le choix', async () => {
    render(<CookieConsentBanner locale="fr" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Tout refuser' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(readLocalConsent()?.analytics).toBe(false);
    expect(window.localStorage.getItem(COOKIE_CONSENT_KEY)).toContain('"analytics":false');
    await waitFor(() => expect(mocks.record).toHaveBeenCalledTimes(1));
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
});
