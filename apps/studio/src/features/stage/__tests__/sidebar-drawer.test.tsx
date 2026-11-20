// @vitest-environment jsdom
// =====================================================================
// L21b — SidebarDrawer : tiroir modal réellement accessible
// =====================================================================
// Le tiroir recouvrait tout l'écran (fond noir 50 %, z-50) sans aucune
// sémantique de dialogue : pas de `role="dialog"`, pas d'`aria-modal`, pas de
// nom accessible, pas de transfert ni de restauration de focus, pas de piège
// de tabulation. Un lecteur d'écran annonçait donc le contenu comme s'il était
// dans le flux, et le clavier pouvait tabuler derrière l'overlay.
// =====================================================================

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@qoe/ui/sidebar', () => ({
  Sidebar: () => (
    <nav>
      <a href="/studio/articles">Articles</a>
      <button type="button">Action</button>
    </nav>
  ),
}));

import type { SidebarProps } from '@qoe/ui/sidebar';
import { SidebarDrawer } from '../sidebar-drawer/SidebarDrawer';

// `Sidebar` est mockée : seules les props de forme comptent ici.
const sidebarProps = { items: [], brandName: 'Studio' } as unknown as SidebarProps;

function renderDrawer(onClose = vi.fn()) {
  const utils = render(<SidebarDrawer isOpen onClose={onClose} sidebarProps={sidebarProps} />);
  return { ...utils, onClose };
}

describe('SidebarDrawer', () => {
  it('expose un dialogue modal nommé', () => {
    renderDrawer();
    const dialog = screen.getByRole('dialog', { name: 'Navigation Studio' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('donne un nom accessible au bouton de fermeture et y place le focus', () => {
    renderDrawer();
    const close = screen.getByRole('button', { name: 'Fermer le menu' });
    expect(document.activeElement).toBe(close);
  });

  it('rend le focus à l’élément déclencheur à la fermeture', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    const { rerender } = render(
      <SidebarDrawer isOpen onClose={vi.fn()} sidebarProps={sidebarProps} />
    );
    expect(document.activeElement).not.toBe(trigger);

    act(() =>
      rerender(<SidebarDrawer isOpen={false} onClose={vi.fn()} sidebarProps={sidebarProps} />)
    );
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('piège la tabulation dans le tiroir', () => {
    renderDrawer();
    const dialog = screen.getByRole('dialog');
    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')
    );
    expect(focusables.length).toBeGreaterThan(1);

    act(() => focusables[focusables.length - 1].focus());
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(focusables[0]);

    // Sens inverse : Maj+Tab depuis le premier revient au dernier.
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(focusables[focusables.length - 1]);
  });

  it('ferme sur Échap', () => {
    const { onClose } = renderDrawer();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
