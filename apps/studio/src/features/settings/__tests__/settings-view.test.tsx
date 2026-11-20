// =====================================================================
// 🧪 SettingsView — les décisions de l'orchestrateur des réglages
// =====================================================================
// Trois contrats mesurés ici, sans monter les sept onglets :
//   1. tout écouteur window posé est retiré avec la même référence ;
//   2. « Voir le site » ne pointe jamais vers une publication qui n'est
//      pas la nôtre quand aucun domaine n'est configuré ;
//   3. ⌘S applique la validation que l'écran vient d'annoncer.
// =====================================================================

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const dashboard = vi.hoisted(() => ({
  updateCreatorProfileAction: vi.fn(),
  checkSubdomainAvailabilityAction: vi.fn(),
  updateSubdomainAction: vi.fn(),
  saveNavigationLinksAction: vi.fn(),
  saveSocialLinksAction: vi.fn(),
}));

vi.mock('@qoe/sdk/actions/dashboard', () => dashboard);

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
}));

vi.mock('@qoe/ui/toast', () => ({ toast: toastMock }));

// framer-motion en jsdom n'achève jamais son animation de sortie : sans ce
// double, `AnimatePresence mode="wait"` ne monterait jamais l'onglet appelé.
vi.mock('framer-motion', async () => {
  const React = await import('react');
  const MotionDiv = ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children);
  return {
    motion: { div: MotionDiv },
    AnimatePresence: ({ children }: { children?: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
  };
});

// Les onglets ne sont pas le sujet : seul « Domaine » reste réel, parce que
// c'est le seul dont un champ porte la valeur mesurée.
vi.mock('../tabs/general', () => ({ GeneralTab: () => null }));
vi.mock('../tabs/recommendations', () => ({ RecommendationsTab: () => null }));
vi.mock('../tabs/collaboration', () => ({ CollaborationTab: () => null }));
vi.mock('../tabs/import', () => ({ ImportTab: () => null }));
vi.mock('../tabs/seo', () => ({ SeoTab: () => null }));
vi.mock('../tabs/navigation', () => ({ NavigationTab: () => null }));

import SettingsView from '../settings';
import type { CreatorProfile } from '../types';

function profile(overrides: Partial<CreatorProfile> = {}): CreatorProfile {
  return {
    id: 'pub-1',
    email: 'equipe@qoefi.media',
    username: 'equipe',
    name: 'Le Journal',
    heroText: 'Analyses',
    accentColor: '#EE4B2B',
    fontFamily: 'sans',
    themeMode: 'classic',
    layoutStyle: 'minimal',
    logoUrl: null,
    headerImageUrl: null,
    footerText: null,
    seoTitle: null,
    seoDescription: null,
    allowIndexing: true,
    supportUrl: null,
    subdomain: 'journal',
    customDomain: null,
    navigation: [],
    socialLinks: [],
    articles: [],
    categories: [],
    advancedSettingsMode: false,
    siteOptions: null,
    ...overrides,
  };
}

describe('SettingsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dashboard.updateCreatorProfileAction.mockResolvedValue({ ok: true, data: {} });
    dashboard.updateSubdomainAction.mockResolvedValue({ ok: true, data: {} });
    dashboard.saveNavigationLinksAction.mockResolvedValue({ ok: true, data: {} });
    dashboard.saveSocialLinksAction.mockResolvedValue({ ok: true, data: {} });
    dashboard.checkSubdomainAvailabilityAction.mockResolvedValue({
      ok: true,
      data: { available: true },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('retire chaque écouteur window qu’elle a posé, avec la même référence', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');

    const { unmount } = render(<SettingsView initialCreator={profile()} />);
    unmount();

    const registrations = add.mock.calls.filter(
      ([type]) => type === 'hashchange' || type === 'cmdKNavigate'
    );
    expect(registrations).toHaveLength(2);

    for (const [type, listener] of registrations) {
      const removed = remove.mock.calls.some(
        ([removedType, removedListener]) => removedType === type && removedListener === listener
      );
      expect(removed, `écouteur « ${String(type)} » jamais retiré`).toBe(true);
    }
  });

  it('n’invente pas une publication quand aucun domaine n’est configuré', () => {
    render(<SettingsView initialCreator={profile({ subdomain: null, customDomain: null })} />);

    expect(screen.queryByRole('link', { name: /voir le site/i })).toBeNull();
    expect(screen.getByRole('button', { name: /voir le site/i })).toBeDisabled();
  });

  it('préfère le domaine personnalisé au sous-domaine', () => {
    render(
      <SettingsView
        initialCreator={profile({ subdomain: 'journal', customDomain: 'media.example.org' })}
      />
    );

    expect(screen.getByRole('link', { name: /voir le site/i })).toHaveAttribute(
      'href',
      'https://media.example.org'
    );
  });

  it('refuse ⌘S quand la vérification annoncée dit que le sous-domaine est pris', async () => {
    const user = userEvent.setup();
    let resolveCheck: ((value: unknown) => void) | undefined;
    dashboard.checkSubdomainAvailabilityAction.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCheck = resolve;
        })
    );

    render(<SettingsView initialCreator={profile({ subdomain: 'journal' })} />);

    await user.click(screen.getByRole('tab', { name: /domaine/i }));
    const input = await screen.findByPlaceholderText('mon-espace');
    await user.clear(input);
    await user.type(input, 'pris');

    await waitFor(() =>
      expect(dashboard.checkSubdomainAvailabilityAction).toHaveBeenCalledWith('pris')
    );
    resolveCheck?.({ ok: true, data: { available: false, reason: 'Déjà pris.' } });
    await screen.findByText('Déjà pris.');

    fireEvent.keyDown(window, { key: 's', metaKey: true });

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled());
    // Le raccourci doit relire l'état courant : le message d'échec annoncé
    // dans l'écran est celui qui revient, pas un état antérieur.
    expect(toastMock.error.mock.calls.at(-1)?.[0]).toMatch(/Déjà pris/);
    expect(dashboard.updateSubdomainAction).not.toHaveBeenCalled();
  });
});
