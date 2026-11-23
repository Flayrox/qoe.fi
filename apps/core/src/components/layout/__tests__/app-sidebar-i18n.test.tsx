// @vitest-environment jsdom
// L20c8 — AppSidebar : `surface.defaultLabel` est passé brut, alors que le
// manifeste documente explicitement « Libellé par défaut (français), traduit
// par la surface consommatrice ». La navigation du lecteur restait donc
// française dans l'interface `en`.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const { tCalls } = vi.hoisted(() => ({ tCalls: [] as string[] }));

vi.mock('@lingui/core/macro', () => ({
  t: (strings: TemplateStringsArray | string, ...values: unknown[]) => {
    const message = Array.isArray(strings)
      ? strings.reduce((res, str, i) => res + str + (values[i] ?? ''), '')
      : String(strings);
    tCalls.push(message);
    return `[${message}]`;
  },
}));

vi.mock('next/navigation', () => ({ usePathname: () => '/home' }));
vi.mock('@qoe/ui/sidebar', () => ({
  Sidebar: ({ items }: { items: { title: string; url: string }[] }) => (
    <nav>
      {items.map((item) => (
        <a key={item.url} href={item.url}>
          {item.title}
        </a>
      ))}
    </nav>
  ),
}));
vi.mock('@qoe/ui', () => ({ Logo: () => null }));
vi.mock('@qoe/ui/notifications', () => ({ useUnreadNotificationCount: () => 0 }));
vi.mock('@qoe/sdk', () => ({ useUnreadConversationCountQuery: () => ({ data: 0 }) }));
vi.mock('@qoe/config/routes', () => ({
  routes: { feed: { settings: () => '/settings', profile: (u: string) => `/${u}` } },
}));
vi.mock('@qoe/config', () => ({
  getSidebarSurfaces: () => [
    { id: 'reader.home', path: '/home', iconName: 'Home', defaultLabel: 'Accueil' },
    {
      id: 'reader.notifications',
      path: '/notifications',
      iconName: 'Bell',
      defaultLabel: 'Notifications',
    },
    { id: 'reader.settings', path: '/settings', iconName: 'Settings', defaultLabel: 'Réglages' },
  ],
}));

import { AppSidebar } from '../AppSidebar';
import { fileURLToPath } from 'node:url';

// Ancrage indépendant du cwd : `pnpm test:coverage` tourne depuis la racine du
// monorepo et `turbo run test` depuis `apps/core` — `CORE_DIR` ne pointe
// donc pas toujours sur l'app. La racine est déduite du fichier de test.
const CORE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

afterEach(() => {
  cleanup();
  tCalls.length = 0;
});

describe('AppSidebar — navigation traduite', () => {
  it('traduit les libellés du manifeste au lieu de les rendre bruts', () => {
    render(<AppSidebar userId="u1" userName="Jean" userUsername="jean" studioHref="/studio" />);

    expect(screen.getByRole('link', { name: '[Accueil]' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '[Notifications]' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '[Réglages]' })).toBeTruthy();
  });

  it('garde de source : le libellé du manifeste n’est plus passé brut', () => {
    const source = readFileSync(resolve(CORE_DIR, 'src/components/layout/AppSidebar.tsx'), 'utf-8');
    expect(source).not.toContain('title: surface.defaultLabel');
  });
});

describe('(reader)/layout — repli du nom d’utilisateur', () => {
  it('laisse les composants du socle appliquer leur libellé traduit', () => {
    // Le layout passait `'Lecteur'` en dur : la valeur écrasait le défaut
    // `t`Lecteur`` d'AppSidebar et de ReaderNavOverlay, donc le repli restait
    // français quoi qu'il arrive.
    const source = readFileSync(resolve(CORE_DIR, 'src/app/(reader)/layout.tsx'), 'utf-8');
    expect(source).not.toMatch(/['"]Lecteur['"]/);
  });
});
