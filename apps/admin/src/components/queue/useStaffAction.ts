'use client';

import { useState, useCallback } from 'react';
import { toast } from '@qoe/ui/toast';

// Exécuteur d'action staff (lot 2) : loading par identifiant + toasts +
// extraction du message d'erreur — le boilerplate `run` recopié dans chaque
// file (reports, abuse, appeals, incidents, support).
// Usage : const { loadingId, run } = useStaffAction<string>();
//   await run(item.id, () => decideXAction({...}), { ok: 'Fait', });
// `ok` accepte une chaîne ou une fonction du résultat (message variable).
export function useStaffAction<TId extends string | number>() {
  const [loadingId, setLoadingId] = useState<TId | null>(null);

  const run = useCallback(
    async <TRes extends { ok: boolean; error?: unknown }>(
      id: TId,
      fn: () => Promise<TRes>,
      messages: { ok: string | ((res: TRes) => string) }
    ): Promise<TRes | null> => {
      setLoadingId(id);
      try {
        const res = await fn();
        if (res.ok) {
          toast.success(typeof messages.ok === 'function' ? messages.ok(res) : messages.ok);
          return res;
        }
        const msg =
          typeof res.error === 'string'
            ? res.error
            : ((res.error as { message?: string } | undefined)?.message ?? 'Action impossible');
        toast.error(msg);
        return null;
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : 'Action impossible');
        return null;
      } finally {
        setLoadingId(null);
      }
    },
    []
  );

  return { loadingId, run };
}

// errorMessage extrait un message lisible d'un résultat safeAction (pour
// les cas où l'appelant gère lui-même le toast).
export function actionErrorMessage(res: { error?: unknown }): string {
  if (typeof res.error === 'string') return res.error;
  return (res.error as { message?: string } | undefined)?.message ?? 'Action impossible';
}
