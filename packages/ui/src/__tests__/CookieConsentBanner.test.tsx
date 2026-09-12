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

// Ces tests couvrent le régime « consentement », conservé pour un éventuel
// fournisseur non exempté. Le régime par défaut (exempté) est testé plus bas.
describe('🍪 CookieConsentBanner — régime consentement', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_ANALYTICS_MODE = 'consent';
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

describe('📊 CookieConsentBanner — régime exempté (défaut)', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_ANALYTICS_MODE = 'exempt';
    window.localStorage.clear();
    document.cookie = `${COOKIE_CONSENT_COOKIE}=; Max-Age=0; Path=/`;
    mocks.record.mockClear();
    mocks.recordCookie.mockClear();
    mocks.refresh.mockClear();
  });

  it('n’affiche plus de bannière bloquante', async () => {
    render(<CookieConsentBanner locale="fr" />);
    // L'avis n'est pas un dialogue : rien n'est suspendu à un clic.
    expect(await screen.findByText('Mesure d’audience sans cookie')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Tout accepter' })).toBeNull();
  });

  it('coupe la mesure d’audience et journalise l’opposition', async () => {
    render(<CookieConsentBanner locale="fr" />);
    fireEvent.click(await screen.findByRole('button', { name: 'M’y opposer' }));

    await waitFor(() => expect(readLocalConsent()?.analytics).toBe(false));
    await waitFor(() => expect(mocks.recordCookie).toHaveBeenCalledTimes(1));
    const payload = mocks.recordCookie.mock.calls[0][0];
    expect(payload.source).toBe('exempt-objection');
    expect(payload.categories.analytics).toBe(false);
    // Le script Umami relit cette clé avant chaque envoi.
    expect(window.localStorage.getItem('umami.disabled')).toBe('true');
  });

  it('une prise de connaissance suffit à ne plus solliciter la personne', async () => {
    render(<CookieConsentBanner locale="fr" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Compris, masquer' }));

    await waitFor(() => expect(screen.queryByText('Mesure d’audience sans cookie')).toBeNull());
    expect(readLocalConsent()?.analytics).toBe(true);
    expect(mocks.recordCookie.mock.calls[0][0].source).toBe('exempt-notice');
  });

  it('garde le centre de préférences accessible et explique la dispense', async () => {
    render(<CookieConsentBanner locale="fr" />);
    fireEvent.click(await screen.findByRole('button', { name: 'En savoir plus' }));

    await screen.findByRole('dialog', { name: 'Préférences de traceurs' });
    expect(screen.getAllByText('Dispensée de consentement').length).toBeGreaterThan(0);
  });

  it('un refus antérieur au passage en mode exempté reste un refus', async () => {
    window.localStorage.setItem(
      COOKIE_CONSENT_KEY,
      JSON.stringify({
        version: '1.0',
        analytics: false,
        functional: false,
        marketing: false,
        decidedAt: new Date().toISOString(),
      })
    );
    render(<CookieConsentBanner locale="fr" />);
    // Un choix existe déjà : on ne redemande rien, et la mesure reste coupée.
    expect(screen.queryByText('Mesure d’audience sans cookie')).toBeNull();
    expect(readLocalConsent()?.analytics).toBe(false);
  });
});
