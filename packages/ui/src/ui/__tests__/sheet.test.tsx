// @vitest-environment jsdom
// =====================================================================
// 📄 Sheet — le côté demandé est le côté rendu
// =====================================================================
// 📖 `SheetContent` acceptait `side` dans son type sans jamais le lire :
//    `side="left"` rendait un panneau à droite, sans erreur ni test. Le côté
//    se déclare sur `<Sheet>`, seul endroit d'où il atteint le contexte du
//    `Drawer`.
// =====================================================================

import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../sheet';

function renderSheet(side?: 'left' | 'right') {
  return render(
    <Sheet open side={side}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Brouillons</SheetTitle>
          <SheetDescription>Pensées enregistrées</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  );
}

describe('Sheet', () => {
  it('ouvre à gauche quand on le demande', async () => {
    renderSheet('left');

    const dialog = await screen.findByRole('dialog', { name: 'Brouillons' });
    const panel = dialog.parentElement as HTMLElement;

    expect(panel.className).toContain('border-r');
    expect(panel.className).not.toContain('border-l');
  });

  it('reste à droite par défaut', async () => {
    renderSheet();

    const dialog = await screen.findByRole('dialog', { name: 'Brouillons' });
    const panel = dialog.parentElement as HTMLElement;

    expect(panel.className).toContain('border-l');
  });
});
