// @vitest-environment jsdom
// =====================================================================
// 🧪 useServerState — l'état local suit la charge serveur rafraîchie
// =====================================================================
// Le défaut mesuré (R164) : `useState(initialItems)` ne se réinitialise jamais.
// Après `revalidatePath` + `router.refresh()`, le serveur renvoyait bien de
// nouvelles props — que l'écran ignorait. D'où cinq `window.location.reload()`
// qui jetaient filtres, recherche et position pour relire la même page.
// =====================================================================

import React from 'react';
import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

import { useServerState } from '../use-server-state';

function Counter({ items }: { items: string[] }) {
  const [local, setLocal] = useServerState(items);
  return (
    <div>
      <span data-testid="value">{local.join(',')}</span>
      <button type="button" onClick={() => setLocal(['local'])}>
        éditer
      </button>
    </div>
  );
}

describe('useServerState', () => {
  it('garde la modification locale tant que le serveur ne dit rien de neuf', () => {
    const { rerender } = render(<Counter items={['a', 'b']} />);
    fireEvent.click(screen.getByRole('button', { name: 'éditer' }));
    expect(screen.getByTestId('value')).toHaveTextContent('local');

    // Même charge serveur (nouvelle référence, même contenu) : rien à réaligner.
    rerender(<Counter items={['a', 'b']} />);
    expect(screen.getByTestId('value')).toHaveTextContent('local');
  });

  it('se réaligne sur la charge serveur quand elle change', () => {
    const { rerender } = render(<Counter items={['a', 'b']} />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'éditer' }));
    });

    rerender(<Counter items={['a', 'b', 'c']} />);
    expect(screen.getByTestId('value')).toHaveTextContent('a,b,c');
  });
});
