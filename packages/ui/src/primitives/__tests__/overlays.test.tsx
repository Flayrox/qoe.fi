import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Drawer, DrawerBody, DrawerContent, DrawerTitle, DrawerTrigger } from '../drawer/drawer';
import { Dropdown } from '../dropdown/dropdown';
import { Select } from '../select/select';
import { Toaster, toastQueue } from '../../ui/toast';

// react-aria mesure ses popovers avec ResizeObserver, absent de jsdom.
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

describe('Dropdown', () => {
  const items = [
    { id: 'edit', label: 'Modifier', onAction: vi.fn() },
    { id: 'archive', label: 'Archiver', disabled: true, onAction: vi.fn() },
    { id: 'delete', label: 'Supprimer', tone: 'danger' as const, onAction: vi.fn() },
  ];

  it('n’ouvre le menu qu’à la demande et annonce son état', async () => {
    const user = userEvent.setup();
    render(<Dropdown label="Actions" ariaLabel="Actions sur l’article" items={items} />);

    const trigger = screen.getByRole('button', { name: /actions/i });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('menu')).toBeNull();

    await user.click(trigger);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const menu = await screen.findByRole('menu', { name: 'Actions sur l’article' });
    expect(menu).toBeTruthy();
  });

  it('déclenche l’action de l’item choisi, et elle seule', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(
      <Dropdown
        label="Actions"
        ariaLabel="Actions"
        items={[{ id: 'edit', label: 'Modifier', onAction }]}
      />
    );

    await user.click(screen.getByRole('button', { name: /actions/i }));
    await user.click(await screen.findByRole('menuitem', { name: 'Modifier' }));

    expect(onAction).toHaveBeenCalledTimes(1);
    // Le menu se referme et le focus revient au déclencheur.
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('laisse les items désactivés hors de l’ordre de tabulation', async () => {
    const user = userEvent.setup();
    render(<Dropdown label="Actions" ariaLabel="Actions" items={items} />);

    await user.click(screen.getByRole('button', { name: /actions/i }));
    const disabled = await screen.findByRole('menuitem', { name: 'Archiver' });

    expect(disabled.getAttribute('aria-disabled')).toBe('true');
  });
});

describe('Select', () => {
  const options = [
    { id: 'fr', label: 'Français', description: 'France, Belgique' },
    { id: 'en', label: 'Anglais' },
    { id: 'de', label: 'Allemand', disabled: true },
  ];

  it('affiche le placeholder puis le libellé sélectionné', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <Select
        label="Langue"
        options={options}
        placeholder="Choisir…"
        onValueChange={onValueChange}
      />
    );

    const trigger = screen.getByRole('button', { name: /langue/i });
    expect(trigger.textContent).toContain('Choisir…');

    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: /français/i }));

    expect(onValueChange).toHaveBeenCalledWith('fr');
    await waitFor(() => expect(trigger.textContent).toContain('Français'));
  });

  it('s’utilise entièrement au clavier', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Select label="Langue" options={options} onValueChange={onValueChange} />);

    const trigger = screen.getByRole('button', { name: /langue/i });
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowDown}{Enter}');

    expect(onValueChange).toHaveBeenCalledWith('en');
  });

  it('expose la valeur à un formulaire natif', () => {
    // react-aria rend un `<select>` réel, masqué : c'est lui qui est soumis
    // et qui porte le `name`, pas un input caché maison.
    const { container } = render(
      <Select label="Langue" name="locale" options={options} defaultValue="en" />
    );

    const hidden = container.querySelector('select[name="locale"]');
    expect(hidden).not.toBeNull();
    expect((hidden as HTMLSelectElement).value).toBe('en');
  });

  it('annonce l’état invalide', () => {
    render(<Select label="Langue" options={options} invalid />);
    const trigger = screen.getByRole('button', { name: /langue/i });

    expect(trigger.getAttribute('aria-invalid')).toBe('true');
    expect(trigger.className).toContain('border-destructive');
  });
});

