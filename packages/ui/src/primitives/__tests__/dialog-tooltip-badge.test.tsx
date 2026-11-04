// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Badge } from '../badge/badge';
import { Button } from '../button/button';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../dialog/dialog';
import { Tooltip } from '../tooltip/tooltip';

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

describe('Badge (@qoe/ui/badge)', () => {
  it('applique les tons sémantiques du contrat et le point optionnel', () => {
    const { container } = render(
      <Badge tone="success" variant="outline" dot>
        Publié
      </Badge>
    );

    const badge = screen.getByText('Publié');
    expect(badge.className).toContain('text-success-text');
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBe(1);
  });
});

describe('Tooltip (@qoe/ui/tooltip)', () => {
  it('n’injecte aucun bouton supplémentaire autour de son enfant et s’ouvre au focus clavier', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Tooltip content="Mettre en signet" delay={0}>
        <Button shape="icon" aria-label="Signet">
          S
        </Button>
      </Tooltip>
    );

    expect(container.querySelectorAll('button').length).toBe(1);

    await user.tab();
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip.textContent).toBe('Mettre en signet');
  });

  it('rend l’enfant nu quand content est vide', () => {
    const { container } = render(
      <Tooltip content="">
        <Button>Action</Button>
      </Tooltip>
    );
    expect(container.querySelectorAll('button').length).toBe(1);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

describe('Dialog (@qoe/ui/dialog)', () => {
  it('ouvre un dialogue modal nommé, se ferme à Échap et rend le focus au déclencheur', async () => {
    const user = userEvent.setup();
    render(
      <Dialog size="md">
        <DialogTrigger>Inviter</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Inviter un co-auteur</DialogTitle>
            <DialogDescription>Signature partagée</DialogDescription>
          </DialogHeader>
          <DialogBody>Formulaire</DialogBody>
        </DialogContent>
      </Dialog>
    );

    const trigger = screen.getByRole('button', { name: 'Inviter' });
    await user.click(trigger);

    const dialog = await screen.findByRole('dialog', { name: 'Inviter un co-auteur' });
    expect(dialog).toBeTruthy();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('supporte role="alertdialog" et la fermeture explicite via DialogClose', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();

    render(
      <Dialog size="sm">
        <DialogTrigger tone="danger">Supprimer</DialogTrigger>
        <DialogContent role="alertdialog" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Confirmer la suppression ?</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <DialogClose>Annuler</DialogClose>
            <DialogClose tone="danger" variant="solid" onClick={onConfirm}>
              Confirmer
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );

    await user.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(
      await screen.findByRole('alertdialog', { name: 'Confirmer la suppression ?' })
    ).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Confirmer' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
});
