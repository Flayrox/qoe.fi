// @vitest-environment jsdom
// =====================================================================
// 💬 Tooltip — une infobulle qui s'ouvre vraiment
// =====================================================================
// 📖 Le déclencheur (`<button>` nu) ne recevait aucun gestionnaire de
//    react-aria : ni survol, ni focus, ni Échap. Aucune infobulle du
//    produit ne s'ouvrait — l'icône « (i) » des fonctionnalités à venir
//    était un bouton muet, et les barres d'outils en icônes n'avaient
//    aucun libellé visible.
//
// 🎯 Preuve : au focus, l'infobulle existe et le déclencheur la référence
//    par `aria-describedby`.
// =====================================================================

import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../tooltip';

describe('Tooltip', () => {
  it('ouvre l’infobulle au focus et la relie au déclencheur', async () => {
    render(
      <TooltipProvider delay={50}>
        <Tooltip>
          <TooltipTrigger aria-label="Aide">?</TooltipTrigger>
          <TooltipContent>Raccourci</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );

    const trigger = screen.getByRole('button', { name: 'Aide' });
    act(() => trigger.focus());

    await waitFor(() => expect(screen.getByRole('tooltip')).toBeTruthy(), { timeout: 600 });
    expect(trigger.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('se ferme à Échap', async () => {
    render(
      <Tooltip>
        <TooltipTrigger aria-label="Aide">?</TooltipTrigger>
        <TooltipContent>Raccourci</TooltipContent>
      </Tooltip>
    );

    const trigger = screen.getByRole('button', { name: 'Aide' });
    act(() => trigger.focus());
    await waitFor(() => expect(screen.getByRole('tooltip')).toBeTruthy(), { timeout: 600 });

    act(() => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull(), { timeout: 600 });
  });
});
