// @vitest-environment jsdom
// =====================================================================
// 🍱 BentoItem — pas de fausse affordance de clic
// =====================================================================
// 📖 `BentoItem` portait `onClick` + `cursor-pointer` sur un `motion.div`
//    sans rôle ni focus : la souris invitait au clic, le clavier n'y avait
//    aucun accès (et aucun appelant ne passait `onClick` : l'affordance
//    était purement décorative, donc mensongère).
//
// 🎯 Verrou : l'item reste un conteneur visuel — pas de curseur de clic,
//    pas d'arrêt de tabulation, et les deux états (actif/inactif) rendus.
// =====================================================================

import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { BentoItem, BentoPlateau } from '../BentoPlateau';

describe('BentoItem', () => {
  it('n’affiche pas de curseur de clic sans action', () => {
    const { container } = render(<BentoItem active>Contenu</BentoItem>);

    const item = container.firstElementChild as HTMLElement;
    // Avant correctif : « cursor-pointer » était posé inconditionnellement.
    expect(item.className).not.toContain('cursor-pointer');
  });

  it('n’ajoute aucun arrêt de tabulation mort', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Avant</button>
        <BentoPlateau>
          <BentoItem active>Contenu</BentoItem>
        </BentoPlateau>
        <button type="button">Après</button>
      </>
    );

    act(() => screen.getByRole('button', { name: 'Avant' }).focus());
    await user.tab();

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Après' }));
  });

  it('garde le rendu des deux états et la base flexible', () => {
    const { container } = render(
      <BentoItem
        active={false}
        flexBasisInactive="42%"
        inactiveContent={<span>Aperçu en temps réel</span>}
      >
        Contenu actif
      </BentoItem>
    );

    const item = container.firstElementChild as HTMLElement;
    expect(item.style.flexBasis).toBe('42%');
    expect(screen.getByText('Aperçu en temps réel')).toBeTruthy();
    expect(screen.getByText('Contenu actif')).toBeTruthy();
  });
});
