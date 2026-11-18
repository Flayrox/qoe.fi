// @vitest-environment jsdom
// =====================================================================
// 🪟 Popover — la fermeture est un contrôle, pas un `<span onClick>`
// =====================================================================
// 📖 `PopoverClose` était un `<span>` cliquable : sans rôle, sans focus,
//    sans activation par Entrée ou Espace. Invisible au clavier, pour tout
//    ce qui n'est pas une souris.
// =====================================================================

import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from '../popover';

describe('PopoverClose', () => {
  it('rend un bouton atteignable au clavier', async () => {
    render(
      <Popover open>
        <PopoverTrigger>Ouvrir</PopoverTrigger>
        <PopoverContent aria-label="Détails">
          <PopoverClose>Fermer</PopoverClose>
        </PopoverContent>
      </Popover>
    );

    const close = await screen.findByRole('button', { name: 'Fermer' });
    expect(close.tagName).toBe('BUTTON');
    expect(close.getAttribute('type')).toBe('button');
  });
});
