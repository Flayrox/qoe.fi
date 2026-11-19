import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/home',
}));

import { CmdKDialog, CmdKList } from '../cmdk/CommandPrimitives';
import { OnboardingModal } from '../onboarding/OnboardingModal';

function hiddenFromAssistiveTech(element: Element): boolean {
  return element.closest('[aria-hidden="true"]') !== null || element.closest('[inert]') !== null;
}

describe('⌘K — palette de commandes', () => {
  it('est une vraie boîte de dialogue, focus compris', async () => {
    // F135 — `fixed inset-0` sans `role="dialog"`, sans `aria-modal`, sans
    // piège du focus : la palette est pourtant l'interface clavier du produit.
    const onOpenChange = vi.fn();
    const { container } = render(
      <>
        <main>
          <button type="button">derrière</button>
        </main>
        <CmdKDialog open onOpenChange={onOpenChange}>
          <CmdKList emptyText="Aucune commande" />
        </CmdKDialog>
      </>
    );

    const dialog = await screen.findByRole('dialog', { name: 'Menu de commandes' });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    expect(hiddenFromAssistiveTech(container)).toBe(true);

    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});

describe('OnboardingModal — modalité', () => {
  const props = { categories: [], suggestedCreators: [], onSubmit: vi.fn() };

  it('concentre le focus et ne se laisse pas fermer quand il est obligatoire', async () => {
    // F136 — `role`/`aria-modal` absents et aucun piège du focus : on
    // tabulait dans la page derrière un écran qui bloque tout.
    const onOpenChange = vi.fn();
    render(<OnboardingModal open onOpenChange={onOpenChange} {...props} />);

    const dialog = await screen.findByRole('dialog', { name: 'Bienvenue sur qoefi' });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('se ferme à Échap quand il est facultatif', async () => {
    const onOpenChange = vi.fn();
    render(<OnboardingModal open dismissible onOpenChange={onOpenChange} {...props} />);

    const dialog = await screen.findByRole('dialog', { name: 'Bienvenue sur qoefi' });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
