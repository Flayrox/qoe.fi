// =====================================================================
// 🧪 useConfirmAction — une seule action en attente, callbacks stables
// =====================================================================
// Le hook remplace `window.confirm` : il garde l'action destructive dans
// l'état du composant, qui rend `<ConfirmDialog>` une seule fois. On vérifie
// son contrat réel — ouverture, remplacement, fermeture — et la stabilité des
// callbacks, pour ne pas re-rendre les écrans à chaque confirmation.
// =====================================================================

import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import type { ConfirmAction } from '@qoe/ui/confirm-dialog';

import { useConfirmAction } from '../use-confirm-action';

function action(title: string): ConfirmAction {
  return {
    title,
    description: `Conséquence de ${title}`,
    confirmLabel: 'Confirmer',
    onConfirm: () => undefined,
  };
}

describe('useConfirmAction', () => {
  it('n’a aucune action ouverte au départ', () => {
    const { result } = renderHook(() => useConfirmAction());

    expect(result.current.action).toBeNull();
  });

  it('ouvre, remplace puis referme l’action en attente', () => {
    const { result } = renderHook(() => useConfirmAction());
    const first = action('Supprimer A');
    const second = action('Supprimer B');

    act(() => result.current.requestConfirm(first));
    expect(result.current.action).toBe(first);

    act(() => result.current.requestConfirm(second));
    expect(result.current.action).toBe(second);

    act(() => result.current.closeConfirm());
    expect(result.current.action).toBeNull();
  });

  it('garde les callbacks stables entre deux rendus', () => {
    const { result, rerender } = renderHook(() => useConfirmAction());
    const { requestConfirm, closeConfirm } = result.current;

    rerender();

    expect(result.current.requestConfirm).toBe(requestConfirm);
    expect(result.current.closeConfirm).toBe(closeConfirm);
  });
});
