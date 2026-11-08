'use client';

import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const push = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/analytics',
}));
vi.mock('next-themes', () => ({
  useTheme: () => ({ setTheme: vi.fn() }),
}));
vi.mock('@qoe/sdk/actions/search', () => ({
  searchAllAction: vi.fn(async () => ({ ok: true, data: { articles: [] } })),
}));

import { StudioSidebar } from '../StudioSidebar';
import { GlobalCommandMenu } from '../GlobalCommandMenu';
import { SurfaceHotkeys } from '../SurfaceHotkeys';

// jsdom + react-aria : sans ces deux API, les overlays ne s'ouvrent pas.
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

const SIDEBAR_LABELS = [
  'Accueil',
  'Articles',
  'Notifications',
  'Médias',
  'Newsletters',
  'Audience',
  'Analytics',
  'Développeur',
  'Réglages',
  'Offre Pro',
];

function renderStudioOwner() {
  return render(
    <>
      <StudioSidebar
        userId="u1"
        userName="Jean"
        userUsername="jean"
        userEmail="jean@qoe.test"
        userFallback="JE"
        brandName="Studio"
        feedHref="http://qoe.test/home"
        permissions={undefined}
        canWrite
        unreadCount={3}
        isOnNotificationsPage={false}
      />
      <GlobalCommandMenu permissions={undefined} />
      <SurfaceHotkeys />
    </>
  );
}

function anchorLabel(anchor: HTMLAnchorElement): string {
  // Le badge non-lu est accolé au texte (« Notifications3 ») : on retire les
  // chiffres finaux, jamais un préfixe de libellé (sinon « Accueil renommé »
  // passerait pour « Accueil »).
  return anchor.textContent?.trim().replace(/\d+$/, '') ?? '';
}

function anchorsFor(label: string): string[] {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>('a'))
    .filter((anchor) => anchorLabel(anchor) === label)
    .map((anchor) => anchor.getAttribute('href') ?? '');
}

beforeEach(() => {
  push.mockClear();
});

describe('chrome du layout Studio', () => {
  it('rend la sidebar créateur depuis le manifeste de surfaces', () => {
    renderStudioOwner();

    for (const label of SIDEBAR_LABELS) {
      expect(anchorsFor(label), `entrée « ${label} » absente du rendu`).not.toHaveLength(0);
    }
    expect(anchorsFor('Accueil')).toContain('/');
    expect(anchorsFor('Articles')).toContain('/articles');
    expect(anchorsFor('Notifications')).toContain('/notifications');
  });

  it('ouvre Cmd+K et propose les surfaces du manifeste (+ les réglages)', async () => {
    renderStudioOwner();

    fireEvent.keyDown(window, { key: 'k', code: 'KeyK', metaKey: true });

    await waitFor(() => {
      expect(screen.getByText('Raccourcis de la console')).toBeDefined();
    });
    expect(screen.getByText('Rédiger un article')).toBeDefined();
    expect(screen.getByText('Importer son audience')).toBeDefined();
    expect(screen.getByText('Assistant de démarrage')).toBeDefined();
    expect(screen.getAllByText('Accueil').length).toBeGreaterThan(0);
  });

  it('navigue avec les hotkeys du manifeste et ouvre l’aide au clavier', async () => {
    renderStudioOwner();

    fireEvent.keyDown(window, { key: 'g' });
    fireEvent.keyDown(window, { key: 'h' });
    expect(push).toHaveBeenCalledWith('/');

    fireEvent.keyDown(window, { key: '?' });

    await waitFor(() => {
      expect(screen.getByText('Raccourcis clavier')).toBeDefined();
    });
    expect(screen.getAllByText('Navigation').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Accueil').length).toBeGreaterThan(0);
    expect(screen.getByText('g h')).toBeDefined();
    expect(screen.getAllByText('Articles').length).toBeGreaterThan(0);
    expect(screen.getByText('g a')).toBeDefined();
  });
});