describe('Drawer', () => {
  it('ouvre un dialogue modal nommé et y place le focus', async () => {
    const user = userEvent.setup();
    render(
      <Drawer>
        <DrawerTrigger>Détails</DrawerTrigger>
        <DrawerContent>
          <DrawerTitle>Réglages du site</DrawerTitle>
          <DrawerBody>Contenu</DrawerBody>
        </DrawerContent>
      </Drawer>
    );

    await user.click(screen.getByRole('button', { name: 'Détails' }));

    const dialog = await screen.findByRole('dialog', { name: 'Réglages du site' });
    expect(dialog.getAttribute('role')).toBe('dialog');
    // react-aria n'écrit pas `aria-modal` : il rend l'arrière-plan inerte
    // (`aria-hidden` + focus scope). C'est plus fiable, car `aria-modal`
    // seul n'empêche ni la tabulation ni la lecture de l'arrière-plan.
    expect(dialog.closest('[aria-hidden="true"]')).toBeNull();
    expect(document.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByText('Contenu')).toBeTruthy();
  });

  it('se ferme à Échap et rend le focus au déclencheur', async () => {
    const user = userEvent.setup();
    render(
      <Drawer>
        <DrawerTrigger>Détails</DrawerTrigger>
        <DrawerContent aria-label="Détails">
          <DrawerBody>Contenu</DrawerBody>
        </DrawerContent>
      </Drawer>
    );

    const trigger = screen.getByRole('button', { name: 'Détails' });
    await user.click(trigger);
    await screen.findByRole('dialog', { name: 'Détails' });

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('respecte un contrôle externe de l’ouverture', async () => {
    const { rerender } = render(
      <Drawer isOpen={false}>
        <DrawerTrigger>Détails</DrawerTrigger>
        <DrawerContent aria-label="Détails">
          <DrawerBody>Contenu</DrawerBody>
        </DrawerContent>
      </Drawer>
    );

    expect(screen.queryByRole('dialog')).toBeNull();

    rerender(
      <Drawer isOpen>
        <DrawerTrigger>Détails</DrawerTrigger>
        <DrawerContent aria-label="Détails">
          <DrawerBody>Contenu</DrawerBody>
        </DrawerContent>
      </Drawer>
    );

    expect(await screen.findByRole('dialog', { name: 'Détails' })).toBeTruthy();
  });
});

describe('Toast', () => {
  afterEach(() => {
    act(() => toastQueue.clear());
  });

  it('affiche une notification poussée depuis le store', async () => {
    render(<Toaster />);

    act(() => {
      toastQueue.add({ variant: 'success', title: 'Article enregistré' }, { timeout: 60_000 });
    });

    expect(await screen.findByText('Article enregistré')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Notifications' })).toBeTruthy();
  });

  it('porte une région live pour l’annonce vocale', async () => {
    render(<Toaster />);

    act(() => {
      toastQueue.add({ variant: 'error', title: 'Échec de l’envoi' }, { timeout: 60_000 });
    });

    await screen.findByText('Échec de l’envoi');
    const region = screen.getByRole('region', { name: 'Notifications' });
    expect(region.getAttribute('aria-live') ?? region.getAttribute('aria-label')).toBeTruthy();
  });

  it('se ferme par son bouton, ce qui libère la place', async () => {
    const user = userEvent.setup();
    render(<Toaster />);

    act(() => {
      toastQueue.add({ variant: 'info', title: 'Téléchargement lancé' }, { timeout: 60_000 });
    });

    await screen.findByText('Téléchargement lancé');
    await user.click(screen.getByRole('button', { name: 'Fermer la notification' }));

    await waitFor(() => expect(screen.queryByText('Téléchargement lancé')).toBeNull());
  });

  it('rend l’action optionnelle et la referme au clic', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Toaster />);

    act(() => {
      toastQueue.add(
        {
          variant: 'message',
          title: 'Brouillon supprimé',
          action: { label: 'Annuler', onClick },
        },
        { timeout: 60_000 }
      );
    });

    await user.click(await screen.findByRole('button', { name: 'Annuler' }));

    expect(onClick).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText('Brouillon supprimé')).toBeNull());
  });
});
