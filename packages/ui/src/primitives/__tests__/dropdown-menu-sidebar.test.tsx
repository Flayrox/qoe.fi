// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('next/navigation', () => ({
  usePathname: () => '/articles',
}));

import { Button } from '../button/button';
import { Sidebar } from '../../sidebar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../ui/dropdown-menu';

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(globalThis, 'ResizeObserver', {
      value: ResizeObserverStub,
      writable: true,
    });
  }
});

describe('DropdownMenu (@qoe/ui/ui/dropdown-menu)', () => {
  it('ouvre un menu groupé avec déclencheur Button et exécute les actions dans la collection AriaMenu', async () => {
    const user = userEvent.setup();
    const onCreateMedia = vi.fn();

    render(
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
          Changer d’espace
        </DropdownMenuTrigger>
        <DropdownMenuContent aria-label="Espaces de travail">
          <DropdownMenuGroup>
            <DropdownMenuLabel>Compte personnel</DropdownMenuLabel>
            <DropdownMenuItem>Louis Robin</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>Publications & médias</DropdownMenuLabel>
            <DropdownMenuItem>Le Journal Éco</DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onAction={onCreateMedia}>Créer un média</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );

    await user.click(screen.getByRole('button', { name: 'Changer d’espace' }));

    expect(screen.getByText('Compte personnel')).toBeTruthy();
    expect(screen.getByText('Publications & médias')).toBeTruthy();

    await user.click(screen.getByRole('menuitem', { name: 'Créer un média' }));
    expect(onCreateMedia).toHaveBeenCalledTimes(1);
  });
});

describe('Sidebar Account Menu (@qoe/ui/sidebar)', () => {
  it('affiche le badge Média/Perso et déclenche les réglages et la déconnexion', async () => {
    const user = userEvent.setup();
    const onSettingsClick = vi.fn();
    const onLogout = vi.fn();

    render(
      <Sidebar
        items={[{ title: 'Articles', url: '/articles' }]}
        activeUrl="/articles"
        userName="Le Journal Éco"
        userUsername="journaleco"
        userEmail="redaction@journaleco.media"
        userType="MEDIA"
        onSettingsClick={onSettingsClick}
        onLogout={onLogout}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Menu compte' }));

    expect(screen.getByText('Média')).toBeTruthy();
    expect(screen.getByText('redaction@journaleco.media')).toBeTruthy();

    await user.click(screen.getByRole('menuitem', { name: 'Réglages du média' }));
    expect(onSettingsClick).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Menu compte' }));
    await user.click(screen.getByRole('menuitem', { name: 'Se déconnecter' }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
});
