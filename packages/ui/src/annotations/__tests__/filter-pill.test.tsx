import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AnnotationFilterPill } from '../AnnotationFilterPill';

describe('AnnotationFilterPill', () => {
  it('expose un groupe nommé et le choix actif', () => {
    render(<AnnotationFilterPill filterMode="official" onChangeFilterMode={() => {}} />);

    // react-aria rend un `selectionMode="single"` en vrai groupe radio :
    // le lecteur d'écran annonce « Officielles, coché, 2 sur 3 », pas trois
    // boutons indépendants.
    expect(screen.getByRole('radiogroup', { name: /afficher les annotations/i })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /officielles/i }).getAttribute('aria-checked')).toBe(
      'true'
    );
    expect(screen.getByRole('radio', { name: /toutes/i }).getAttribute('aria-checked')).toBe(
      'false'
    );
  });

  it('remonte le mode choisi', () => {
    const onChangeFilterMode = vi.fn();
    render(<AnnotationFilterPill filterMode="all" onChangeFilterMode={onChangeFilterMode} />);

    fireEvent.click(screen.getByRole('radio', { name: /aucune/i }));

    expect(onChangeFilterMode).toHaveBeenCalledWith('none');
  });

  it('masque « Toutes » quand les annotations publiques sont désactivées', () => {
    render(
      <AnnotationFilterPill
        filterMode="official"
        onChangeFilterMode={() => {}}
        allowPublicAnnotations={false}
      />
    );

    expect(screen.queryByRole('radio', { name: /toutes/i })).toBeNull();
    expect(screen.getByRole('radio', { name: /mes notes/i })).toBeTruthy();
  });

  it('permet de filtrer uniquement sur nos propres annotations (mode mine)', () => {
    const onChangeFilterMode = vi.fn();
    render(<AnnotationFilterPill filterMode="all" onChangeFilterMode={onChangeFilterMode} />);

    fireEvent.click(screen.getByRole('radio', { name: /mes annotations/i }));

    expect(onChangeFilterMode).toHaveBeenCalledWith('mine');
  });

  it('affiche le libellé incrusté « Annotations » par défaut et permet de le masquer', () => {
    const { rerender } = render(
      <AnnotationFilterPill filterMode="all" onChangeFilterMode={() => {}} />
    );
    expect(screen.getByText('Annotations')).toBeTruthy();

    rerender(
      <AnnotationFilterPill filterMode="all" onChangeFilterMode={() => {}} showLabel={false} />
    );
    expect(screen.queryByText('Annotations')).toBeNull();
  });
});
