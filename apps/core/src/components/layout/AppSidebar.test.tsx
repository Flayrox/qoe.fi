// @vitest-environment jsdom

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  usePathname: () => '/home',
}));
vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
}));
vi.mock('@qoe/ui/notifications', () => ({
  useUnreadNotificationCount: () => 4,
}));
vi.mock('@qoe/sdk', () => ({
  useUnreadConversationCountQuery: () => ({ data: 2 }),
}));

import { AppSidebar } from './AppSidebar';

function anchorLabel(anchor: HTMLAnchorElement): string {
  // Retire uniquement le badge numérique final, jamais un préfixe de libellé.
  return anchor.textContent?.trim().replace(/\d+$/, '') ?? '';
}

function anchorsFor(label: string): string[] {
  return Array.from(document.querySelectorAll<HTMLAnchorElement>('a'))
    .filter((anchor) => anchorLabel(anchor) === label)
    .map((anchor) => anchor.getAttribute('href') ?? '');
}

// Liste figée : retirer ou renommer une entrée du manifeste lecteur casse le test.
const EXPECTED: Array<[label: string, href: string]> = [
  ['Accueil', '/home'],
  ['Recherche', '/search'],
  ['Notifications', '/notifications'],
  ['Messages', '/messages'],
  ['Bibliothèque', '/library?tab=bookmarks'],
  ['Portefeuille', '/billing'],
  ['Abonnement Plus', '/pricing'],
  ['Mon profil', '/jean'],
  ['Réglages', '/settings'],
];

describe('AppSidebar (lecteur)', () => {
  it('rend la navigation depuis le manifeste, « Mon profil » compris', () => {
    render(
      <AppSidebar
        userId="u1"
        userName="Jean"
        userUsername="jean"
        userEmail="jean@qoe.test"
        studioHref="http://studio.qoe.test"
      />
    );

    for (const [label, href] of EXPECTED) {
      expect(anchorsFor(label), `entrée « ${label} » absente du rendu`).toContain(href);
    }
  });

  it('porte les badges non-lus des surfaces notifications et messages', () => {
    render(
      <AppSidebar
        userId="u1"
        userName="Jean"
        userUsername="jean"
        userEmail="jean@qoe.test"
        studioHref="http://studio.qoe.test"
      />
    );

    const anchors = Array.from(document.querySelectorAll('a'));
    const notifications = anchors.find((anchor) => anchorLabel(anchor) === 'Notifications');
    const messages = anchors.find((anchor) => anchorLabel(anchor) === 'Messages');
    expect(notifications?.textContent).toContain('4');
    expect(messages?.textContent).toContain('2');
  });

  it('le côté gauche du logo mène au Studio, le côté courant reste un repère', () => {
    render(
      <AppSidebar
        userId="u1"
        userName="Jean"
        userUsername="jean"
        userEmail="jean@qoe.test"
        studioHref="http://studio.qoe.test"
      />
    );

    expect(document.querySelector('a[aria-label="Studio"]')?.getAttribute('href')).toBe(
      'http://studio.qoe.test'
    );
    // L'application où l'on se trouve n'est pas une destination.
    expect(document.querySelector('a[aria-label="Lecteur"]')).toBeNull();
  });
});
