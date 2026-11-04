import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PopoverPanel } from '../popover/popover-panel';

describe('PopoverPanel', () => {
  it('ne rend rien quand il est fermé', () => {
    render(
      <PopoverPanel open={false} onClose={() => {}} label="Note">
        <button>Contenu</button>
      </PopoverPanel>
    );

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('rend un dialogue nommé par son libellé', () => {
    render(
      <PopoverPanel open onClose={() => {}} label="Note d'auteur">
        <button>Enregistrer</button>
      </PopoverPanel>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-label')).toBe("Note d'auteur");
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeTruthy();
  });

  it('remonte la fermeture au clavier (Échap)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <PopoverPanel open onClose={onClose} label="Lien">
        <button>Appliquer</button>
      </PopoverPanel>
    );

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });
});
