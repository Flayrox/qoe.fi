// @vitest-environment jsdom
// =====================================================================
// 📑 CraftSidebarDrawer — fermé = hors du focus, ouvert = activable
// =====================================================================
// 📖 Deux défauts corrigés ici :
//    1. fermé, le sommaire restait dans l'ordre de tabulation (`aria-hidden`
//       ne retire rien du focus) : on traversait une dizaine de liens
//       invisibles avant le contenu de l'article ;
//    2. un chapitre sans `href` était un `<div tabIndex={0}>` — focalisable,
//       mais Entrée et Espace ne déclenchaient rien.
// =====================================================================

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { CraftSidebarDrawer } from '../craft-sidebar-drawer';

describe('CraftSidebarDrawer', () => {
  it('sort le sommaire du focus quand il est fermé', () => {
    render(
      <CraftSidebarDrawer isOpen={false} items={[{ id: 'a', label: 'Chapitre A', href: '/a' }]} />
    );

    const aside = document.querySelector('aside');
    expect(aside?.hasAttribute('inert')).toBe(true);
    expect(aside?.getAttribute('tabindex')).toBe('-1');
  });

  it('rend un vrai bouton pour un chapitre sans lien', () => {
    const onSelectItem = vi.fn();
    render(
      <CraftSidebarDrawer
        isOpen
        items={[{ id: 'a', label: 'Chapitre A' }]}
        onSelectItem={onSelectItem}
      />
    );

    const button = screen.getByRole('button', { name: 'Chapitre A' });
    fireEvent.click(button);

    expect(onSelectItem).toHaveBeenCalledTimes(1);
    expect(onSelectItem.mock.calls[0][0]).toMatchObject({ id: 'a' });
  });
});
