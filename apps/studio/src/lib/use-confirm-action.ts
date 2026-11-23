'use client';

import { useCallback, useState } from 'react';

import type { ConfirmAction } from '@qoe/ui/confirm-dialog';

/**
 * Confirmation d'action destructive, sans `window.confirm`.
 *
 * Le composant rend une seule fois `<ConfirmDialog action={action} onClose={closeConfirm} />`
 * et appelle `requestConfirm(...)` au lieu d'ouvrir un dialogue natif bloquant : le
 * dialogue porte l'attente, l'échec (toast) et le focus, au lieu de le réimplémenter
 * écran par écran.
 */
export function useConfirmAction() {
  const [action, setAction] = useState<ConfirmAction | null>(null);
  const requestConfirm = useCallback((next: ConfirmAction) => setAction(next), []);
  const closeConfirm = useCallback(() => setAction(null), []);

  return { action, requestConfirm, closeConfirm };
}
