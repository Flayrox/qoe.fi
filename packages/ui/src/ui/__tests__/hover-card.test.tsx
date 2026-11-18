// @vitest-environment jsdom
// =====================================================================
// 🪪 HoverCard — la carte s'ouvre au clavier, et se traverse au clavier
// =====================================================================
// 📖 Le déclencheur est focusable et ouvre la carte au focus, mais le
//    contenu est portailé dans `document.body` : Tab depuis le déclencheur
//    sortait de la carte (donc la refermait) sans jamais atteindre le
//    bouton d'action qu'elle contient. Un utilisateur clavier ne pouvait
//    pas « Suivre » depuis une carte de profil.
//
// 🎯 Contrat verrouillé ici :
//    - Tab depuis le déclencheur entre dans le contenu ;
//    - Maj+Tab depuis le premier élément du contenu revient au déclencheur,
//      carte toujours ouverte ;
//    - Échap referme et rend le focus au déclencheur ;
//    - sortir du focus par le bas referme la carte.
// =====================================================================

import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { HoverCard, HoverCardContent, HoverCardTrigger } from '../hover-card';

function Card({ openDelay = 0 }: { openDelay?: number }) {
  return (
    <HoverCard openDelay={openDelay}>
      <HoverCardTrigger render={<button type="button">Camille</button>} />
      <HoverCardContent>
        <button type="button">Suivre</button>
        <a href="/camille">Voir le profil</a>
      </HoverCardContent>
    </HoverCard>
  );
}

/**
 * Le décor compte : en vrai, la carte est portailée APRÈS le reste de la
 * page. Sans voisins, Tab depuis le déclencheur tomberait dans le portail
 * par hasard et le test ne prouverait rien.
 */
function Page({ openDelay = 0 }: { openDelay?: number }) {
  return (
    <>
      <button type="button">Avant la carte</button>
      <Card openDelay={openDelay} />
      <button type="button">Après la carte</button>
    </>
  );
}

describe('HoverCard — parcours clavier', () => {
  it('entre dans le contenu au Tab depuis le déclencheur', async () => {
    const user = userEvent.setup();
    render(<Page />);

    const trigger = screen.getByRole('button', { name: 'Camille' });
    act(() => trigger.focus());
    const follow = await screen.findByRole('button', { name: 'Suivre' });

    await user.tab();

    // Avant correction : le focus partait sur « Après la carte » et la
    // carte se refermait.
    expect(document.activeElement).toBe(follow);
  });

  it('revient au déclencheur au Maj+Tab depuis le premier élément', async () => {
    const user = userEvent.setup();
    render(<Page />);

    const trigger = screen.getByRole('button', { name: 'Camille' });
    act(() => trigger.focus());
    const follow = await screen.findByRole('button', { name: 'Suivre' });
    act(() => follow.focus());

    await user.tab({ shift: true });

    expect(document.activeElement).toBe(trigger);
    expect(screen.getByRole('button', { name: 'Suivre' })).toBeTruthy();
  });

  it('se referme à Échap en rendant le focus au déclencheur', async () => {
    const user = userEvent.setup();
    render(<Page />);

    const trigger = screen.getByRole('button', { name: 'Camille' });
    act(() => trigger.focus());
    const follow = await screen.findByRole('button', { name: 'Suivre' });
    act(() => follow.focus());

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Suivre' })).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it('se referme quand le focus sort par le bas', async () => {
    const user = userEvent.setup();
    render(<Page />);

    const trigger = screen.getByRole('button', { name: 'Camille' });
    act(() => trigger.focus());
    const profile = await screen.findByRole('link', { name: 'Voir le profil' });
    act(() => profile.focus());

    await user.tab();

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Suivre' })).toBeNull());
  });
});
