import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Avatar, AvatarGroup } from '../avatar/avatar';

describe('Avatar', () => {
  it('affiche les initiales quand il n’y a pas d’image', () => {
    render(<Avatar name="Éphémère Durand" />);
    expect(screen.getByRole('img', { name: 'Éphémère Durand' }).textContent).toBe('ÉD');
  });

  it('bascule sur les initiales quand l’image échoue', () => {
    render(<Avatar name="Camille Petit" src="https://exemple.invalid/a.png" />);

    const image = document.querySelector('img');
    expect(image).not.toBeNull();
    fireEvent.error(image!);

    expect(screen.getByRole('img', { name: 'Camille Petit' }).textContent).toBe('CP');
    expect(document.querySelector('img')).toBeNull();
  });

  it('retente quand la source change', () => {
    const { rerender } = render(
      <Avatar name="Camille Petit" src="https://exemple.invalid/a.png" />
    );
    fireEvent.error(document.querySelector('img')!);
    expect(document.querySelector('img')).toBeNull();

    rerender(<Avatar name="Camille Petit" src="https://exemple.invalid/b.png" />);
    expect(document.querySelector('img')).not.toBeNull();
  });

  it('nomme le groupe et annonce les personnes masquées', () => {
    render(
      <AvatarGroup
        max={2}
        people={[{ name: 'Awa Traoré' }, { name: 'Sam Rivière' }, { name: 'Noé Lambert' }]}
      />
    );

    expect(screen.getByText('+1')).toBeTruthy();
    expect(screen.getByText(/1 autre :/)).toBeTruthy();
  });
});
